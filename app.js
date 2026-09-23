import { getGenreLabel, isDisplayReadyWord, isValidHttpUrl, normalizeWord } from "./shared/words.js?v=examples-links-v2";
import { fitTextToWidth } from "./shared/fit-text.js";

const DATA_FILE = "data/ja.json";
const AUDIO_FILE = "audio/Nature_river_Track3_loop_128.mp3";
const FORMS_URL = "#";
const DEFAULT_VOLUME = 0.1;
const AUDIO_FADE_DURATION = 0.8;
const DEFAULT_SPEED = 1.0;
const SPEED_BASELINE_MULTIPLIER = 1.5;
const DEFAULT_DENSITY = 30;
const SPEED_RANGE = { min: 0.35, max: 5.0 };
const DENSITY_RANGE = { min: 6, max: 240 };
const WORD_START_Y = -60;
const WORD_END_MARGIN = 90;
const SWAY_OMEGA = 0.0008;
const SWAY_PERIOD_MS = (Math.PI * 2) / SWAY_OMEGA;
const SWAY_KEYFRAME_COUNT = 16;
const SWAY_SAMPLES = Object.freeze(Array.from(
  { length: SWAY_KEYFRAME_COUNT + 1 },
  (_, index) => Math.sin((index / SWAY_KEYFRAME_COUNT) * Math.PI * 2)
));
const VOLUME_STORAGE_KEY = "wordfall.volume";
const AUDIO_SOURCE_STORAGE_KEY = "wordfall.audioSource";
const FONT_STORAGE_KEY = "wordfall.font";
const SPEED_STORAGE_KEY = "wordfall.speed.v2";
const LEGACY_SPEED_STORAGE_KEY = "wordfall.speed";
const DENSITY_STORAGE_KEY = "wordfall.density";
const MOTION_STORAGE_KEY = "wordfall.motion";
const SHOW_ALL_WORDS_STORAGE_KEY = "wordfall.showAllWords";
const COLOR_BY_DESCRIPTION_STORAGE_KEY = "wordfall.colorByDescription";
const WRITING_DIRECTION_STORAGE_KEY = "wordfall.writingDirection";
const FALL_DIRECTION_STORAGE_KEY = "wordfall.fallDirection";
// Local mode is useful for diagnostics; production exposes the same controls behind an explicit toggle.
const IS_LOCAL_DEV = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
  || window.location.protocol === "file:";
const AUDIO_SOURCES = new Set(["generated", "file"]);
const FONTS = new Set(["mincho", "gen"]);
const DEFAULT_FONT = "mincho";
const MOTIONS = new Set(["sway", "straight"]);
const DEFAULT_MOTION = "sway";
const DIRECTIONS = new Set(["up", "right", "down", "left"]);
const DEFAULT_WRITING_DIRECTION = "right";
const DEFAULT_FALL_DIRECTION = "down";
const SPAWN_LANE_COUNT = 10;
const SPAWN_X_MIN = 2;
const SPAWN_X_MAX = 92;
// Parallax layers (遠景 / 中景 / 前景). Each layer owns a disjoint band of size,
// fall speed (px/ms), and sway amplitude, so nearer words are always larger,
// faster, and swing wider than farther ones. Background fills, foreground accents.
const DEPTH_LAYERS = [
  { weight: 0.45, sizeRatio: [0, 0.28], speed: [0.016, 0.028], sway: [5, 12] },
  { weight: 0.35, sizeRatio: [0.36, 0.64], speed: [0.032, 0.052], sway: [10, 22] },
  { weight: 0.2, sizeRatio: [0.72, 1], speed: [0.058, 0.088], sway: [16, 30] }
];
// Subtle magnetism so words are easier to catch under the cursor.
// ATTRACT_MARGIN extends the hit area outward from the whole word box (not just its center).
const ATTRACT_MARGIN = 64;
const ATTRACT_PULL = 16;
const ATTRACT_EASE = 0.2;
const WIKIPEDIA_LANGS = new Set(["ja", "en", "zh", "ko", "fr", "de", "it"]);

const state = {
  vocabulary: [],
  allWords: [],
  wordBag: [],
  activeWords: [],
  selectedWord: null,
  paused: false,
  lastSpawn: 0,
  lastMagnetFrame: 0,
  magnetSettling: false,
  spawnLanes: [],
  statusTimer: null,
  resizeTimer: null,
  animationFrame: 0,
  animationTimer: 0,
  speedUpdateFrame: 0,
  focusReturnTarget: null,
  pointer: {
    x: 0,
    y: 0,
    active: false,
    fine: typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  },
  // Cached viewport size so the frame loop never queries window metrics mid-frame.
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight
  },
  settings: {
    volume: loadStoredVolume(),
    audioSource: loadStoredAudioSource(),
    font: loadStoredFont(),
    speed: loadStoredSpeed(),
    density: loadStoredDensity(),
    motion: loadStoredMotion(),
    writingDirection: loadStoredDirection(WRITING_DIRECTION_STORAGE_KEY, DEFAULT_WRITING_DIRECTION),
    fallDirection: loadStoredDirection(FALL_DIRECTION_STORAGE_KEY, DEFAULT_FALL_DIRECTION),
    showAllWords: loadStoredShowAllWords(),
    colorByDescription: loadStoredColorByDescription()
  },
  audio: {
    context: null,
    gain: null,
    muted: false,
    noiseNode: null,
    lowpass: null,
    highpass: null,
    file: null,
    ambientStopTimer: 0,
    fileFadeTimer: 0
  }
};

const dom = {
  cascade: document.getElementById("wordCascade"),
  topControls: document.querySelector(".top-controls"),
  settingsButton: document.getElementById("settingsButton"),
  settingsPanel: document.getElementById("settingsPanel"),
  soundButton: document.getElementById("soundButton"),
  infoButton: document.getElementById("infoButton"),
  infoDialog: document.getElementById("infoDialog"),
  formsLink: document.getElementById("formsLink"),
  statusMessage: document.getElementById("statusMessage"),
  audioSourceSelect: document.getElementById("audioSourceSelect"),
  fontSelect: document.getElementById("fontSelect"),
  motionSelect: document.getElementById("motionSelect"),
  writingDirectionSelect: document.getElementById("writingDirectionSelect"),
  fallDirectionSelect: document.getElementById("fallDirectionSelect"),
  devSettingsToggle: document.getElementById("devSettingsToggle"),
  devSettings: document.getElementById("devSettings"),
  showAllWordsCheckbox: document.getElementById("showAllWordsCheckbox"),
  colorByDescriptionCheckbox: document.getElementById("colorByDescriptionCheckbox"),
  speedSlider: document.getElementById("speedSlider"),
  speedValue: document.getElementById("speedValue"),
  densitySlider: document.getElementById("densitySlider"),
  densityValue: document.getElementById("densityValue"),
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
  modalUsage: document.getElementById("modalUsage"),
  modalUsageList: document.getElementById("modalUsageList"),
  modalSiteLinks: document.getElementById("modalSiteLinks"),
  googleButton: document.getElementById("googleButton"),
};

const floatingWordsByElement = new WeakMap();
const wordSizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => {
    for (const entry of entries) {
      const word = floatingWordsByElement.get(entry.target);
      if (!word) continue;
      word.w = entry.contentRect.width;
      word.h = entry.contentRect.height;
      if (fitFloatingWordToViewport(word)) continue;
      positionWordHorizontally(word);
    }
  })
  : null;

async function loadData() {
  try {
    const response = await fetch(DATA_FILE, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("JSON root must be an array.");
    state.allWords = data.map(normalizeWord).filter(Boolean);
    applyWordFilter();
    const displayReadyCount = state.allWords.filter(isDisplayReadyWord).length;
    const hiddenCount = state.allWords.length - displayReadyCount;
    if (!state.vocabulary.length) {
      showStatus(`No display-ready words were found in ${DATA_FILE}. Only words with desc are shown.`, { loadNotice: true });
    } else if (!isShowingAllWords() && hiddenCount > displayReadyCount * 2) {
      showStatus(`${displayReadyCount} words with desc are shown. ${hiddenCount} words without desc are hidden.`, { loadNotice: true });
    }
  } catch (error) {
    showStatus(`Could not load ${DATA_FILE}. Start a local static server and reload.`);
  }
}

function isShowingAllWords() {
  return state.settings.showAllWords;
}

function applyWordFilter() {
  state.vocabulary = isShowingAllWords()
    ? state.allWords
    : state.allWords.filter(isDisplayReadyWord);
  state.wordBag = [];
}

// Shuffle-bag draw: every word appears exactly once per cycle, so the whole
// vocabulary surfaces uniformly instead of pure random-with-replacement.
function nextVocabularyItem() {
  const words = state.vocabulary;
  if (!words.length) return null;
  if (!state.wordBag.length) {
    state.wordBag = Array.from({ length: words.length }, (_, index) => index);
    shuffleInPlace(state.wordBag);
  }
  return words[state.wordBag.pop()];
}

function animationLoop(timestamp) {
  state.animationFrame = 0;
  if (state.paused || document.hidden) return;
  spawnWords(timestamp);
  if (state.pointer.fine && (state.pointer.active || state.magnetSettling)) {
    updateMagnetism(timestamp);
  }
  scheduleAnimationTick(timestamp);
}

// Falling and swaying stay on the compositor. Wake the main thread only when a
// word is due to spawn or pointer magnetism needs another sample.
function requestAnimationTick() {
  if (state.paused || document.hidden) return;
  if (state.animationTimer) {
    window.clearTimeout(state.animationTimer);
    state.animationTimer = 0;
  }
  if (state.animationFrame) return;
  state.animationFrame = requestAnimationFrame(animationLoop);
}

function cancelAnimationTick() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  if (state.animationTimer) window.clearTimeout(state.animationTimer);
  state.animationFrame = 0;
  state.animationTimer = 0;
}

function scheduleAnimationTick(timestamp = performance.now()) {
  if (state.paused || document.hidden || !state.vocabulary.length) return;
  if (state.activeWords.length > 0 && state.pointer.fine && (state.pointer.active || state.magnetSettling)) {
    requestAnimationTick();
    return;
  }
  if (state.activeWords.length >= state.settings.density || state.animationTimer) return;
  const wait = Math.max(0, getSpawnDelay() - (timestamp - state.lastSpawn));
  if (wait <= 17) {
    requestAnimationTick();
    return;
  }
  state.animationTimer = window.setTimeout(() => {
    state.animationTimer = 0;
    requestAnimationTick();
  }, wait);
}

function getSpawnDelay() {
  return Math.max(24, Math.max(80, 950 - state.settings.density * 6) / Math.max(1, getEffectiveSpeedMultiplier()));
}

function getEffectiveSpeedMultiplier() {
  return state.settings.speed * SPEED_BASELINE_MULTIPLIER;
}

function spawnWords(timestamp) {
  if (!state.vocabulary.length) return;
  const maxWords = state.settings.density;
  if (state.activeWords.length >= maxWords) return;
  const spawnDelay = getSpawnDelay();
  const due = Math.floor((timestamp - state.lastSpawn) / spawnDelay);
  if (due < 1) return;
  const count = Math.min(due, 4, maxWords - state.activeWords.length);
  for (let index = 0; index < count; index += 1) createFloatingWord();
  state.lastSpawn += count * spawnDelay;
  // A suspended frame should not turn into a large catch-up burst.
  if (timestamp - state.lastSpawn > spawnDelay * 4) state.lastSpawn = timestamp;
}

function createFloatingWord() {
  const item = nextVocabularyItem();
  if (!item) return;

  const { min: minSize, max: maxSize } = getResponsiveWordSizeRange();
  const layer = pickDepthLayer();
  const sizeRatio = randomBetween(layer.sizeRatio[0], layer.sizeRatio[1]);
  const size = minSize + sizeRatio * (maxSize - minSize);
  // Keep the keyframes compact and stable when the word is handed to the compositor.
  const depth = Math.round((0.72 + sizeRatio * 0.72 + randomBetween(-0.05, 0.05)) * 1000) / 1000;
  // Bias the low end up (ease-out) with a lifted floor so small/far words stay readable
  // instead of fading too thin, while large words still reach near-full opacity.
  const opacity = 0.24 + Math.pow(sizeRatio, 0.7) * 0.74;
  const hoverOpacity = Math.min(1, opacity + 0.18);
  const word = {
    item,
    x: nextSpawnX(),
    speed: randomBetween(layer.speed[0], layer.speed[1]),
    size,
    sizeRatio,
    sway: randomBetween(layer.sway[0], layer.sway[1]),
    opacity,
    depth,
    attractX: 0,
    attractY: 0,
    attractTransform: "",
    w: 0,
    h: 0,
    baseLeft: 0,
    boxW: 0,
    boxH: 0,
    fallAnimation: null,
    fallStart: WORD_START_Y,
    fallEnd: WORD_START_Y,
    fallDuration: 1,
    swayAnimation: null,
    swayPhase: randomBetween(0, Math.PI * 2),
    removed: false
  };

  const el = document.createElement("button");
  const orientation = document.createElement("span");
  const label = document.createElement("span");
  el.type = "button";
  el.className = "floating-word";
  label.className = "floating-word-label";
  label.setAttribute("aria-hidden", "true");
  label.textContent = item.name;
  orientation.className = "floating-word-orientation";
  orientation.appendChild(label);
  el.appendChild(orientation);
  el.dataset.writingDirection = state.settings.writingDirection;
  el.style.fontSize = `${size}px`;
  el.style.setProperty("--word-alpha", opacity.toFixed(3));
  el.style.setProperty("--word-hover-alpha", hoverOpacity.toFixed(3));
  el.style.setProperty("--word-hit-size", `${(44 / depth).toFixed(2)}px`);
  el.style.scale = String(depth);
  el.style.zIndex = String(Math.round(depth * 10));
  el.setAttribute("aria-label", `${item.name} の詳細を開く`);
  word.el = el;
  word.label = label;
  updateFloatingWordDescriptionColor(word);
  floatingWordsByElement.set(el, word);
  state.activeWords.push(word);
  dom.cascade.appendChild(el);
  positionWordHorizontally(word);
  observeWordSize(word);
  startFallAnimation(word);
  startSwayAnimation(word);
}

function pickDepthLayer() {
  let roll = Math.random();
  for (const layer of DEPTH_LAYERS) {
    roll -= layer.weight;
    if (roll < 0) return layer;
  }
  return DEPTH_LAYERS[DEPTH_LAYERS.length - 1];
}

function getResponsiveWordSizeRange(width = state.viewport.width) {
  if (width <= 640) return { min: 20, max: 38 };
  if (width <= 1024) return { min: 22, max: 44 };
  if (width >= 1440) return { min: 26, max: 54 };
  return { min: 24, max: 50 };
}

function updateResponsiveWordSize(word) {
  const range = getResponsiveWordSizeRange();
  const currentSize = Number.parseFloat(word.el.style.fontSize) || word.size;
  const nextSize = range.min + word.sizeRatio * (range.max - range.min);
  if (currentSize > 0 && word.w > 0) {
    const scale = nextSize / currentSize;
    const minimumHitSize = state.pointer.fine ? 0 : 44 / word.depth;
    word.w = Math.max(minimumHitSize, word.w * scale);
    word.h = Math.max(minimumHitSize, word.h * scale);
  }
  word.size = nextSize;
  word.el.style.fontSize = `${word.size.toFixed(2)}px`;
}

function nextSpawnX() {
  if (!state.spawnLanes.length) {
    state.spawnLanes = Array.from({ length: SPAWN_LANE_COUNT }, (_, index) => index);
    shuffleInPlace(state.spawnLanes);
  }

  const lane = state.spawnLanes.pop();
  const laneWidth = (SPAWN_X_MAX - SPAWN_X_MIN) / SPAWN_LANE_COUNT;
  // Each batch uses every horizontal lane once. Random placement inside the lane
  // keeps the result organic without allowing long-lived left/right clusters.
  return SPAWN_X_MIN + (lane + Math.random()) * laneWidth;
}

function shuffleInPlace(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function positionWordHorizontally(word) {
  const verticalFall = isVerticalFall();
  const baseAcross = calculateWordBaseAcross(word, verticalFall);
  word.baseLeft = verticalFall ? baseAcross : 0;
  word.baseTop = verticalFall ? 0 : baseAcross;
  word.boxW = word.w * word.depth;
  word.boxH = word.h * word.depth;
  word.el.style.left = `${word.baseLeft.toFixed(2)}px`;
  word.el.style.top = `${word.baseTop.toFixed(2)}px`;
}

function calculateWordBaseAcross(word, verticalFall) {
  const span = verticalFall ? state.viewport.width : state.viewport.height;
  const wordSpan = verticalFall ? word.w * word.depth : word.h * word.depth;
  const edge = span <= 640 ? 10 : 16;
  const progress = (word.x - SPAWN_X_MIN) / (SPAWN_X_MAX - SPAWN_X_MIN);
  const inset = edge + word.sway;
  const available = Math.max(0, span - inset * 2 - wordSpan);
  return inset + progress * available;
}

function isVerticalFall(direction = state.settings.fallDirection) {
  return direction === "down" || direction === "up";
}

function fitFloatingWordToViewport(word) {
  const edge = state.viewport.width <= 640 ? 10 : 16;
  const maxWidth = Math.max(1, state.viewport.width - (edge + word.sway) * 2);
  const visualWidth = word.w * word.depth;
  if (visualWidth <= maxWidth + 0.5) return false;
  const currentSize = Number.parseFloat(word.el.style.fontSize) || word.size;
  const fittedSize = Math.max(14, currentSize * (maxWidth / visualWidth));
  if (fittedSize >= currentSize - 0.25) return false;
  word.el.style.fontSize = `${fittedSize.toFixed(2)}px`;
  return true;
}

function observeWordSize(word) {
  if (wordSizeObserver) {
    wordSizeObserver.observe(word.el);
    return;
  }
  // Old-browser fallback: defer the read until the next frame so appending a word
  // does not immediately force style and layout calculation.
  requestAnimationFrame(() => {
    if (word.removed) return;
    word.w = word.el.offsetWidth;
    word.h = word.el.offsetHeight;
    if (fitFloatingWordToViewport(word)) {
      requestAnimationFrame(() => {
        if (word.removed) return;
        word.w = word.el.offsetWidth;
        word.h = word.el.offsetHeight;
        positionWordHorizontally(word);
      });
      return;
    }
    positionWordHorizontally(word);
  });
}

function startFallAnimation(word, startY = WORD_START_Y) {
  const direction = state.settings.fallDirection;
  const vertical = isVerticalFall(direction);
  const viewportSpan = vertical ? state.viewport.height : state.viewport.width;
  const reverse = direction === "up" || direction === "left";
  const defaultStart = reverse ? viewportSpan + WORD_END_MARGIN : WORD_START_Y;
  const start = arguments.length > 1 ? startY : defaultStart;
  const estimatedWordSpan = vertical
    ? (word.h || word.size) * word.depth
    : (word.w || word.item.name.length * word.size) * word.depth;
  const end = reverse ? -(estimatedWordSpan + WORD_END_MARGIN) : viewportSpan + WORD_END_MARGIN;
  const distance = Math.max(1, Math.abs(end - start));
  const duration = distance / word.speed;
  const from = vertical ? `0px ${start.toFixed(2)}px` : `${start.toFixed(2)}px 0px`;
  const to = vertical ? `0px ${end.toFixed(2)}px` : `${end.toFixed(2)}px 0px`;
  const animation = word.el.animate([
    { translate: from },
    { translate: to }
  ], {
    duration,
    easing: "linear",
    fill: "forwards"
  });

  word.fallStart = start;
  word.fallEnd = end;
  word.fallDuration = duration;
  word.fallAnimation = animation;
  animation.playbackRate = getEffectiveSpeedMultiplier();
  if (state.paused || document.hidden) animation.pause();
  animation.onfinish = () => {
    if (word.fallAnimation === animation) removeFloatingWord(word);
  };
}

function startSwayAnimation(word, phase = word.swayPhase) {
  if (state.settings.motion === "straight") return;
  const frames = [];
  for (let index = 0; index <= SWAY_KEYFRAME_COUNT; index += 1) {
    const progress = index / SWAY_KEYFRAME_COUNT;
    // The parent's individual scale property also scales this legacy transform.
    const x = (SWAY_SAMPLES[index] * word.sway) / word.depth;
    const vertical = isVerticalFall();
    frames.push({
      offset: progress,
      transform: vertical
        ? `translate3d(${x.toFixed(2)}px, 0, 0)`
        : `translate3d(0, ${x.toFixed(2)}px, 0)`
    });
  }
  const animation = word.el.animate(frames, {
    duration: SWAY_PERIOD_MS,
    easing: "linear",
    iterations: Infinity
  });
  const normalizedPhase = normalizePhase(phase);
  animation.currentTime = normalizedPhase / SWAY_OMEGA;
  word.swayPhase = normalizedPhase;
  word.swayAnimation = animation;
  if (state.paused || document.hidden) animation.pause();
}

function getSwayPhase(word) {
  if (!word.swayAnimation) return word.swayPhase;
  const currentTime = Math.max(0, Number(word.swayAnimation.currentTime) || 0);
  return normalizePhase(currentTime * SWAY_OMEGA);
}

function normalizePhase(phase) {
  const cycle = Math.PI * 2;
  return ((phase % cycle) + cycle) % cycle;
}

function getFallY(word) {
  const currentTime = Math.max(0, Number(word.fallAnimation?.currentTime) || 0);
  const progress = Math.min(1, currentTime / word.fallDuration);
  return word.fallStart + (word.fallEnd - word.fallStart) * progress;
}

function getFallPosition(word) {
  const value = getFallY(word);
  return isVerticalFall() ? { x: 0, y: value } : { x: value, y: 0 };
}

function getRenderedSway(word, phase) {
  // Match the browser's linear interpolation between the sway keyframes exactly.
  // Using a continuous sine here while the pixels followed segmented keyframes made
  // the magnetic target drift by sub-pixels and visibly twitch near its boundary.
  const cycle = Math.PI * 2;
  const framePosition = (normalizePhase(phase) / cycle) * SWAY_KEYFRAME_COUNT;
  const frameIndex = Math.floor(framePosition);
  const frameProgress = framePosition - frameIndex;
  const from = SWAY_SAMPLES[frameIndex];
  const to = SWAY_SAMPLES[frameIndex + 1];
  return (from + (to - from) * frameProgress) * word.sway;
}

function retargetFallAnimations() {
  for (const word of [...state.activeWords]) {
    const position = getFallY(word);
    const oldAnimation = word.fallAnimation;
    if (oldAnimation) {
      oldAnimation.onfinish = null;
      oldAnimation.cancel();
    }
    const reverse = state.settings.fallDirection === "up" || state.settings.fallDirection === "left";
    const span = isVerticalFall() ? state.viewport.height : state.viewport.width;
    if ((!reverse && position >= span + WORD_END_MARGIN) || (reverse && position <= WORD_START_Y)) {
      removeFloatingWord(word);
      continue;
    }
    startFallAnimation(word, position);
  }
}

function syncSwayAnimations() {
  for (const word of state.activeWords) {
    const phase = getSwayPhase(word);
    if (word.swayAnimation) {
      word.swayAnimation.cancel();
      word.swayAnimation = null;
    }
    word.swayPhase = phase;
    startSwayAnimation(word, phase);
  }
}

function updateWordPlaybackRates() {
  for (const word of state.activeWords) {
    const animation = word.fallAnimation;
    if (!animation) continue;
    if (typeof animation.updatePlaybackRate === "function") {
      animation.updatePlaybackRate(getEffectiveSpeedMultiplier());
    } else {
      animation.playbackRate = getEffectiveSpeedMultiplier();
    }
  }
}

function schedulePlaybackRateUpdate() {
  if (state.speedUpdateFrame) return;
  state.speedUpdateFrame = requestAnimationFrame(() => {
    state.speedUpdateFrame = 0;
    updateWordPlaybackRates();
  });
}

function syncWordAnimationPlayback() {
  const shouldPause = state.paused || document.hidden;
  for (const word of state.activeWords) {
    for (const animation of [word.fallAnimation, word.swayAnimation]) {
      if (!animation) continue;
      if (shouldPause) {
        animation.pause();
      } else {
        animation.play();
      }
    }
  }
}

function updateMagnetism(timestamp) {
  const delta = state.lastMagnetFrame ? Math.min(50, timestamp - state.lastMagnetFrame) : 1000 / 60;
  state.lastMagnetFrame = timestamp;
  const ease = 1 - Math.pow(1 - ATTRACT_EASE, delta / (1000 / 60));
  const magnetize = state.pointer.fine && state.pointer.active;
  let hasMotion = false;
  for (const word of state.activeWords) {
    if (!magnetize && word.attractX === 0 && word.attractY === 0) continue;
    if (!magnetize) {
      applyMagnet(word, false, 0, 0, ease);
      if (word.attractX !== 0 || word.attractY !== 0) hasMotion = true;
      continue;
    }
    const fall = getFallPosition(word);
    const sway = state.settings.motion === "straight" ? 0 : getRenderedSway(word, getSwayPhase(word));
    const left = word.baseLeft + fall.x + (isVerticalFall() ? sway : 0);
    const top = word.baseTop + fall.y + (isVerticalFall() ? 0 : sway);
    if (word.h > 0 && (state.pointer.y < top - ATTRACT_MARGIN || state.pointer.y > top + word.boxH + ATTRACT_MARGIN)) {
      if (word.attractX !== 0 || word.attractY !== 0) {
        applyMagnet(word, false, 0, 0, ease);
        if (word.attractX !== 0 || word.attractY !== 0) hasMotion = true;
      }
      continue;
    }
    applyMagnet(word, true, left, top, ease);
    if (word.attractX !== 0 || word.attractY !== 0) hasMotion = true;
  }
  state.magnetSettling = hasMotion;
}

function applyMagnet(word, magnetize, left, top, ease) {
  let targetX = 0;
  let targetY = 0;
  if (magnetize && word.w > 0 && word.h > 0) {
    const boxW = word.boxW;
    const boxH = word.boxH;
    const right = left + boxW;
    const bottom = top + boxH;
    // Reject almost every word using comparisons before doing distance math.
    const nearby = state.pointer.x >= left - ATTRACT_MARGIN
      && state.pointer.x <= right + ATTRACT_MARGIN
      && state.pointer.y >= top - ATTRACT_MARGIN
      && state.pointer.y <= bottom + ATTRACT_MARGIN;
    if (nearby) {
      const edgeX = distanceToRange(state.pointer.x, left, right);
      const edgeY = distanceToRange(state.pointer.y, top, bottom);
      const edgeDistanceSquared = edgeX * edgeX + edgeY * edgeY;
      if (edgeDistanceSquared < ATTRACT_MARGIN * ATTRACT_MARGIN) {
        const edgeDist = Math.sqrt(edgeDistanceSquared);
        const strength = (1 - edgeDist / ATTRACT_MARGIN) * ATTRACT_PULL;
        const toPointerX = state.pointer.x - (left + boxW / 2);
        const toPointerY = state.pointer.y - (top + boxH / 2);
        const reachSquared = toPointerX * toPointerX + toPointerY * toPointerY;
        if (reachSquared > 0.000001) {
          const reach = Math.sqrt(reachSquared);
          const pull = Math.min(strength, reach);
          targetX = (toPointerX / reach) * pull;
          targetY = (toPointerY / reach) * pull;
        }
      }
    }
  }

  word.attractX += (targetX - word.attractX) * ease;
  word.attractY += (targetY - word.attractY) * ease;
  if (Math.abs(word.attractX) < 0.05) word.attractX = 0;
  if (Math.abs(word.attractY) < 0.05) word.attractY = 0;
  const transform = word.attractX === 0 && word.attractY === 0
    ? ""
    : `translate3d(${(word.attractX / word.depth).toFixed(2)}px, ${(word.attractY / word.depth).toFixed(2)}px, 0)`;
  if (transform !== word.attractTransform) {
    word.label.style.transform = transform;
    word.attractTransform = transform;
  }
}

function distanceToRange(value, min, max) {
  if (value < min) return value - min;
  if (value > max) return value - max;
  return 0;
}

function removeFloatingWord(word) {
  if (word.removed) return;
  word.removed = true;
  if (wordSizeObserver) wordSizeObserver.unobserve(word.el);
  floatingWordsByElement.delete(word.el);
  if (word.fallAnimation) {
    word.fallAnimation.onfinish = null;
    word.fallAnimation.cancel();
  }
  if (word.swayAnimation) word.swayAnimation.cancel();
  word.el.remove();
  const index = state.activeWords.indexOf(word);
  if (index !== -1) state.activeWords.splice(index, 1);
  requestAnimationTick();
}

function trimActiveWords(maxWords) {
  const excess = state.activeWords.length - maxWords;
  if (excess <= 0) return;
  for (const word of state.activeWords.slice(0, excess)) removeFloatingWord(word);
}

function clearActiveWords() {
  for (const word of [...state.activeWords]) removeFloatingWord(word);
}

function getModalMinimumFontSize() {
  return state.viewport.width <= 640 ? 14 : 20;
}

function isDescriptionColoringEnabled() {
  return IS_LOCAL_DEV && state.settings.colorByDescription;
}

function updateFloatingWordDescriptionColor(word) {
  word.el.classList.toggle("is-description-missing", isDescriptionColoringEnabled() && !word.item.desc);
}

function updateActiveWordDescriptionColors() {
  for (const word of state.activeWords) updateFloatingWordDescriptionColor(word);
}

function openModal(item, opener = document.activeElement) {
  state.selectedWord = item;
  state.paused = true;
  cancelAnimationTick();
  syncWordAnimationPlayback();
  state.focusReturnTarget = opener;
  dom.modalLevel.textContent = `Lv ${item.lv ?? "-"}`;
  dom.modalGenre.textContent = getGenreLabel(item.genre);
  dom.modalWord.textContent = item.name;
  fitTextToWidth(dom.modalWord, getModalMinimumFontSize());
  dom.modalReading.textContent = item.reading || "";
  dom.modalReading.hidden = !item.reading;
  const hasDescription = Boolean(item.desc);
  dom.modalDesc.textContent = hasDescription
    ? item.desc
    : "この言葉には、まだ解説が設定されていません。";
  dom.modalDesc.hidden = false;
  dom.modalDesc.classList.toggle("is-missing-desc", !hasDescription);
  renderModalUsage(item);
  renderModalSiteLinks(item);
  openLayer(dom.modalBackdrop);
  dom.detailModal.focus();
  refreshIcons();
}

function closeModal() {
  closeLayer(dom.modalBackdrop);
  state.selectedWord = null;
  state.paused = false;
  state.lastMagnetFrame = 0;
  syncWordAnimationPlayback();
  requestAnimationTick();
  restoreFocus();
}

function getPopovers() {
  return [
    { button: dom.settingsButton, panel: dom.settingsPanel },
    { button: dom.infoButton, panel: dom.infoDialog }
  ];
}

function togglePopover(panel) {
  const isOpen = panel.classList.contains("is-open");
  closePopovers();
  if (isOpen) return;
  state.focusReturnTarget = document.activeElement;
  openLayer(panel);
  const entry = getPopovers().find((item) => item.panel === panel);
  if (entry) entry.button.setAttribute("aria-expanded", "true");
  panel.focus();
}

function closePopovers() {
  let closedActive = false;
  for (const { button, panel } of getPopovers()) {
    if (panel.classList.contains("is-open")) closedActive = true;
    closeLayer(panel);
    button.setAttribute("aria-expanded", "false");
  }
  if (closedActive) restoreFocus();
}

function searchSelectedWord(site) {
  if (!state.selectedWord) return;
  const query = encodeURIComponent(state.selectedWord.name);
  const url = `https://www.google.com/search?q=${query}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderModalUsage(item) {
  const examples = Array.isArray(item.usageExamples)
    ? item.usageExamples.filter((usage) => usage?.example && usage?.meaning)
    : [];
  dom.modalUsage.hidden = !examples.length;
  dom.modalUsageList.innerHTML = examples.map((usage) => `
    <li>
      <div class="modal-usage-example">${escapeHtml(usage.example)}</div>
      <div class="modal-usage-meaning">${escapeHtml(usage.meaning)}</div>
    </li>
  `).join("");
}

function renderModalSiteLinks(item) {
  const links = item.links || { wikipedia: { enabled: true }, custom: [] };
  const buttons = [];
  const wikipediaUrl = getWikipediaUrl(item);
  if (links.wikipedia?.enabled === false) {
    buttons.push(`
      <span class="text-button is-disabled" aria-disabled="true" title="Wikipediaリンクは無効です">
        <i data-lucide="book-open"></i>
        <span>Wikipedia</span>
      </span>
    `);
  } else {
    buttons.push(`
      <a class="text-button" href="${escapeAttribute(wikipediaUrl)}" target="_blank" rel="noopener noreferrer">
        <i data-lucide="book-open"></i>
        <span>Wikipedia</span>
      </a>
    `);
  }
  (links.custom || []).forEach((link) => {
    if (!link.enabled || !link.label || !isValidHttpUrl(link.url)) return;
    buttons.push(`
      <a class="text-button" href="${escapeAttribute(link.url)}" target="_blank" rel="noopener noreferrer">
        <i data-lucide="external-link"></i>
        <span>${escapeHtml(link.label)}</span>
      </a>
    `);
  });
  dom.modalSiteLinks.innerHTML = buttons.join("");
  refreshIcons();
}

function getWikipediaUrl(word) {
  const lang = word.lang;
  const title = encodeURIComponent(word.name.replace(/\s+/g, "_"));
  if (WIKIPEDIA_LANGS.has(lang)) return `https://${lang}.wikipedia.org/wiki/${title}`;
  return `https://www.wikipedia.org/search-redirect.php?search=${encodeURIComponent(word.name)}`;
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

async function ensureAudioContext() {
  if (!state.audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      showStatus("Web Audio API is not supported in this browser.");
      return false;
    }
    state.audio.context = new AudioContextClass();
    state.audio.gain = state.audio.context.createGain();
    state.audio.gain.gain.value = 0;
    state.audio.gain.connect(state.audio.context.destination);
  }
  if (state.audio.context.state === "suspended") await state.audio.context.resume();
  return true;
}

async function toggleSound() {
  const ready = state.settings.audioSource === "file" ? true : await ensureAudioContext();
  if (!ready) return;
  state.audio.muted = !state.audio.muted;
  applyVolume();
  updateSoundButton();
  syncAudioSource();
}

function startAmbientNoise() {
  window.clearTimeout(state.audio.ambientStopTimer);
  state.audio.ambientStopTimer = 0;
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

function disconnectAmbientNoise() {
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

function stopAmbientNoise({ fade = true } = {}) {
  if (!state.audio.noiseNode) return;
  window.clearTimeout(state.audio.ambientStopTimer);
  state.audio.ambientStopTimer = 0;
  if (!fade || !state.audio.gain || !state.audio.context) {
    disconnectAmbientNoise();
    return;
  }
  applyGainTo(0, fade);
  const node = state.audio.noiseNode;
  state.audio.ambientStopTimer = window.setTimeout(() => {
    state.audio.ambientStopTimer = 0;
    if (state.audio.noiseNode === node) disconnectAmbientNoise();
  }, AUDIO_FADE_DURATION * 1000);
}

function fadeFileVolumeTo(target, onComplete = null) {
  if (!state.audio.file) return;
  const audio = state.audio.file;
  window.clearInterval(state.audio.fileFadeTimer);
  state.audio.fileFadeTimer = 0;
  const start = audio.volume;
  if (Math.abs(start - target) < 0.001) {
    audio.volume = target;
    if (onComplete) onComplete();
    return;
  }
  const startedAt = performance.now();
  const step = () => {
    const progress = Math.min(1, (performance.now() - startedAt) / (AUDIO_FADE_DURATION * 1000));
    audio.volume = start + (target - start) * progress;
    if (progress >= 1) {
      window.clearInterval(state.audio.fileFadeTimer);
      state.audio.fileFadeTimer = 0;
      if (onComplete) onComplete();
    }
  };
  state.audio.fileFadeTimer = window.setInterval(step, 16);
  step();
}

function applyVolume({ fade = true } = {}) {
  const target = state.audio.muted ? 0 : state.settings.volume;
  applyGainTo(target, fade);
  if (state.audio.file) {
    if (fade) {
      fadeFileVolumeTo(target);
    } else {
      window.clearInterval(state.audio.fileFadeTimer);
      state.audio.fileFadeTimer = 0;
      state.audio.file.volume = target;
    }
  }
}

function applyGainTo(target, fade = true) {
  if (state.audio.gain) {
    const now = state.audio.context.currentTime;
    state.audio.gain.gain.cancelScheduledValues(now);
    if (fade) {
      state.audio.gain.gain.setValueAtTime(state.audio.gain.gain.value, now);
      state.audio.gain.gain.linearRampToValueAtTime(target, now + AUDIO_FADE_DURATION);
    } else {
      state.audio.gain.gain.setValueAtTime(target, now);
    }
  }
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

function updateSpeedLabel() {
  dom.speedValue.textContent = `${Number(state.settings.speed).toFixed(2)}x`;
}

function updateDensityLabel() {
  dom.densityValue.textContent = String(state.settings.density);
}

function applyFont() {
  document.documentElement.dataset.wordFont = state.settings.font;
}

function ensureFileAudio() {
  if (state.audio.file) return state.audio.file;
  const audio = new Audio(AUDIO_FILE);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  state.audio.file = audio;
  return audio;
}

function stopFileAudio({ fade = true } = {}) {
  if (!state.audio.file) return;
  const audio = state.audio.file;
  const stop = () => {
    if (state.audio.file !== audio) return;
    audio.pause();
    audio.currentTime = 0;
  };
  if (!fade) {
    window.clearInterval(state.audio.fileFadeTimer);
    state.audio.fileFadeTimer = 0;
    audio.volume = 0;
    stop();
    return;
  }
  fadeFileVolumeTo(0, stop);
}

function syncAudioSource() {
  if (state.audio.muted) {
    stopAmbientNoise();
    stopFileAudio();
    return;
  }

  if (state.settings.audioSource === "file") {
    stopAmbientNoise();
    const audio = ensureFileAudio();
    audio.play().then(() => {
      if (!state.audio.muted) applyVolume();
    }).catch(() => {
      state.audio.muted = true;
      updateSoundButton();
      applyVolume();
      showStatus("Audio file could not be played. Try turning sound on again.");
    });
    return;
  }

  stopFileAudio();
  ensureAudioContext().then((ready) => {
    if (ready && !state.audio.muted) {
      startAmbientNoise();
      applyVolume();
    }
  });
}

function openLayer(element) {
  element.classList.add("is-open");
  element.setAttribute("aria-hidden", "false");
  element.inert = false;
}

function closeLayer(element) {
  element.classList.remove("is-open");
  element.setAttribute("aria-hidden", "true");
  element.inert = true;
}

function setDeveloperSettingsOpen(open) {
  dom.devSettings.hidden = !open;
  dom.devSettingsToggle.setAttribute("aria-expanded", String(open));
  dom.devSettingsToggle.querySelector("span").textContent = open ? "開発者用を閉じる" : "開発者用を開く";
  dom.devSettingsToggle.classList.toggle("is-open", open);
}

function restoreFocus() {
  const target = state.focusReturnTarget;
  state.focusReturnTarget = null;
  if (target && typeof target.focus === "function" && document.contains(target)) target.focus();
}

function trapFocus(event, container) {
  if (event.key !== "Tab" || !container.classList.contains("is-open")) return;
  const focusable = [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function scheduleViewportUpdate() {
  window.clearTimeout(state.resizeTimer);
  state.resizeTimer = window.setTimeout(() => {
    state.resizeTimer = null;
    const width = Math.round(window.visualViewport?.width || window.innerWidth);
    const height = Math.round(window.visualViewport?.height || window.innerHeight);
    const widthChanged = width !== Math.round(state.viewport.width);
    const heightChanged = height !== Math.round(state.viewport.height);
    if (!widthChanged && !heightChanged) return;
    state.viewport.width = width;
    state.viewport.height = height;
    if (widthChanged) {
      for (const word of state.activeWords) {
        updateResponsiveWordSize(word);
      }
      if (dom.modalBackdrop.classList.contains("is-open")) {
        fitTextToWidth(dom.modalWord, getModalMinimumFontSize());
      }
    }
    for (const word of state.activeWords) positionWordHorizontally(word);
    if ((isVerticalFall() && heightChanged) || (!isVerticalFall() && widthChanged)) {
      retargetFallAnimations();
    }
  }, 120);
}

function bindEvents() {
  dom.cascade.addEventListener("click", (event) => {
    const element = event.target.closest(".floating-word");
    if (!element || !dom.cascade.contains(element)) return;
    const word = floatingWordsByElement.get(element);
    if (word) openModal(word.item, element);
  });
  dom.settingsButton.addEventListener("click", () => togglePopover(dom.settingsPanel));
  dom.soundButton.addEventListener("click", toggleSound);
  dom.infoButton.addEventListener("click", () => togglePopover(dom.infoDialog));
  dom.formsLink.addEventListener("click", (event) => {
    if (FORMS_URL === "#") {
      event.preventDefault();
      showStatus("単語投稿フォームは準備中です。");
    }
  });
  dom.volumeSlider.addEventListener("input", () => {
    state.settings.volume = Number(dom.volumeSlider.value);
    setStoredValue(VOLUME_STORAGE_KEY, String(state.settings.volume));
    updateVolumeLabel();
    applyVolume();
  });
  dom.audioSourceSelect.addEventListener("change", () => {
    state.settings.audioSource = AUDIO_SOURCES.has(dom.audioSourceSelect.value) ? dom.audioSourceSelect.value : "generated";
    setStoredValue(AUDIO_SOURCE_STORAGE_KEY, state.settings.audioSource);
    syncAudioSource();
  });
  dom.fontSelect.addEventListener("change", () => {
    state.settings.font = FONTS.has(dom.fontSelect.value) ? dom.fontSelect.value : DEFAULT_FONT;
    setStoredValue(FONT_STORAGE_KEY, state.settings.font);
    applyFont();
  });
  dom.devSettingsToggle.addEventListener("click", () => {
    setDeveloperSettingsOpen(dom.devSettings.hidden);
  });
  dom.motionSelect.addEventListener("change", () => {
    state.settings.motion = MOTIONS.has(dom.motionSelect.value) ? dom.motionSelect.value : DEFAULT_MOTION;
    setStoredValue(MOTION_STORAGE_KEY, state.settings.motion);
    syncSwayAnimations();
  });
  dom.writingDirectionSelect.addEventListener("change", () => {
    state.settings.writingDirection = DIRECTIONS.has(dom.writingDirectionSelect.value)
      ? dom.writingDirectionSelect.value
      : DEFAULT_WRITING_DIRECTION;
    setStoredValue(WRITING_DIRECTION_STORAGE_KEY, state.settings.writingDirection);
    clearActiveWords();
    state.lastSpawn = performance.now() - getSpawnDelay();
    requestAnimationTick();
  });
  dom.fallDirectionSelect.addEventListener("change", () => {
    state.settings.fallDirection = DIRECTIONS.has(dom.fallDirectionSelect.value)
      ? dom.fallDirectionSelect.value
      : DEFAULT_FALL_DIRECTION;
    setStoredValue(FALL_DIRECTION_STORAGE_KEY, state.settings.fallDirection);
    clearActiveWords();
    state.spawnLanes = [];
    state.lastSpawn = performance.now() - getSpawnDelay();
    requestAnimationTick();
  });
  dom.showAllWordsCheckbox.addEventListener("change", () => {
    state.settings.showAllWords = dom.showAllWordsCheckbox.checked;
    setStoredValue(SHOW_ALL_WORDS_STORAGE_KEY, state.settings.showAllWords ? "1" : "0");
    applyWordFilter();
    requestAnimationTick();
  });
  dom.colorByDescriptionCheckbox.addEventListener("change", () => {
    state.settings.colorByDescription = dom.colorByDescriptionCheckbox.checked;
    setStoredValue(COLOR_BY_DESCRIPTION_STORAGE_KEY, state.settings.colorByDescription ? "1" : "0");
    updateActiveWordDescriptionColors();
  });
  dom.speedSlider.addEventListener("input", () => {
    state.settings.speed = clampNumber(Number(dom.speedSlider.value), SPEED_RANGE.min, SPEED_RANGE.max, DEFAULT_SPEED);
    setStoredValue(SPEED_STORAGE_KEY, String(state.settings.speed));
    updateSpeedLabel();
    schedulePlaybackRateUpdate();
    requestAnimationTick();
  });
  dom.densitySlider.addEventListener("input", () => {
    state.settings.density = Math.round(clampNumber(Number(dom.densitySlider.value), DENSITY_RANGE.min, DENSITY_RANGE.max, DEFAULT_DENSITY));
    setStoredValue(DENSITY_STORAGE_KEY, String(state.settings.density));
    updateDensityLabel();
    trimActiveWords(state.settings.density);
    requestAnimationTick();
  });
  dom.closeModalButton.addEventListener("click", closeModal);
  dom.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.modalBackdrop) closeModal();
  });
  dom.googleButton.addEventListener("click", () => searchSelectedWord("google"));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".top-controls") && !event.target.closest(".popover")) {
      closePopovers();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (dom.modalBackdrop.classList.contains("is-open")) closeModal();
      closePopovers();
    }
    trapFocus(event, dom.modalBackdrop);
  });
  window.addEventListener("resize", scheduleViewportUpdate);
  window.visualViewport?.addEventListener("resize", scheduleViewportUpdate);
  window.addEventListener("pagehide", cancelAnimationTick);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) requestAnimationTick();
  });
  document.addEventListener("visibilitychange", () => {
    state.lastMagnetFrame = 0;
    if (document.hidden) {
      state.pointer.active = false;
      cancelAnimationTick();
    } else {
      state.lastSpawn = performance.now();
    }
    syncWordAnimationPlayback();
    if (!document.hidden) requestAnimationTick();
  });
  const startAudioOnInteraction = () => {
    if (!state.audio.muted) syncAudioSource();
  };
  document.addEventListener("pointerdown", startAudioOnInteraction, { once: true, passive: true });
  document.addEventListener("keydown", startAudioOnInteraction, { once: true });
  if (state.pointer.fine) {
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
      state.pointer.active = true;
      requestAnimationTick();
    }, { passive: true });
    window.addEventListener("pointerleave", () => {
      state.pointer.active = false;
      requestAnimationTick();
    });
  }
}

async function init() {
  closeLayer(dom.settingsPanel);
  closeLayer(dom.infoDialog);
  closeLayer(dom.modalBackdrop);
  dom.formsLink.href = FORMS_URL;
  dom.volumeSlider.value = state.settings.volume;
  dom.audioSourceSelect.value = state.settings.audioSource;
  dom.fontSelect.value = state.settings.font;
  dom.motionSelect.value = state.settings.motion;
  dom.writingDirectionSelect.value = state.settings.writingDirection;
  dom.fallDirectionSelect.value = state.settings.fallDirection;
  setDeveloperSettingsOpen(false);
  dom.showAllWordsCheckbox.checked = state.settings.showAllWords;
  dom.colorByDescriptionCheckbox.checked = state.settings.colorByDescription;
  dom.speedSlider.value = state.settings.speed;
  dom.densitySlider.value = state.settings.density;
  applyFont();
  updateSpeedLabel();
  updateDensityLabel();
  updateVolumeLabel();
  updateSoundButton();
  bindEvents();
  refreshIcons();
  await loadData();
  requestAnimationTick();
}

function showStatus(message, { loadNotice = false } = {}) {
  if (loadNotice && !IS_LOCAL_DEV) return;
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

function loadStoredVolume() {
  const value = Number(getStoredValue(VOLUME_STORAGE_KEY));
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_VOLUME;
}

function loadStoredAudioSource() {
  const value = getStoredValue(AUDIO_SOURCE_STORAGE_KEY);
  return AUDIO_SOURCES.has(value) ? value : "generated";
}

function loadStoredFont() {
  const value = getStoredValue(FONT_STORAGE_KEY);
  return FONTS.has(value) ? value : DEFAULT_FONT;
}

function loadStoredMotion() {
  const value = getStoredValue(MOTION_STORAGE_KEY);
  return MOTIONS.has(value) ? value : DEFAULT_MOTION;
}

function loadStoredDirection(key, fallback) {
  const value = getStoredValue(key);
  return DIRECTIONS.has(value) ? value : fallback;
}

function loadStoredShowAllWords() {
  const value = getStoredValue(SHOW_ALL_WORDS_STORAGE_KEY);
  return value === null ? true : value === "1";
}

function loadStoredColorByDescription() {
  return getStoredValue(COLOR_BY_DESCRIPTION_STORAGE_KEY) === "1";
}

function loadStoredSpeed() {
  const raw = getStoredValue(SPEED_STORAGE_KEY) ?? migrateLegacySpeed();
  if (raw === null || raw === "") return DEFAULT_SPEED;
  return clampNumber(Number(raw), SPEED_RANGE.min, SPEED_RANGE.max, DEFAULT_SPEED);
}

function migrateLegacySpeed() {
  const legacy = getStoredValue(LEGACY_SPEED_STORAGE_KEY);
  if (legacy === null || legacy === "") return null;
  // The former baseline was 1.5x. Move that one-time default to the new 1.0x baseline,
  // while preserving any explicit legacy speed the user had chosen.
  const migrated = Number(legacy) === 1.5 ? String(DEFAULT_SPEED) : legacy;
  setStoredValue(SPEED_STORAGE_KEY, migrated);
  return migrated;
}

function loadStoredDensity() {
  const raw = getStoredValue(DENSITY_STORAGE_KEY);
  if (raw === null || raw === "") return DEFAULT_DENSITY;
  return Math.round(clampNumber(Number(raw), DENSITY_RANGE.min, DENSITY_RANGE.max, DEFAULT_DENSITY));
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

init();
