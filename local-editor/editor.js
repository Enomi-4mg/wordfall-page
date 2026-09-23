import {
  GENRE_LABELS,
  GENRE_ORDER,
  SUPPORTED_LANGUAGES,
  VALID_LEVELS,
  getGenreLabel,
  normalizeWord,
  serializeWords,
  validateWord
} from "../shared/words.js?v=examples-links-v2";
import { fitTextList } from "../shared/fit-text.js";

const WIKIPEDIA_LANGS = new Set(["ja", "en", "zh", "ko", "fr", "de", "it"]);
const HISTORY_MERGE_WINDOW = 700;

const state = {
  words: [],
  selectedId: null,
  selectedDraftId: null,
  draft: null,
  activeLanguages: new Set(["ja"]),
  activeGenres: new Set(),
  activeLevels: new Set(),
  descFilter: "all",
  createdFrom: "",
  createdTo: "",
  sortBy: "lang",
  sortDirection: "asc",
  query: "",
  dirtyLangs: new Set(),
  newWordIds: new Set(),
  savedTextByLang: new Map(),
  lastLang: "ja",
  directoryHandle: null,
  linksPanelOpen: false,
  history: {
    undo: [],
    redo: [],
    applying: false,
    mergeLabel: "",
    mergeAt: 0
  }
};

const dom = {
  newButton: document.getElementById("newButton"),
  searchInput: document.getElementById("searchInput"),
  filterButton: document.getElementById("filterButton"),
  filterCount: document.getElementById("filterCount"),
  filterPanel: document.getElementById("filterPanel"),
  resetFiltersButton: document.getElementById("resetFiltersButton"),
  sortSelect: document.getElementById("sortSelect"),
  sortDirectionButton: document.getElementById("sortDirectionButton"),
  languageFilters: document.getElementById("languageFilters"),
  genreFilters: document.getElementById("genreFilters"),
  levelFilters: document.getElementById("levelFilters"),
  createdFromInput: document.getElementById("createdFromInput"),
  createdToInput: document.getElementById("createdToInput"),
  wordList: document.getElementById("wordList"),
  formMode: document.getElementById("formMode"),
  formTitle: document.getElementById("formTitle"),
  discardButton: document.getElementById("discardButton"),
  deleteButton: document.getElementById("deleteButton"),
  wordForm: document.getElementById("wordForm"),
  nameInput: document.getElementById("nameInput"),
  readingInput: document.getElementById("readingInput"),
  descInput: document.getElementById("descInput"),
  langSelect: document.getElementById("langSelect"),
  lvSelect: document.getElementById("lvSelect"),
  genreSelect: document.getElementById("genreSelect"),
  createdAtInput: document.getElementById("createdAtInput"),
  idInput: document.getElementById("idInput"),
  usageList: document.getElementById("usageList"),
  addUsageButton: document.getElementById("addUsageButton"),
  linksEditorToggle: document.getElementById("linksEditorToggle"),
  linksEditorPanel: document.getElementById("linksEditorPanel"),
  siteLinkList: document.getElementById("siteLinkList"),
  addSiteButton: document.getElementById("addSiteButton"),
  linksDoneButton: document.getElementById("linksDoneButton"),
  validationMessages: document.getElementById("validationMessages"),
  dirtyStatus: document.getElementById("dirtyStatus"),
  undoButton: document.getElementById("undoButton"),
  redoButton: document.getElementById("redoButton"),
  checkWikipediaButton: document.getElementById("checkWikipediaButton"),
  chooseFolderButton: document.getElementById("chooseFolderButton"),
  saveButton: document.getElementById("saveButton")
};

async function loadAllWords() {
  const loaded = [];
  for (const lang of SUPPORTED_LANGUAGES) {
    const response = await fetch(`../${lang.file}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${lang.file}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`${lang.file} must contain an array.`);
    const normalized = data.map(normalizeWord).filter(Boolean);
    state.savedTextByLang.set(lang.code, serializeWords(normalized, lang.code));
    data.forEach((item) => {
      const word = ensureEditableWord(normalizeWord(item));
      if (!word) return;
      if (!item.id || item.id !== word.id) markDirty(word.lang);
      loaded.push(word);
    });
  }
  state.words = loaded;
  SUPPORTED_LANGUAGES.forEach((lang) => refreshDirtyLang(lang.code));
}

function renderLanguageOptions() {
  dom.langSelect.innerHTML = SUPPORTED_LANGUAGES
    .map((lang) => `<option value="${lang.code}">${lang.code} - ${lang.label}</option>`)
    .join("");
  dom.languageFilters.innerHTML = SUPPORTED_LANGUAGES
    .map((lang) => filterOptionMarkup("language", lang.code, `${lang.code} · ${lang.label}`, state.activeLanguages.has(lang.code)))
    .join("");
}

function renderGenreOptions() {
  dom.genreSelect.innerHTML = [
    '<option value="">-</option>',
    ...GENRE_ORDER.map((genre) => `<option value="${genre}">${GENRE_LABELS[genre]}</option>`)
  ].join("");
  dom.genreFilters.innerHTML = GENRE_ORDER
    .map((genre) => filterOptionMarkup("genre", genre, GENRE_LABELS[genre], state.activeGenres.has(genre)))
    .join("");
  dom.levelFilters.innerHTML = [...VALID_LEVELS]
    .sort((a, b) => a - b)
    .map((level) => filterOptionMarkup("level", String(level), `Lv ${level}`, state.activeLevels.has(level)))
    .join("");
}

function filterOptionMarkup(group, value, label, checked) {
  return `<label class="check-option"><input type="checkbox" data-filter-group="${group}" value="${escapeAttribute(value)}"${checked ? " checked" : ""}><span>${escapeHtml(label)}</span></label>`;
}

function ensureGenreOption(genre) {
  [...dom.genreSelect.querySelectorAll("option[data-custom-genre]")].forEach((option) => option.remove());
  if (!genre || GENRE_ORDER.includes(genre)) return;
  const option = document.createElement("option");
  option.value = genre;
  option.textContent = `${genre} (unsupported genre)`;
  option.dataset.customGenre = "true";
  dom.genreSelect.appendChild(option);
}

function getCurrentWord() {
  if (!state.selectedId) return null;
  return state.words.find((word) => word.id === state.selectedId) || null;
}

function getEditableWord() {
  return getCurrentWord() || (state.selectedDraftId ? state.draft : null);
}

function getFilteredWords() {
  const query = state.query.toLowerCase();
  return state.words
    .filter((word) => state.activeLanguages.has(word.lang))
    .filter((word) => !state.activeGenres.size || state.activeGenres.has(word.genre))
    .filter((word) => !state.activeLevels.size || state.activeLevels.has(Number(word.lv)))
    .filter((word) => state.descFilter === "all"
      || (state.descFilter === "has" ? Boolean(word.desc) : !word.desc))
    .filter((word) => !state.createdFrom || (word.createdAt && word.createdAt >= state.createdFrom))
    .filter((word) => !state.createdTo || (word.createdAt && word.createdAt <= state.createdTo))
    .filter((word) => {
      if (!query) return true;
      const usage = (word.usageExamples || []).flatMap((item) => [item.example, item.meaning]);
      const links = (word.links?.custom || []).flatMap((item) => [item.label, item.url]);
      return [word.name, word.reading, word.desc, ...usage, ...links]
        .some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort((a, b) => compareWords(a, b));
}

function compareWords(a, b) {
  let result = 0;
  if (state.sortBy === "name") {
    result = a.name.localeCompare(b.name, a.lang);
  } else if (state.sortBy === "genre") {
    const genreA = GENRE_ORDER.indexOf(a.genre);
    const genreB = GENRE_ORDER.indexOf(b.genre);
    result = (genreA < 0 ? GENRE_ORDER.length : genreA) - (genreB < 0 ? GENRE_ORDER.length : genreB);
    if (!result) result = (a.genre || "￿").localeCompare(b.genre || "￿", a.lang);
  } else if (state.sortBy === "lv") {
    result = (a.lv ?? 99) - (b.lv ?? 99);
  } else if (state.sortBy === "createdAt") {
    const dateA = a.createdAt || "￿";
    const dateB = b.createdAt || "￿";
    result = dateA.localeCompare(dateB);
  } else {
    result = a.lang.localeCompare(b.lang);
  }
  if (!result) result = a.name.localeCompare(b.name, a.lang);
  return state.sortDirection === "asc" ? result : -result;
}

function renderList() {
  const words = getFilteredWords();
  if (!words.length) {
    dom.wordList.innerHTML = '<p class="word-row">No words found.</p>';
    updateFilterSummary(0);
    return;
  }
  dom.wordList.innerHTML = words.map((word) => {
    const validation = validateWord(word);
    const hasWarning = validation.warnings.length || validation.errors.length;
    const usageCount = word.usageExamples?.length || 0;
    const linkCount = [word.links?.wikipedia?.enabled ? 1 : 0, ...(word.links?.custom || []).map((item) => item.enabled ? 1 : 0)]
      .reduce((total, value) => total + value, 0);
    return `
      <button class="word-row ${word.id === state.selectedId ? "is-active" : ""}" type="button" data-id="${escapeAttribute(word.id)}">
        <span class="word-name">${escapeHtml(word.name)} ${hasWarning ? '<span class="warning-dot">!</span>' : ""}</span>
        <span class="word-meta">${word.lang} / ${getGenreLabel(word.genre)} / Lv ${word.lv ?? "-"} · ${usageCount}例 · ${linkCount} links</span>
        <span class="word-preview">${escapeHtml(word.desc)}</span>
      </button>
    `;
  }).join("");
  fitTextList([...dom.wordList.querySelectorAll(".word-name")], 13);
  updateFilterSummary(words.length);
}

function updateFilterSummary(resultCount = getFilteredWords().length) {
  const total = state.words.length;
  const activeCount = (state.activeGenres.size ? 1 : 0)
    + (state.activeLevels.size ? 1 : 0)
    + (state.descFilter !== "all" ? 1 : 0)
    + (state.createdFrom || state.createdTo ? 1 : 0)
    + (state.activeLanguages.size !== 1 || !state.activeLanguages.has("ja") ? 1 : 0);
  dom.filterCount.textContent = activeCount ? `${resultCount}/${total}` : "全件";
}

function selectWord(id) {
  state.selectedId = id;
  state.selectedDraftId = null;
  state.draft = null;
  breakHistoryMerge();
  const word = getCurrentWord();
  if (!word) return;
  fillForm(word, "Edit");
  renderList();
}

function fillForm(word, mode) {
  dom.formMode.textContent = mode;
  dom.formTitle.textContent = word.name || "新しい語";
  dom.idInput.value = word.id || "";
  dom.nameInput.value = word.name || "";
  dom.readingInput.value = word.reading || "";
  dom.descInput.value = word.desc || "";
  dom.langSelect.value = word.lang || state.lastLang;
  dom.lvSelect.value = word.lv || "";
  ensureGenreOption(word.genre);
  dom.genreSelect.value = word.genre || "";
  dom.createdAtInput.value = word.createdAt || "";
  dom.deleteButton.disabled = mode === "New";
  renderUsageExamples(word);
  renderSiteLinks(word);
  updateLinksPanel();
  updateDiscardButton();
  renderValidation();
}

function startNewWord() {
  breakHistoryMerge();
  const draftId = `draft-${Date.now()}`;
  state.selectedId = null;
  state.selectedDraftId = draftId;
  state.draft = {
    id: draftId,
    createdAt: getLocalDate(),
    name: "",
    reading: "",
    desc: "",
    lang: state.lastLang,
    usageExamples: [],
    links: createDefaultLinks()
  };
  fillForm(state.draft, "New");
}

function readFormWord() {
  const base = getEditableWord() || {};
  const id = dom.idInput.value || state.selectedDraftId || base.id || "";
  const raw = {
    ...base,
    id,
    createdAt: dom.createdAtInput.value,
    name: dom.nameInput.value,
    reading: dom.readingInput.value,
    desc: dom.descInput.value,
    lang: dom.langSelect.value,
    lv: dom.lvSelect.value,
    genre: dom.genreSelect.value,
    usageExamples: base.usageExamples || [],
    links: base.links || createDefaultLinks()
  };
  const normalized = normalizeWord(raw);
  return normalized || {
    ...raw,
    id,
    name: String(raw.name || "").trim(),
    reading: String(raw.reading || "").trim(),
    desc: String(raw.desc || "").trim(),
    lang: raw.lang,
    usageExamples: raw.usageExamples || [],
    links: raw.links || createDefaultLinks()
  };
}

function applyFormChange() {
  const next = readFormWord();
  state.lastLang = next.lang || state.lastLang;
  const targetId = state.selectedDraftId || state.selectedId;
  if (!targetId) return;
  commitMutation(`word-edit:${targetId}`, () => {
    if (state.selectedDraftId) {
      state.draft = {
        ...state.draft,
        ...next,
        id: state.selectedDraftId,
        createdAt: state.draft.createdAt || getLocalDate()
      };
      if (!next.name) return;
      const created = {
        ...state.draft,
        ...next,
        id: crypto.randomUUID(),
        createdAt: state.draft.createdAt || getLocalDate(),
        links: next.links || createDefaultLinks(),
        usageExamples: next.usageExamples || []
      };
      state.words.push(created);
      state.selectedId = created.id;
      state.selectedDraftId = null;
      state.draft = null;
      state.newWordIds.add(created.id);
      markDirty(created.lang);
      syncCreatedWordUi(created);
    } else {
      const index = state.words.findIndex((item) => item.id === state.selectedId);
      if (index < 0) return;
      const previousLang = state.words[index].lang;
      state.words[index] = {
        ...state.words[index],
        ...next,
        id: state.selectedId,
        createdAt: state.words[index].createdAt || next.createdAt || getLocalDate(),
        links: next.links || createDefaultLinks(),
        usageExamples: next.usageExamples || []
      };
      markDirty(previousLang);
      markDirty(next.lang);
    }
  }, { merge: true });
  dom.formTitle.textContent = next.name || "新しい語";
  renderValidation();
  renderList();
  updateDirtyStatus();
}

function updateEditableWord(label, mutator, options = {}) {
  const word = getEditableWord();
  if (!word) return;
  const previousLang = word.lang;
  commitMutation(label, () => {
    mutator(word);
    if (state.selectedId) {
      markDirty(previousLang);
      markDirty(word.lang);
    }
  }, options);
  renderValidation();
  renderList();
  updateDirtyStatus();
}

function renderUsageExamples(word) {
  const examples = Array.isArray(word.usageExamples) ? word.usageExamples : [];
  if (!examples.length) {
    dom.usageList.innerHTML = '<p class="empty-editor-note">まだ用法用例がありません。</p>';
    return;
  }
  dom.usageList.innerHTML = examples.map((item, index) => `
    <div class="usage-row" data-usage-index="${index}">
      <div class="usage-row-header">
        <span class="usage-number">${index + 1}</span>
        <button class="icon-button compact danger-icon" type="button" data-action="delete-usage" aria-label="用法用例を削除" title="削除">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      <label><span>用例</span><input class="control-input" data-usage-field="example" value="${escapeAttribute(item.example)}" placeholder="A〜〜"></label>
      <label><span>意味</span><textarea class="control-input usage-meaning" data-usage-field="meaning" placeholder="意味">${escapeHtml(item.meaning)}</textarea></label>
    </div>
  `).join("");
  refreshIcons();
}

function addUsageExample() {
  updateEditableWord("usage-add", (word) => {
    word.usageExamples ||= [];
    word.usageExamples.push({ id: crypto.randomUUID(), example: "", meaning: "" });
  });
  renderUsageExamples(getEditableWord() || {});
  focusLastUsageExample();
}

function focusLastUsageExample() {
  const fields = dom.usageList.querySelectorAll('[data-usage-field="example"]');
  fields[fields.length - 1]?.focus();
}

function deleteUsageExample(row) {
  const index = Number(row.dataset.usageIndex);
  if (!Number.isInteger(index)) return;
  updateEditableWord("usage-delete", (word) => {
    word.usageExamples.splice(index, 1);
  });
  renderUsageExamples(getEditableWord() || {});
}

function renderSiteLinks(word) {
  const links = word.links || createDefaultLinks();
  const custom = Array.isArray(links.custom) ? links.custom : [];
  dom.siteLinkList.innerHTML = `
    <div class="site-link-row site-link-wikipedia">
      <div class="site-link-copy">
        <strong>Wikipedia</strong>
        <small>語名と言語から自動生成</small>
      </div>
      <label class="switch-label"><input type="checkbox" data-wikipedia-toggle${links.wikipedia?.enabled !== false ? " checked" : ""}><span>表示</span></label>
    </div>
    ${custom.map((item, index) => `
      <div class="site-link-row" data-site-index="${index}">
        <div class="site-link-fields">
          <label><span>表示名</span><input class="control-input" data-site-field="label" value="${escapeAttribute(item.label)}" placeholder="公式サイト"></label>
          <label><span>リンク</span><input class="control-input" data-site-field="url" value="${escapeAttribute(item.url)}" placeholder="https://example.com" inputmode="url"></label>
        </div>
        <div class="site-link-row-actions">
          <label class="switch-label"><input type="checkbox" data-site-enabled${item.enabled ? " checked" : ""}><span>表示</span></label>
          <button class="icon-button compact danger-icon" type="button" data-action="delete-site" aria-label="サイトを削除" title="削除"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    `).join("")}
  `;
  refreshIcons();
}

function addSiteLink() {
  updateEditableWord("site-add", (word) => {
    word.links ||= createDefaultLinks();
    word.links.custom ||= [];
    word.links.custom.push({ id: crypto.randomUUID(), label: "", url: "", enabled: false });
  });
  renderSiteLinks(getEditableWord() || {});
  const fields = dom.siteLinkList.querySelectorAll('[data-site-field="label"]');
  fields[fields.length - 1]?.focus();
}

function deleteSiteLink(row) {
  const index = Number(row.dataset.siteIndex);
  if (!Number.isInteger(index)) return;
  updateEditableWord("site-delete", (word) => {
    word.links.custom.splice(index, 1);
  });
  renderSiteLinks(getEditableWord() || {});
}

function updateLinksPanel() {
  dom.linksEditorPanel.hidden = !state.linksPanelOpen;
  dom.linksEditorToggle.setAttribute("aria-expanded", String(state.linksPanelOpen));
  dom.linksEditorToggle.classList.toggle("is-open", state.linksPanelOpen);
}

function toggleLinksPanel() {
  state.linksPanelOpen = !state.linksPanelOpen;
  updateLinksPanel();
}

function closeLinksPanel() {
  state.linksPanelOpen = false;
  updateLinksPanel();
}

function deleteSelectedWord() {
  const word = getCurrentWord();
  if (!word) return;
  if (!window.confirm(`${word.name} を削除しますか？`)) return;
  commitMutation("word-delete", () => {
    state.words = state.words.filter((item) => item.id !== word.id);
    state.newWordIds.delete(word.id);
    markDirty(word.lang);
    state.selectedId = null;
  });
  startNewWord();
  renderList();
  updateDirtyStatus();
}

function discardNewWord() {
  const word = getCurrentWord();
  if (!word || !state.newWordIds.has(word.id)) return;
  commitMutation("word-discard", () => {
    state.words = state.words.filter((item) => item.id !== word.id);
    state.newWordIds.delete(word.id);
    refreshDirtyLang(word.lang);
    state.selectedId = null;
  });
  startNewWord();
  renderList();
  updateDirtyStatus();
}

function renderValidation() {
  const word = readFormWord();
  const result = validateWord({
    ...word,
    id: !word.id || word.id.startsWith("draft-")
      ? "00000000-0000-4000-8000-000000000000"
      : word.id
  });
  const messages = [
    ...result.errors.map((message) => `<div class="error">${escapeHtml(message)}</div>`),
    ...result.warnings.map((message) => `<div>${escapeHtml(message)}</div>`)
  ];
  dom.validationMessages.innerHTML = messages.join("");
}

function markDirty(lang) {
  if (lang) state.dirtyLangs.add(lang);
}

function refreshDirtyLang(lang) {
  if (!lang) return;
  const current = serializeWords(state.words.filter((word) => word.lang === lang), lang);
  if (current === state.savedTextByLang.get(lang)) {
    state.dirtyLangs.delete(lang);
  } else {
    state.dirtyLangs.add(lang);
  }
}

function updateDirtyStatus() {
  const langs = [...state.dirtyLangs].sort();
  dom.dirtyStatus.textContent = langs.length ? `Unsaved: ${langs.join(", ")}` : "No changes";
  dom.saveButton.disabled = !langs.length;
  updateHistoryButtons();
}

function createDefaultLinks() {
  return { wikipedia: { enabled: true }, custom: [] };
}

function captureSnapshot() {
  return {
    words: clone(state.words),
    selectedId: state.selectedId,
    selectedDraftId: state.selectedDraftId,
    draft: clone(state.draft),
    newWordIds: [...state.newWordIds]
  };
}

function snapshotKey(snapshot) {
  return JSON.stringify(snapshot);
}

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function commitMutation(label, mutator, options = {}) {
  const before = captureSnapshot();
  mutator();
  const after = captureSnapshot();
  if (snapshotKey(before) === snapshotKey(after)) return false;
  if (!state.history.applying) {
    const now = Date.now();
    const shouldMerge = options.merge
      && state.history.mergeLabel === label
      && now - state.history.mergeAt < HISTORY_MERGE_WINDOW
      && state.history.undo.length;
    if (!shouldMerge) state.history.undo.push(before);
    state.history.redo = [];
    state.history.mergeLabel = options.merge ? label : "";
    state.history.mergeAt = now;
  }
  updateHistoryButtons();
  return true;
}

function breakHistoryMerge() {
  state.history.mergeLabel = "";
  state.history.mergeAt = 0;
}

function undo() {
  const previous = state.history.undo.pop();
  if (!previous) return;
  state.history.redo.push(captureSnapshot());
  restoreSnapshot(previous);
}

function redo() {
  const next = state.history.redo.pop();
  if (!next) return;
  state.history.undo.push(captureSnapshot());
  restoreSnapshot(next);
}

function restoreSnapshot(snapshot) {
  state.history.applying = true;
  state.words = clone(snapshot.words) || [];
  state.selectedId = snapshot.selectedId;
  state.selectedDraftId = snapshot.selectedDraftId;
  state.draft = clone(snapshot.draft);
  state.newWordIds = new Set(snapshot.newWordIds || []);
  state.history.applying = false;
  breakHistoryMerge();
  const word = getCurrentWord();
  if (word) fillForm(word, "Edit");
  else if (state.selectedDraftId && state.draft) fillForm(state.draft, "New");
  else startNewWord();
  SUPPORTED_LANGUAGES.forEach((lang) => refreshDirtyLang(lang.code));
  renderList();
  updateDirtyStatus();
}

function updateHistoryButtons() {
  dom.undoButton.disabled = !state.history.undo.length;
  dom.redoButton.disabled = !state.history.redo.length;
}

function toggleFilterPanel() {
  const open = dom.filterPanel.hidden;
  dom.filterPanel.hidden = !open;
  dom.filterButton.setAttribute("aria-expanded", String(open));
}

function resetFilters() {
  state.activeLanguages = new Set(["ja"]);
  state.activeGenres.clear();
  state.activeLevels.clear();
  state.descFilter = "all";
  state.createdFrom = "";
  state.createdTo = "";
  state.sortBy = "lang";
  state.sortDirection = "asc";
  dom.sortSelect.value = state.sortBy;
  dom.createdFromInput.value = "";
  dom.createdToInput.value = "";
  document.querySelector('input[name="descFilter"][value="all"]').checked = true;
  renderLanguageOptions();
  renderGenreOptions();
  updateSortDirectionButton();
  renderList();
}

function updateSortDirectionButton() {
  const ascending = state.sortDirection === "asc";
  dom.sortDirectionButton.setAttribute("aria-label", ascending ? "昇順" : "降順");
  dom.sortDirectionButton.title = ascending ? "昇順" : "降順";
  dom.sortDirectionButton.innerHTML = `<i data-lucide="${ascending ? "arrow-down-a-z" : "arrow-up-z-a"}"></i>`;
  refreshIcons();
}

function handleFilterChange(event) {
  const target = event.target;
  if (target.matches("[data-filter-group]")) {
    const group = target.dataset.filterGroup;
    const value = group === "level" ? Number(target.value) : target.value;
    const collection = group === "language" ? state.activeLanguages
      : group === "genre" ? state.activeGenres
        : state.activeLevels;
    if (target.checked) collection.add(value);
    else collection.delete(value);
    renderList();
    return;
  }
  if (target.name === "descFilter") {
    state.descFilter = target.value;
    renderList();
    return;
  }
  if (target === dom.createdFromInput) {
    state.createdFrom = target.value;
    renderList();
    return;
  }
  if (target === dom.createdToInput) {
    state.createdTo = target.value;
    renderList();
  }
}

async function chooseFolder() {
  if (!window.showDirectoryPicker) {
    alert("このブラウザでは元JSONの直接上書きに対応していません。Chromeなど File System Access API 対応ブラウザで開いてください。");
    return;
  }
  try {
    state.directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (error) {
    if (error.name === "AbortError") return;
    alert(`dataフォルダを開けませんでした: ${error.message}`);
  }
}

async function saveChanges() {
  const dirty = [...state.dirtyLangs].sort();
  if (!dirty.length) return;

  const invalid = state.words
    .filter((word) => dirty.includes(word.lang))
    .map((word) => ({ word, validation: validateWord(word) }))
    .filter((item) => item.validation.errors.length);
  if (invalid.length) {
    alert(`必須項目に問題があります: ${invalid[0].word.name || "(no name)"}\n${invalid[0].validation.errors.join("\n")}`);
    return;
  }

  if (!window.showDirectoryPicker) {
    alert("このブラウザでは元JSONの直接上書きに対応していません。Chromeなど File System Access API 対応ブラウザで開いてください。");
    return;
  }

  try {
    if (!state.directoryHandle) {
      await chooseFolder();
      if (!state.directoryHandle) return;
    }

    const savedTexts = new Map();
    for (const lang of dirty) {
      const words = state.words.filter((word) => word.lang === lang);
      const text = serializeWords(words, lang);
      const fileHandle = await state.directoryHandle.getFileHandle(`${lang}.json`, { create: false });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(text);
      } finally {
        await writable.close();
      }
      savedTexts.set(lang, text);
    }

    alert(dirty.map((lang) => `${lang}.json: ${state.words.filter((word) => word.lang === lang).length}件`).join("\n"));
    savedTexts.forEach((text, lang) => state.savedTextByLang.set(lang, text));
    state.dirtyLangs.clear();
    state.newWordIds.clear();
    updateDiscardButton();
    updateDirtyStatus();
  } catch (error) {
    if (error.name === "AbortError") return;
    if (error.name === "NotFoundError") {
      alert(`保存に失敗しました: ${dirty.map((lang) => `${lang}.json`).join(", ")} が見つかりません。dataフォルダを選択しているか確認してください。`);
      return;
    }
    alert(`保存に失敗しました: ${error.message}`);
  }
}

async function checkWikipedia() {
  const targets = state.words.filter((word) => WIKIPEDIA_LANGS.has(word.lang) && word.links?.wikipedia?.enabled !== false);
  if (!targets.length) {
    showStatus("確認対象のWikipediaリンクはありません。");
    return;
  }
  const buttonLabel = dom.checkWikipediaButton.querySelector("span");
  const originalLabel = buttonLabel.textContent;
  dom.checkWikipediaButton.disabled = true;
  const missingIds = [];
  let failures = 0;
  try {
    const batchSize = 6;
    for (let start = 0; start < targets.length; start += batchSize) {
      const batch = targets.slice(start, start + batchSize);
      const results = await Promise.all(batch.map(async (word) => {
        try {
          return { word, exists: await wikipediaPageExists(word) };
        } catch (error) {
          return { word, error };
        }
      }));
      results.forEach(({ word, exists, error }) => {
        if (error) failures += 1;
        else if (!exists) missingIds.push(word.id);
      });
      buttonLabel.textContent = `確認中 ${Math.min(start + batch.length, targets.length)}/${targets.length}`;
    }
  } finally {
    buttonLabel.textContent = originalLabel;
    dom.checkWikipediaButton.disabled = false;
  }
  if (missingIds.length) {
    commitMutation("wikipedia-check", () => {
      state.words.forEach((word) => {
        if (!missingIds.includes(word.id)) return;
        word.links.wikipedia.enabled = false;
        markDirty(word.lang);
      });
    });
    renderList();
    if (getCurrentWord()) fillForm(getCurrentWord(), "Edit");
    updateDirtyStatus();
  }
  showStatus(`${missingIds.length}件をWikipedia Offにしました。${failures ? ` ${failures}件は確認できませんでした。` : ""}`);
}

async function wikipediaPageExists(word) {
  const endpoint = `https://${word.lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&titles=${encodeURIComponent(word.name)}`;
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`Wikipedia API returned ${response.status}`);
  const data = await response.json();
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== "object") throw new Error("Wikipedia API response was incomplete.");
  return Object.values(pages).some((page) => page && !page.missing && page.pageid !== -1);
}

function bindEvents() {
  dom.newButton.addEventListener("click", startNewWord);
  dom.searchInput.addEventListener("input", () => {
    state.query = dom.searchInput.value;
    renderList();
  });
  dom.filterButton.addEventListener("click", toggleFilterPanel);
  dom.filterPanel.addEventListener("change", handleFilterChange);
  dom.resetFiltersButton.addEventListener("click", resetFilters);
  dom.sortSelect.addEventListener("change", () => {
    state.sortBy = dom.sortSelect.value;
    renderList();
  });
  dom.sortDirectionButton.addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    updateSortDirectionButton();
    renderList();
  });
  dom.wordList.addEventListener("click", (event) => {
    const row = event.target.closest(".word-row");
    if (row?.dataset.id) selectWord(row.dataset.id);
  });
  dom.wordForm.addEventListener("input", (event) => {
    if (event.target.matches("[data-usage-field], [data-site-field]")) return;
    applyFormChange();
  });
  dom.wordForm.addEventListener("change", (event) => {
    if (event.target.matches("[data-wikipedia-toggle], [data-site-enabled]")) return;
    applyFormChange();
  });
  dom.usageList.addEventListener("input", (event) => {
    const field = event.target.closest("[data-usage-field]");
    const row = event.target.closest("[data-usage-index]");
    if (!field || !row) return;
    const index = Number(row.dataset.usageIndex);
    updateEditableWord(`usage-edit:${index}`, (word) => {
      word.usageExamples[index][field.dataset.usageField] = field.value;
    }, { merge: true });
  });
  dom.usageList.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="delete-usage"]');
    if (button) deleteUsageExample(button.closest("[data-usage-index]"));
  });
  dom.addUsageButton.addEventListener("click", addUsageExample);
  dom.linksEditorToggle.addEventListener("click", toggleLinksPanel);
  dom.linksDoneButton.addEventListener("click", closeLinksPanel);
  dom.addSiteButton.addEventListener("click", addSiteLink);
  dom.siteLinkList.addEventListener("input", (event) => {
    const field = event.target.closest("[data-site-field]");
    const row = event.target.closest("[data-site-index]");
    if (!field || !row) return;
    const index = Number(row.dataset.siteIndex);
    updateEditableWord(`site-edit:${index}`, (word) => {
      word.links.custom[index][field.dataset.siteField] = field.value;
    }, { merge: true });
  });
  dom.siteLinkList.addEventListener("change", (event) => {
    if (event.target.matches("[data-wikipedia-toggle]")) {
      updateEditableWord("wikipedia-toggle", (word) => {
        word.links.wikipedia.enabled = event.target.checked;
      });
      return;
    }
    if (event.target.matches("[data-site-enabled]")) {
      const row = event.target.closest("[data-site-index]");
      const index = Number(row.dataset.siteIndex);
      updateEditableWord(`site-toggle:${index}`, (word) => {
        word.links.custom[index].enabled = event.target.checked;
      });
    }
  });
  dom.siteLinkList.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="delete-site"]');
    if (button) deleteSiteLink(button.closest("[data-site-index]"));
  });
  dom.discardButton.addEventListener("click", discardNewWord);
  dom.deleteButton.addEventListener("click", deleteSelectedWord);
  dom.undoButton.addEventListener("click", undo);
  dom.redoButton.addEventListener("click", redo);
  dom.checkWikipediaButton.addEventListener("click", checkWikipedia);
  dom.chooseFolderButton.addEventListener("click", chooseFolder);
  dom.saveButton.addEventListener("click", saveChanges);
  window.addEventListener("keydown", (event) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier || event.altKey) return;
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirtyLangs.size) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function init() {
  renderLanguageOptions();
  renderGenreOptions();
  bindEvents();
  updateSortDirectionButton();
  try {
    await loadAllWords();
    renderList();
    startNewWord();
  } catch (error) {
    dom.wordList.innerHTML = `<p class="word-row">${escapeHtml(error.message)}</p>`;
  }
  updateDirtyStatus();
  refreshIcons();
}

function syncCreatedWordUi(word) {
  dom.formMode.textContent = "Edit";
  dom.formTitle.textContent = word.name || "新しい語";
  dom.idInput.value = word.id;
  dom.deleteButton.disabled = false;
  updateDiscardButton();
}

function updateDiscardButton() {
  const canDiscard = Boolean(state.selectedId && state.newWordIds.has(state.selectedId));
  dom.discardButton.hidden = !canDiscard;
  dom.discardButton.disabled = !canDiscard;
}

function ensureEditableWord(word) {
  if (!word) return null;
  return word.id ? word : { ...word, id: crypto.randomUUID() };
}

function showStatus(message) {
  const status = document.createElement("div");
  status.className = "editor-toast";
  status.textContent = message;
  document.body.appendChild(status);
  window.setTimeout(() => status.remove(), 4200);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function getLocalDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

init();
