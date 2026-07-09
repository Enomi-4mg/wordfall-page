import {
  GENRE_LABELS,
  GENRE_ORDER,
  SUPPORTED_LANGUAGES,
  getGenreLabel,
  normalizeWord,
  serializeWords,
  validateWord
} from "../shared/words.js";

const state = {
  words: [],
  selectedId: null,
  selectedDraftId: null,
  activeLanguages: new Set(SUPPORTED_LANGUAGES.map((lang) => lang.code)),
  sortBy: "lang",
  query: "",
  dirtyLangs: new Set(),
  lastLang: "ja",
  directoryHandle: null
};

const dom = {
  newButton: document.getElementById("newButton"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  languageChips: document.getElementById("languageChips"),
  wordList: document.getElementById("wordList"),
  formMode: document.getElementById("formMode"),
  formTitle: document.getElementById("formTitle"),
  deleteButton: document.getElementById("deleteButton"),
  wordForm: document.getElementById("wordForm"),
  nameInput: document.getElementById("nameInput"),
  readingInput: document.getElementById("readingInput"),
  descInput: document.getElementById("descInput"),
  langSelect: document.getElementById("langSelect"),
  lvSelect: document.getElementById("lvSelect"),
  genreSelect: document.getElementById("genreSelect"),
  idInput: document.getElementById("idInput"),
  validationMessages: document.getElementById("validationMessages"),
  dirtyStatus: document.getElementById("dirtyStatus"),
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
    loaded.push(...data.map((item) => ensureEditableWord(normalizeWord(item))).filter(Boolean));
  }
  state.words = loaded;
}

function renderLanguageOptions() {
  dom.langSelect.innerHTML = SUPPORTED_LANGUAGES
    .map((lang) => `<option value="${lang.code}">${lang.code} - ${lang.label}</option>`)
    .join("");
  dom.languageChips.innerHTML = SUPPORTED_LANGUAGES
    .map((lang) => `<button class="chip is-active" type="button" data-lang="${lang.code}">${lang.code}</button>`)
    .join("");
}

function renderGenreOptions() {
  dom.genreSelect.innerHTML = [
    '<option value="">-</option>',
    ...GENRE_ORDER.map((genre) => `<option value="${genre}">${GENRE_LABELS[genre]}</option>`)
  ].join("");
}

function ensureGenreOption(genre) {
  if (!genre || GENRE_ORDER.includes(genre)) return;
  const exists = [...dom.genreSelect.options].some((option) => option.value === genre);
  if (exists) return;
  const option = document.createElement("option");
  option.value = genre;
  option.textContent = `${genre} (non-standard)`;
  dom.genreSelect.appendChild(option);
}

function getCurrentWord() {
  if (!state.selectedId) return null;
  return state.words.find((word) => word.id === state.selectedId) || null;
}

function getFilteredWords() {
  const query = state.query.toLowerCase();
  return state.words
    .filter((word) => state.activeLanguages.has(word.lang))
    .filter((word) => {
      if (!query) return true;
      return [word.name, word.reading, word.desc].some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort((a, b) => compareWords(a, b));
}

function compareWords(a, b) {
  if (state.sortBy === "name") return a.name.localeCompare(b.name, a.lang);
  if (state.sortBy === "genre") {
    const genre = (a.genre || "\uffff").localeCompare(b.genre || "\uffff", a.lang);
    return genre || a.name.localeCompare(b.name, a.lang);
  }
  if (state.sortBy === "lv") {
    const level = (a.lv || 99) - (b.lv || 99);
    return level || a.name.localeCompare(b.name, a.lang);
  }
  const lang = a.lang.localeCompare(b.lang);
  return lang || a.name.localeCompare(b.name, a.lang);
}

function renderList() {
  const words = getFilteredWords();
  if (!words.length) {
    dom.wordList.innerHTML = '<p class="word-row">No words found.</p>';
    return;
  }
  dom.wordList.innerHTML = words.map((word) => {
    const validation = validateWord(word);
    const hasWarning = validation.warnings.length || validation.errors.length;
    return `
      <button class="word-row ${word.id === state.selectedId ? "is-active" : ""}" type="button" data-id="${escapeAttribute(word.id)}">
        <span class="word-name">${escapeHtml(word.name)} ${hasWarning ? '<span class="warning-dot">!</span>' : ""}</span>
        <span class="word-meta">${word.lang} / ${getGenreLabel(word.genre)} / Lv ${word.lv ?? "-"}</span>
        <span class="word-preview">${escapeHtml(word.desc)}</span>
      </button>
    `;
  }).join("");
}

function selectWord(id) {
  state.selectedId = id;
  state.selectedDraftId = null;
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
  dom.deleteButton.disabled = mode === "New";
  renderValidation();
}

function startNewWord() {
  const draftId = `draft-${Date.now()}`;
  const draft = {
    id: draftId,
    name: "",
    desc: "",
    lang: state.lastLang
  };
  state.selectedId = null;
  state.selectedDraftId = draftId;
  fillForm(draft, "New");
}

function readFormWord() {
  const id = dom.idInput.value || state.selectedDraftId || "";
  const raw = {
    id,
    name: dom.nameInput.value,
    reading: dom.readingInput.value,
    desc: dom.descInput.value,
    lang: dom.langSelect.value,
    lv: dom.lvSelect.value,
    genre: dom.genreSelect.value
  };
  const normalized = normalizeWord(raw) || {
    id,
    name: raw.name.trim(),
    desc: raw.desc.trim(),
    lang: raw.lang,
    reading: raw.reading.trim(),
    lv: raw.lv ? Number(raw.lv) : undefined,
    genre: raw.genre
  };
  return normalized;
}

function applyFormChange() {
  const word = readFormWord();
  state.lastLang = word.lang || state.lastLang;
  if (state.selectedDraftId) {
    if (!word.name) {
      renderValidation();
      return;
    }
    const created = {
      ...word,
      id: crypto.randomUUID()
    };
    state.words.push(created);
    state.selectedId = created.id;
    state.selectedDraftId = null;
    markDirty(created.lang);
  } else if (state.selectedId) {
    const index = state.words.findIndex((item) => item.id === state.selectedId);
    if (index >= 0) {
      const previousLang = state.words[index].lang;
      state.words[index] = { ...word, id: state.selectedId };
      markDirty(previousLang);
      markDirty(word.lang);
    }
  }
  renderValidation();
  renderList();
  updateDirtyStatus();
}

function deleteSelectedWord() {
  const word = getCurrentWord();
  if (!word) return;
  if (!window.confirm(`${word.name} を削除しますか？`)) return;
  state.words = state.words.filter((item) => item.id !== word.id);
  markDirty(word.lang);
  state.selectedId = null;
  startNewWord();
  renderList();
  updateDirtyStatus();
}

function renderValidation() {
  const word = readFormWord();
  const result = validateWord({
    ...word,
    id: word.id && word.id.startsWith("draft-") ? "00000000-0000-4000-8000-000000000000" : word.id
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

function updateDirtyStatus() {
  const langs = [...state.dirtyLangs].sort();
  dom.dirtyStatus.textContent = langs.length ? `Unsaved: ${langs.join(", ")}` : "No changes";
  dom.saveButton.disabled = !langs.length;
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
    alert(`必須項目に問題があります: ${invalid[0].word.name || "(no name)"}`);
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
    }

    alert(dirty.map((lang) => `${lang}.json: ${state.words.filter((word) => word.lang === lang).length}件`).join("\n"));
    state.dirtyLangs.clear();
    updateDirtyStatus();
  } catch (error) {
    if (error.name === "AbortError") return;
    alert(`保存に失敗しました: ${error.message}`);
  }
}

function bindEvents() {
  dom.newButton.addEventListener("click", startNewWord);
  dom.searchInput.addEventListener("input", () => {
    state.query = dom.searchInput.value;
    renderList();
  });
  dom.sortSelect.addEventListener("change", () => {
    state.sortBy = dom.sortSelect.value;
    renderList();
  });
  dom.languageChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const lang = chip.dataset.lang;
    if (state.activeLanguages.has(lang) && state.activeLanguages.size > 1) {
      state.activeLanguages.delete(lang);
      chip.classList.remove("is-active");
    } else {
      state.activeLanguages.add(lang);
      chip.classList.add("is-active");
    }
    renderList();
  });
  dom.wordList.addEventListener("click", (event) => {
    const row = event.target.closest(".word-row");
    if (row?.dataset.id) selectWord(row.dataset.id);
  });
  dom.wordForm.addEventListener("input", applyFormChange);
  dom.wordForm.addEventListener("change", applyFormChange);
  dom.deleteButton.addEventListener("click", deleteSelectedWord);
  dom.chooseFolderButton.addEventListener("click", chooseFolder);
  dom.saveButton.addEventListener("click", saveChanges);
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
  try {
    await loadAllWords();
    renderList();
    startNewWord();
  } catch (error) {
    dom.wordList.innerHTML = `<p class="word-row">${escapeHtml(error.message)}</p>`;
  }
  updateDirtyStatus();
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

function ensureEditableWord(word) {
  if (!word) return null;
  return word.id ? word : { ...word, id: crypto.randomUUID() };
}

init();
