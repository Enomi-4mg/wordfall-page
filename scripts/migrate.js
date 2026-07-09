#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENRE_ORDER,
  isValidGenre,
  isValidUuidV4,
  normalizeWord,
  serializeWords
} from "../shared/words.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dryRun = process.argv.includes("--dry-run");

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function createReport() {
  return {
    files: [],
    categoryValues: new Map(),
    categoryGenrePairs: new Map(),
    categoryTechDifferentGenre: [],
    media: [],
    custom: [],
    invalidGenres: new Map(),
    missingGenre: 0,
    missingLv: 0,
    exactDuplicates: new Map(),
    nameDuplicates: new Map()
  };
}

function collectDuplicates(file, rawWords, report) {
  const exact = new Map();
  const names = new Map();
  rawWords.forEach((item, index) => {
    const lang = String(item.lang || "").trim().toLowerCase();
    const name = String(item.name || "").trim();
    const desc = String(item.desc || "").trim();
    const exactKey = `${lang}::${name}::${desc}`;
    const nameKey = `${lang}::${name}`;
    if (lang && name && desc) {
      if (!exact.has(exactKey)) exact.set(exactKey, []);
      exact.get(exactKey).push(index + 1);
    }
    if (lang && name) {
      if (!names.has(nameKey)) names.set(nameKey, new Map());
      const descMap = names.get(nameKey);
      if (!descMap.has(desc)) descMap.set(desc, []);
      descMap.get(desc).push(index + 1);
    }
  });

  exact.forEach((rows, key) => {
    if (rows.length > 1) report.exactDuplicates.set(`${file}:${key}`, rows);
  });
  names.forEach((descMap, key) => {
    if (descMap.size > 1) {
      report.nameDuplicates.set(`${file}:${key}`, [...descMap.values()].flat());
    }
  });
}

function migrateWord(item, fileReport, report) {
  const category = String(item.category || "").trim().toLowerCase();
  const genre = String(item.genre || "").trim().toLowerCase();
  if (category) {
    fileReport.categoryRemoved += 1;
    increment(report.categoryValues, category);
    increment(report.categoryGenrePairs, `${category || "-"} / ${genre || "-"}`);
    if (category === "tech" && genre && genre !== "tech") {
      report.categoryTechDifferentGenre.push(`${item.lang || "?"}:${item.name || "?"} (${genre})`);
    }
  }

  if (genre === "media") report.media.push(`${item.lang || "?"}:${item.name || "?"}`);
  if (genre === "custom") report.custom.push(`${item.lang || "?"}:${item.name || "?"}`);
  if (!genre) {
    report.missingGenre += 1;
  } else if (!isValidGenre(genre)) {
    increment(report.invalidGenres, genre);
  }
  if (item.lv === undefined || item.lv === null || item.lv === "") report.missingLv += 1;

  let id = String(item.id || "").trim().toLowerCase();
  if (!id) {
    id = randomUUID();
    fileReport.newIds += 1;
  } else if (!isValidUuidV4(id)) {
    id = randomUUID();
    fileReport.regeneratedIds += 1;
  }

  const normalized = normalizeWord({ ...item, id });
  if (!normalized) {
    fileReport.skipped += 1;
    return null;
  }
  return normalized;
}

function printMap(title, map) {
  console.log(`\n${title}`);
  if (!map.size) {
    console.log("  - none");
    return;
  }
  [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => {
    console.log(`  - ${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  });
}

async function main() {
  const files = (await readdir(dataDir)).filter((file) => file.endsWith(".json")).sort();
  const report = createReport();

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const text = await readFile(filePath, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`${file}: JSON parse failed: ${error.message}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${file}: JSON root must be an array.`);

    collectDuplicates(file, parsed, report);
    const fileReport = {
      file,
      total: parsed.length,
      written: 0,
      skipped: 0,
      newIds: 0,
      regeneratedIds: 0,
      categoryRemoved: 0
    };
    const migrated = parsed.map((item) => migrateWord(item, fileReport, report)).filter(Boolean);
    fileReport.written = migrated.length;
    report.files.push(fileReport);

    if (!dryRun) {
      const langCode = path.basename(file, ".json");
      await writeFile(filePath, serializeWords(migrated, langCode), "utf8");
    }
  }

  console.log(dryRun ? "Wordfall migration report (dry-run)" : "Wordfall migration report");
  report.files.forEach((item) => {
    console.log(`\n${item.file}`);
    console.log(`  total: ${item.total}`);
    console.log(`  written: ${item.written}`);
    console.log(`  skipped: ${item.skipped}`);
    console.log(`  new ids: ${item.newIds}`);
    console.log(`  regenerated ids: ${item.regeneratedIds}`);
    console.log(`  category removed: ${item.categoryRemoved}`);
  });
  printMap("category values", report.categoryValues);
  printMap("category / genre pairs", report.categoryGenrePairs);
  printMap("invalid genres", report.invalidGenres);
  printMap("exact duplicate groups", report.exactDuplicates);
  printMap("name duplicate reference groups", report.nameDuplicates);
  console.log(`\nstandard genres: ${GENRE_ORDER.join(", ")}`);
  console.log(`media count: ${report.media.length}`);
  console.log(`custom count: ${report.custom.length}`);
  console.log(`missing genre count: ${report.missingGenre}`);
  console.log(`missing lv count: ${report.missingLv}`);
  if (report.categoryTechDifferentGenre.length) {
    console.log("\ncategory tech with non-tech genre");
    report.categoryTechDifferentGenre.forEach((item) => console.log(`  - ${item}`));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
