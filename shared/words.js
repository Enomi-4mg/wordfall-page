export const SUPPORTED_LANGUAGES = [
  { code: "ja", label: "Japanese", file: "data/ja.json" },
  { code: "en", label: "English", file: "data/en.json" },
  { code: "zh", label: "Chinese", file: "data/zh.json" },
  { code: "ko", label: "Korean", file: "data/ko.json" },
  { code: "fr", label: "French", file: "data/fr.json" },
  { code: "de", label: "German", file: "data/de.json" },
  { code: "it", label: "Italian", file: "data/it.json" },
  { code: "other", label: "Other", file: "data/other.json" }
];

export const GENRE_LABELS = {
  culture: "Culture & creative",
  language: "Language & expression",
  mind: "Mind & thought",
  society: "People & society",
  body: "Body & life",
  science: "Science & mathematics",
  nature: "Nature & universe",
  technology: "Technology & information",
  living: "Everyday life & food",
  place: "Places & movement",
  time: "Time",
  learning: "Learning"
};

export const GENRE_ORDER = Object.keys(GENRE_LABELS);
const GENRE_INDEX = new Map(GENRE_ORDER.map((genre, index) => [genre, index]));
export const VALID_LANGS = new Set(SUPPORTED_LANGUAGES.map((lang) => lang.code));
export const VALID_LEVELS = new Set([1, 2, 3, 4, 5]);

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_PATTERN = /^https?:\/\//i;

export function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidUuidV4(str) {
  return typeof str === "string" && UUID_V4_PATTERN.test(str);
}

export function isValidHttpUrl(value) {
  if (typeof value !== "string" || !HTTP_URL_PATTERN.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

export function isValidCreatedAt(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidGenre(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GENRE_LABELS, value);
}

export function getGenreLabel(genre) {
  return isValidGenre(genre) ? GENRE_LABELS[genre] : "-";
}

export function isDisplayReadyWord(word) {
  return Boolean(
    word &&
    cleanText(word.name) &&
    cleanText(word.desc) &&
    VALID_LANGS.has(cleanText(word.lang).toLowerCase())
  );
}

function normalizeUsageExamples(rawExamples) {
  if (!Array.isArray(rawExamples)) return [];
  return rawExamples
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const example = cleanText(item.example);
      const meaning = cleanText(item.meaning);
      const normalized = {};
      if (isValidUuidV4(item.id)) normalized.id = item.id;
      normalized.example = example;
      normalized.meaning = meaning;
      return normalized;
    })
    .filter((item) => item.example || item.meaning);
}

function normalizeLinks(rawLinks) {
  const links = rawLinks && typeof rawLinks === "object" ? rawLinks : {};
  const wikipedia = links.wikipedia && typeof links.wikipedia === "object"
    ? { enabled: links.wikipedia.enabled !== false }
    : { enabled: true };
  const custom = Array.isArray(links.custom)
    ? links.custom
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const normalized = {
          label: cleanText(item.label),
          url: cleanText(item.url),
          enabled: item.enabled !== false
        };
        if (isValidUuidV4(item.id)) normalized.id = item.id;
        return normalized;
      })
      .filter((item) => item.label || item.url)
    : [];
  return { wikipedia, custom };
}

export function normalizeOptionalFields(word) {
  const normalized = { ...word };
  if (!isValidCreatedAt(normalized.createdAt)) delete normalized.createdAt;
  if (!cleanText(normalized.reading)) delete normalized.reading;
  const level = Number(normalized.lv);
  if (!VALID_LEVELS.has(level)) {
    delete normalized.lv;
  } else {
    normalized.lv = level;
  }
  const genre = cleanText(normalized.genre).toLowerCase();
  if (!genre) {
    delete normalized.genre;
  } else {
    normalized.genre = genre;
  }
  return normalized;
}

export function normalizeWord(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = cleanText(raw.id).toLowerCase();
  const name = cleanText(raw.name);
  const desc = cleanText(raw.desc);
  const lang = cleanText(raw.lang).toLowerCase();

  if (!name || !VALID_LANGS.has(lang)) return null;

  const word = normalizeOptionalFields({
    id,
    createdAt: cleanText(raw.createdAt),
    name,
    reading: cleanText(raw.reading),
    desc,
    lv: raw.lv,
    lang,
    genre: cleanText(raw.genre).toLowerCase(),
    usageExamples: normalizeUsageExamples(raw.usageExamples),
    links: normalizeLinks(raw.links)
  });

  if (!isValidUuidV4(word.id)) delete word.id;
  return orderWordKeys(word);
}

export function validateWord(word) {
  const errors = [];
  const warnings = [];

  if (!word || typeof word !== "object") {
    return { errors: ["Word must be an object."], warnings };
  }

  if (!isValidUuidV4(word.id)) errors.push("id must be a UUID v4.");
  if (!Object.prototype.hasOwnProperty.call(word, "createdAt")) warnings.push("createdAt is not set.");
  else if (!isValidCreatedAt(word.createdAt)) errors.push("createdAt must be a valid YYYY-MM-DD date.");
  if (!cleanText(word.name)) errors.push("name is required.");
  const lang = cleanText(word.lang).toLowerCase();
  if (!lang) errors.push("lang is required.");
  else if (!VALID_LANGS.has(lang)) errors.push(`lang is not supported: ${lang}`);
  if (!Object.prototype.hasOwnProperty.call(word, "genre")) warnings.push("genre is not set.");
  if (word.genre && !isValidGenre(word.genre)) warnings.push(`genre is not in the standard list: ${word.genre}`);
  if (!Object.prototype.hasOwnProperty.call(word, "lv")) warnings.push("lv is not set.");
  if (Object.prototype.hasOwnProperty.call(word, "lv")
    && word.lv !== ""
    && word.lv !== null
    && word.lv !== undefined
    && !VALID_LEVELS.has(Number(word.lv))) {
    errors.push("lv must be 1, 2, 3, 4, 5, or empty.");
  }

  if (Object.prototype.hasOwnProperty.call(word, "usageExamples")) {
    if (!Array.isArray(word.usageExamples)) {
      errors.push("usageExamples must be an array.");
    } else {
      word.usageExamples.forEach((item, index) => {
        if (!cleanText(item?.example) || !cleanText(item?.meaning)) {
          errors.push(`usageExamples[${index + 1}] requires example and meaning.`);
        }
      });
    }
  }

  if (word.links !== undefined) {
    if (!word.links || typeof word.links !== "object") {
      errors.push("links must be an object.");
    } else {
      if (word.links.wikipedia && typeof word.links.wikipedia.enabled !== "boolean") {
        errors.push("links.wikipedia.enabled must be boolean.");
      }
      if (!Array.isArray(word.links.custom)) {
        errors.push("links.custom must be an array.");
      } else {
        word.links.custom.forEach((item, index) => {
          if (!cleanText(item?.label)) errors.push(`links.custom[${index + 1}] label is required.`);
          if (!isValidHttpUrl(item?.url)) errors.push(`links.custom[${index + 1}] URL must start with http:// or https://.`);
          if (typeof item?.enabled !== "boolean") errors.push(`links.custom[${index + 1}] enabled must be boolean.`);
        });
      }
    }
  }

  return { errors, warnings };
}

export function sortWords(words, langCode = "ja") {
  return [...words].sort((a, b) => {
    const genreA = a.genre || "\uffff";
    const genreB = b.genre || "\uffff";
    const genreIndexA = GENRE_INDEX.get(genreA) ?? GENRE_ORDER.length;
    const genreIndexB = GENRE_INDEX.get(genreB) ?? GENRE_ORDER.length;
    if (genreIndexA !== genreIndexB) return genreIndexA - genreIndexB;
    if (genreA !== genreB) return genreA.localeCompare(genreB, langCode);
    return a.name.localeCompare(b.name, langCode);
  });
}

export function serializeWords(words, langCode = "ja") {
  const normalized = words
    .map((word) => normalizeWord(word))
    .filter(Boolean)
    .map(orderWordKeys);
  return `${JSON.stringify(sortWords(normalized, langCode), null, 2)}\n`;
}

export function orderWordKeys(word) {
  const ordered = {};
  if (word.id) ordered.id = word.id;
  if (word.createdAt) ordered.createdAt = word.createdAt;
  ordered.name = word.name;
  if (word.reading) ordered.reading = word.reading;
  if (word.desc) ordered.desc = word.desc;
  if (Object.prototype.hasOwnProperty.call(word, "lv")) ordered.lv = Number(word.lv);
  ordered.lang = word.lang;
  if (word.genre) ordered.genre = word.genre;
  if (Array.isArray(word.usageExamples) && word.usageExamples.length) {
    ordered.usageExamples = word.usageExamples.map((item) => {
      const usage = {};
      if (item.id) usage.id = item.id;
      usage.example = cleanText(item.example);
      usage.meaning = cleanText(item.meaning);
      return usage;
    });
  }
  if (word.links && typeof word.links === "object") {
    ordered.links = {
      wikipedia: {
        enabled: word.links.wikipedia?.enabled !== false
      },
      custom: Array.isArray(word.links.custom)
        ? word.links.custom.map((item) => {
          const link = {};
          if (item.id) link.id = item.id;
          link.label = cleanText(item.label);
          link.url = cleanText(item.url);
          link.enabled = item.enabled !== false;
          return link;
        })
        : []
    };
  }
  return ordered;
}
