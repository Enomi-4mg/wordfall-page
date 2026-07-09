import { getGenreLabel, normalizeWord } from "./shared/words.js";

const DATA_FILE = "data/ja.json";
const FORMS_URL = "#";
const FALL_SPEED = 1;
const MAX_ACTIVE_WORDS = 30;
const DEFAULT_VOLUME = 0.35;

const state = {
  vocabulary: [],
  activeWords: [],
  selectedWord: null,
  paused: false,
  lastFrame: 0,
  lastSpawn: 0,
  statusTimer: null,
  settings: {
    volume: DEFAULT_VOLUME
  },
  audio: {
    context: null,
    gain: null,
    muted: true,
    noiseNode: null,
    lowpass: null,
    highpass: null
  }
};

const dom = {
  cascade: document.getElementById("wordCascade"),
  settingsButton: document.getElementById("settingsButton"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  settingsPanel: document.getElementById("settingsPanel"),
  soundButton: document.getElementById("soundButton"),
  infoButton: document.getElementById("infoButton"),
  infoBackdrop: document.getElementById("infoBackdrop"),
  infoDialog: document.getElementById("infoDialog"),
  closeInfoButton: document.getElementById("closeInfoButton"),
  formsLink: document.getElementById("formsLink"),
  statusMessage: document.getElementById("statusMessage"),
  volumeSlider: document.getElementById("volumeSlider"),
  volumeValue: document.getElementById("volumeValue"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  detailModal: document.getElementById("detailModal"),
  closeModalButton: document.getElementById("closeModalButton"),
  modalLevel: document.getElementById("modalLevel"),
  modalGenre: document.getElementById("modalGenre"),
  modalWord: document.getElementById("modalWord"),
  modalReading: document.getElementById("modalReading"),
  modalDesc: document.getElementById("modalDesc"),
  googleButton: document.getElementById("googleButton"),
  wikiButton: document.getElementById("wikiButton")
};

async function loadData() {
  try {
    const response = await fetch(DATA_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("JSON root must be an array.");
    state.vocabulary = data.map(normalizeWord).filter(Boolean);
    if (!state.vocabulary.length) showStatus("No words were found in data/ja.json.");
  } catch (error) {
    showStatus("Could not load data/ja.json. Start a local static server and reload.");
  }
}

function animationLoop(timestamp) {
  if (!state.lastFrame) state.lastFrame = timestamp;
  const delta = Math.min(42, timestamp - state.lastFrame);
  state.lastFrame = timestamp;

  if (!state.paused) {
    spawnWords(timestamp);
    moveWords(delta, timestamp);
  }

  requestAnimationFrame(animationLoop);
}

function spawnWords(timestamp) {
  if (!state.vocabulary.length) return;
  if (state.activeWords.length >= MAX_ACTIVE_WORDS) return;
  const spawnDelay = Math.max(80, 950 - MAX_ACTIVE_WORDS * 6);
  if (timestamp - state.lastSpawn < spawnDelay) return;
  state.lastSpawn = timestamp;
  createFloatingWord();
}

function createFloatingWord() {
  const item = state.vocabulary[Math.floor(Math.random() * state.vocabulary.length)];
  if (!item) return;

  const minSize = 10;
  const maxSize = 88;
  const size = randomBetween(minSize, maxSize);
  const sizeRatio = (size - minSize) / (maxSize - minSize);
  const depth = 0.72 + sizeRatio * 0.72 + randomBetween(-0.05, 0.05);
  const opacity = 0.14 + sizeRatio * 0.84;
  const hoverOpacity = Math.min(1, opacity + 0.18);
  const word = {
    item,
    x: randomBetween(2, 92),
    y: -60,
    speed: randomBetween(0.018, 0.09) * depth,
    size,
    phase: randomBetween(0, Math.PI * 2),
    sway: randomBetween(6, 34),
    opacity,
    depth
  };

  const el = document.createElement("button");
  el.type = "button";
  el.className = "floating-word";
  el.textContent = item.name;
  el.style.fontSize = `${size}px`;
  el.style.setProperty("--word-alpha", opacity.toFixed(3));
  el.style.setProperty("--word-hover-alpha", hoverOpacity.toFixed(3));
  el.style.zIndex = String(Math.round(depth * 10));
  el.setAttribute("aria-label", `${item.name} の詳細を開く`);
  el.addEventListener("click", () => openModal(item));
  word.el = el;
  state.activeWords.push(word);
  dom.cascade.appendChild(el);
}

function moveWords(delta, timestamp) {
  const height = window.innerHeight;
  for (let i = state.activeWords.length - 1; i >= 0; i -= 1) {
    const word = state.activeWords[i];
    word.y += delta * word.speed * FALL_SPEED;
    const sway = Math.sin(timestamp * 0.0008 + word.phase) * word.sway;
    word.el.style.transform = `translate3d(calc(${word.x}vw + ${sway}px), ${word.y}px, 0) scale(${word.depth})`;

    if (word.y > height + 90) {
      word.el.remove();
      state.activeWords.splice(i, 1);
    }
  }
}

function clearActiveWords() {
  state.activeWords.forEach((word) => word.el.remove());
  state.activeWords = [];
}

function openModal(item) {
  state.selectedWord = item;
  state.paused = true;
  dom.modalLevel.textContent = `Lv ${item.lv ?? "-"}`;
  dom.modalGenre.textContent = getGenreLabel(item.genre);
  dom.modalWord.textContent = item.name;
  dom.modalReading.textContent = item.reading || "";
  dom.modalReading.hidden = !item.reading;
  dom.modalDesc.textContent = item.desc;
  dom.modalBackdrop.classList.add("is-open");
  dom.modalBackdrop.setAttribute("aria-hidden", "false");
  dom.detailModal.focus();
  refreshIcons();
}

function closeModal() {
  dom.modalBackdrop.classList.remove("is-open");
  dom.modalBackdrop.setAttribute("aria-hidden", "true");
  state.selectedWord = null;
  state.paused = false;
}

function openInfo() {
  state.paused = true;
  dom.infoBackdrop.classList.add("is-open");
  dom.infoBackdrop.setAttribute("aria-hidden", "false");
  dom.infoButton.setAttribute("aria-expanded", "true");
  dom.infoDialog.focus();
}

function closeInfo() {
  dom.infoBackdrop.classList.remove("is-open");
  dom.infoBackdrop.setAttribute("aria-hidden", "true");
  dom.infoButton.setAttribute("aria-expanded", "false");
  if (!state.selectedWord) state.paused = false;
}

function searchSelectedWord(site) {
  if (!state.selectedWord) return;
  const query = encodeURIComponent(state.selectedWord.name);
  const url = site === "wiki"
    ? `https://www.wikipedia.org/search-redirect.php?search=${query}`
    : `https://www.google.com/search?q=${query}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openSettings() {
  dom.settingsPanel.classList.add("is-open");
  dom.settingsPanel.setAttribute("aria-hidden", "false");
  dom.settingsButton.setAttribute("aria-expanded", "true");
}

function closeSettings() {
  dom.settingsPanel.classList.remove("is-open");
  dom.settingsPanel.setAttribute("aria-hidden", "true");
  dom.settingsButton.setAttribute("aria-expanded", "false");
}

async function ensureAudioContext() {
  if (!state.audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      showStatus("Web Audio API is not supported in this browser.");
      return false;
    }
    state.audio.context = new AudioContextClass();
    state.audio.gain = state.audio.context.createGain();
    state.audio.gain.gain.value = state.audio.muted ? 0 : state.settings.volume;
    state.audio.gain.connect(state.audio.context.destination);
  }
  if (state.audio.context.state === "suspended") await state.audio.context.resume();
  return true;
}

async function toggleSound() {
  const ready = await ensureAudioContext();
  if (!ready) return;
  state.audio.muted = !state.audio.muted;
  applyVolume();
  updateSoundButton();
  if (!state.audio.muted) startAmbientNoise();
  if (state.audio.muted) stopAmbientNoise();
}

function startAmbientNoise() {
  if (!state.audio.context || state.audio.noiseNode) return;
  const ctx = state.audio.context;
  const bufferSize = 4096;
  let lastOut = 0;
  const noise = ctx.createScriptProcessor(bufferSize, 1, 1);
  const highpass = ctx.createBiquadFilter();
  const lowpass = ctx.createBiquadFilter();

  highpass.type = "highpass";
  highpass.frequency.value = 82;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 380;

  noise.onaudioprocess = (event) => {
    const output = event.outputBuffer.getChannelData(0);
    for (let i = 0; i < output.length; i += 1) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      output[i] = lastOut * 3.5;
    }
  };

  noise.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(state.audio.gain);
  state.audio.noiseNode = noise;
  state.audio.highpass = highpass;
  state.audio.lowpass = lowpass;
}

function stopAmbientNoise() {
  if (state.audio.noiseNode) {
    state.audio.noiseNode.disconnect();
    state.audio.noiseNode.onaudioprocess = null;
    state.audio.noiseNode = null;
  }
  if (state.audio.highpass) {
    state.audio.highpass.disconnect();
    state.audio.highpass = null;
  }
  if (state.audio.lowpass) {
    state.audio.lowpass.disconnect();
    state.audio.lowpass = null;
  }
}

function applyVolume() {
  if (!state.audio.gain) return;
  state.audio.gain.gain.setTargetAtTime(
    state.audio.muted ? 0 : state.settings.volume,
    state.audio.context.currentTime,
    0.03
  );
}

function updateSoundButton() {
  dom.soundButton.setAttribute("aria-pressed", String(!state.audio.muted));
  dom.soundButton.setAttribute("aria-label", state.audio.muted ? "Turn sound on" : "Turn sound off");
  dom.soundButton.innerHTML = state.audio.muted ? '<i data-lucide="volume-x"></i>' : '<i data-lucide="volume-2"></i>';
  refreshIcons();
}

function updateVolumeLabel() {
  dom.volumeValue.textContent = `${Math.round(state.settings.volume * 100)}%`;
}

function bindEvents() {
  dom.settingsButton.addEventListener("click", openSettings);
  dom.closeSettingsButton.addEventListener("click", closeSettings);
  dom.soundButton.addEventListener("click", toggleSound);
  dom.infoButton.addEventListener("click", openInfo);
  dom.closeInfoButton.addEventListener("click", closeInfo);
  dom.formsLink.addEventListener("click", (event) => {
    if (FORMS_URL === "#") {
      event.preventDefault();
      showStatus("単語投稿フォームは準備中です。");
    }
  });
  dom.volumeSlider.addEventListener("input", () => {
    state.settings.volume = Number(dom.volumeSlider.value);
    updateVolumeLabel();
    applyVolume();
  });
  dom.closeModalButton.addEventListener("click", closeModal);
  dom.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.modalBackdrop) closeModal();
  });
  dom.infoBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.infoBackdrop) closeInfo();
  });
  dom.googleButton.addEventListener("click", () => searchSelectedWord("google"));
  dom.wikiButton.addEventListener("click", () => searchSelectedWord("wiki"));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (dom.modalBackdrop.classList.contains("is-open")) closeModal();
      if (dom.infoBackdrop.classList.contains("is-open")) closeInfo();
      closeSettings();
    }
  });
  window.addEventListener("resize", clearActiveWords);
}

async function init() {
  dom.formsLink.href = FORMS_URL;
  dom.volumeSlider.value = state.settings.volume;
  updateVolumeLabel();
  updateSoundButton();
  bindEvents();
  refreshIcons();
  await loadData();
  requestAnimationFrame(animationLoop);
}

function showStatus(message) {
  dom.statusMessage.textContent = message;
  dom.statusMessage.classList.add("is-visible");
  window.clearTimeout(state.statusTimer);
  state.statusTimer = window.setTimeout(() => {
    dom.statusMessage.classList.remove("is-visible");
  }, 3800);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

init();
