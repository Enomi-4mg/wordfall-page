#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VALID_LEVELS, isValidGenre, normalizeWord, serializeWords } from "../shared/words.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

// Previous genres were detailed subject labels. The new genres are discovery
// paths, so this map also keeps translated counterparts aligned.
const legacyGenreMap = {
  art: "culture",
  body: "body",
  city: "place",
  daily: "living",
  design: "culture",
  emotion: "mind",
  food: "living",
  history: "society",
  media: "culture",
  music: "culture",
  nature: "nature",
  philosophy: "mind",
  science: "science",
  society: "society",
  space: "place",
  study: "learning",
  tech: "technology",
  time: "time",
  travel: "place",
  work: "society"
};

const assignments = new Map([
  ["ja:4E認知", "mind"],
  ["ja:ア・プリオリ", "mind"],
  ["ja:イリヤ", "culture"],
  ["ja:インタラクションデザイン", "culture"],
  ["ja:エディプスコンプレックス", "mind"],
  ["ja:エナクティヴィズム", "mind"],
  ["ja:オイディプス王", "culture"],
  ["ja:ことなかれ", "society"],
  ["ja:コンコルド効果", "mind"],
  ["ja:シグニファイヤ", "language"],
  ["ja:シナプス", "body"],
  ["ja:シャーデンフロイデ", "mind"],
  ["ja:センス", "mind"],
  ["ja:テレビ石", "nature"],
  ["ja:ド・ブロイ波", "science"],
  ["ja:ハイカラ", "society"],
  ["ja:バイラテラル制御", "technology"],
  ["ja:フレデリカ・ローゼンフォルト", "culture"],
  ["ja:フロイト", "mind"],
  ["ja:ペルソナ・ノン・グラータ", "society"],
  ["ja:ポインセチア", "nature"],
  ["ja:ホムンクルス", "body"],
  ["ja:ホメロス", "culture"],
  ["ja:ポリテトラフルオロエチレン", "science"],
  ["ja:厭世", "mind"],
  ["ja:可換環", "science"],
  ["ja:花鳥風月", "culture"],
  ["ja:勧善懲悪", "culture"],
  ["ja:逆撫", "language"],
  ["ja:吟味", "learning"],
  ["ja:鶏鳴狗盗", "language"],
  ["ja:孤高", "mind"],
  ["ja:後光", "culture"],
  ["ja:甲殻類", "body"],
  ["ja:左見右見", "language"],
  ["ja:自律", "mind"],
  ["ja:辞典", "language"],
  ["ja:軸索", "body"],
  ["ja:初期微動継続時間", "science"],
  ["ja:身体性認知科学", "mind"],
  ["ja:髄鞘化", "body"],
  ["ja:雪花石膏", "nature"],
  ["ja:先手必勝", "science"],
  ["ja:側頭葉", "body"],
  ["ja:超越論的間主観性", "mind"],
  ["ja:超自我", "mind"],
  ["ja:直接知覚論", "mind"],
  ["ja:朕は国家なり", "society"],
  ["ja:八面六臂", "language"],
  ["ja:百花繚乱", "language"],
  ["ja:表象", "mind"],
  ["ja:不思議の国のアリス症候群", "body"],
  ["ja:不承不承", "language"],
  ["ja:報連相", "society"],
  ["ja:幽栖", "language"],
  ["ja:離人症", "mind"],
  ["ja:瑠璃", "nature"],
  ["ja:丿乀", "language"],
  ["ja:刹那", "time"],
  ["ja:呻吟", "language"],
  ["ja:歿", "language"],
  ["ja:衒学", "language"],
  ["ja:魑魅魍魎", "culture"],
  ["en:1d100", "culture"],
  ["en:AWACS", "technology"],
  ["en:criteria", "learning"],
  ["en:Everybody wants to rule the world", "culture"],
  ["en:experience", "mind"],
  ["en:Guarantee", "society"],
  ["en:LGTM", "technology"],
  ["en:retronym", "language"],
  ["en:Singularity", "science"],
  ["en:synecdoche", "language"],
  ["en:syzygy", "science"],
  ["en:Thule", "place"],
  ["en:アポステリオリ", "mind"],
  ["en:アンプランド・アポトーシス", "body"],
  ["en:ネクローシス", "body"],
  ["fr:archange", "culture"],
  ["fr:エクリチュール", "language"],
  ["zh:冰墩墩", "culture"],
  ["other:cogito", "mind"]
]);

// Levels express how much prior vocabulary or subject knowledge a reader
// generally needs. Existing levels were already curated and are kept intact;
// these entries complete the words that were added without a level.
const levelAssignments = new Map([
  ["ja:イリヤ", 3],
  ["ja:インタラクションデザイン", 3],
  ["ja:オイディプス王", 3],
  ["ja:フレデリカ・ローゼンフォルト", 4],
  ["ja:ホメロス", 3],
  ["ja:花鳥風月", 3],
  ["ja:勧善懲悪", 3],
  ["ja:後光", 2],
  ["ja:シグニファイヤ", 4],
  ["ja:逆撫", 4],
  ["ja:鶏鳴狗盗", 5],
  ["ja:左見右見", 4],
  ["ja:辞典", 1],
  ["ja:八面六臂", 3],
  ["ja:百花繚乱", 3],
  ["ja:不承不承", 4],
  ["ja:幽栖", 5],
  ["ja:丿乀", 5],
  ["ja:呻吟", 4],
  ["ja:歿", 5],
  ["ja:衒学", 4],
  ["ja:4E認知", 5],
  ["ja:ア・プリオリ", 4],
  ["ja:エディプスコンプレックス", 4],
  ["ja:エナクティヴィズム", 5],
  ["ja:コンコルド効果", 3],
  ["ja:シャーデンフロイデ", 4],
  ["ja:センス", 2],
  ["ja:フロイト", 3],
  ["ja:厭世", 4],
  ["ja:孤高", 3],
  ["ja:自律", 2],
  ["ja:身体性認知科学", 5],
  ["ja:超越論的間主観性", 5],
  ["ja:超自我", 4],
  ["ja:直接知覚論", 5],
  ["ja:表象", 3],
  ["ja:離人症", 4],
  ["ja:ことなかれ", 3],
  ["ja:ハイカラ", 2],
  ["ja:ペルソナ・ノン・グラータ", 4],
  ["ja:朕は国家なり", 4],
  ["ja:報連相", 2],
  ["ja:シナプス", 3],
  ["ja:ホムンクルス", 3],
  ["ja:甲殻類", 2],
  ["ja:軸索", 4],
  ["ja:髄鞘化", 5],
  ["ja:側頭葉", 3],
  ["ja:不思議の国のアリス症候群", 4],
  ["ja:ド・ブロイ波", 4],
  ["ja:ポリテトラフルオロエチレン", 4],
  ["ja:可換環", 5],
  ["ja:初期微動継続時間", 5],
  ["ja:先手必勝", 4],
  ["ja:テレビ石", 3],
  ["ja:ポインセチア", 2],
  ["ja:雪花石膏", 3],
  ["ja:瑠璃", 3],
  ["ja:バイラテラル制御", 5],
  ["ja:刹那", 2],
  ["ja:吟味", 2],
  ["en:1d100", 5],
  ["en:AWACS", 4],
  ["en:criteria", 2],
  ["en:Everybody wants to rule the world", 2],
  ["en:experience", 1],
  ["en:Guarantee", 2],
  ["en:LGTM", 3],
  ["en:retronym", 4],
  ["en:Singularity", 3],
  ["en:synecdoche", 5],
  ["en:syzygy", 5],
  ["en:Thule", 4],
  ["en:アポステリオリ", 4],
  ["en:アンプランド・アポトーシス", 5],
  ["en:ネクローシス", 5],
  ["fr:archange", 2],
  ["fr:エクリチュール", 4],
  ["zh:冰墩墩", 2],
  ["other:cogito", 4]
]);

async function main() {
  const files = (await readdir(dataDir)).filter((file) => file.endsWith(".json")).sort();
  const unresolved = [];
  const missingLevels = [];
  const updates = [];

  for (const file of files) {
    const lang = path.basename(file, ".json");
    const filePath = path.join(dataDir, file);
    const words = JSON.parse(await readFile(filePath, "utf8"));
    const reclassified = words.map((word) => {
      const genre = assignments.get(`${lang}:${word.name}`)
        || (isValidGenre(word.genre) ? word.genre : legacyGenreMap[word.genre]);
      const key = `${lang}:${word.name}`;
      if (!isValidGenre(genre)) {
        unresolved.push(`${lang}:${word.name}`);
        return word;
      }
      const level = word.lv ?? levelAssignments.get(key);
      if (!VALID_LEVELS.has(Number(level))) missingLevels.push(key);
      return normalizeWord({ ...word, genre, lv: level });
    });
    updates.push({ filePath, content: serializeWords(reclassified, lang) });
  }

  if (unresolved.length) {
    throw new Error(`Unassigned words: ${unresolved.join(", ")}`);
  }
  if (missingLevels.length) {
    throw new Error(`Words without a level: ${missingLevels.join(", ")}`);
  }
  await Promise.all(updates.map(({ filePath, content }) => writeFile(filePath, content, "utf8")));
  console.log(`Reclassified ${files.length} files using ${assignments.size} explicit assignments.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
