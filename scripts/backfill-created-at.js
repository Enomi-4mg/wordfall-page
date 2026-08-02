#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidCreatedAt } from "../shared/words.js";

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dryRun = process.argv.includes("--dry-run");

function getLocalDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function git(args) {
  return execFile("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
}

async function getFirstSeenDates(relativeFile) {
  const { stdout } = await git(["log", "--format=%H%x09%as", "--reverse", "HEAD", "--", relativeFile]);
  const firstSeenDates = new Map();
  const commits = stdout.trim() ? stdout.trim().split("\n") : [];

  for (const entry of commits) {
    const [hash, date] = entry.split("\t");
    if (!hash || !isValidCreatedAt(date)) continue;
    const { stdout: contents } = await git(["show", `${hash}:${relativeFile}`]);
    const words = JSON.parse(contents);
    if (!Array.isArray(words)) continue;
    for (const word of words) {
      const id = String(word?.id || "").trim().toLowerCase();
      if (id && !firstSeenDates.has(id)) firstSeenDates.set(id, date);
    }
  }

  return firstSeenDates;
}

function addCreatedAt(word, createdAt) {
  const next = {};
  if (word.id) next.id = word.id;
  next.createdAt = createdAt;
  for (const [key, value] of Object.entries(word)) {
    if (key !== "id" && key !== "createdAt") next[key] = value;
  }
  return next;
}

async function main() {
  const files = (await readdir(dataDir)).filter((file) => file.endsWith(".json")).sort();
  const fallbackDate = getLocalDate();
  const report = [];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const relativeFile = path.posix.join("data", file);
    const original = await readFile(filePath, "utf8");
    const words = JSON.parse(original);
    if (!Array.isArray(words)) throw new Error(`${relativeFile}: JSON root must be an array.`);
    const firstSeenDates = await getFirstSeenDates(relativeFile);
    let historyDates = 0;
    let fallbackDates = 0;
    let preservedDates = 0;
    const nextWords = words.map((word) => {
      if (isValidCreatedAt(word.createdAt)) {
        preservedDates += 1;
        return word;
      }
      const id = String(word.id || "").trim().toLowerCase();
      const createdAt = firstSeenDates.get(id) || fallbackDate;
      if (firstSeenDates.has(id)) historyDates += 1;
      else fallbackDates += 1;
      return addCreatedAt(word, createdAt);
    });
    const next = `${JSON.stringify(nextWords, null, 2)}\n`;
    if (!dryRun && next !== original) await writeFile(filePath, next, "utf8");
    report.push({ file, total: words.length, historyDates, fallbackDates, preservedDates });
  }

  console.log(dryRun ? "Registration-date backfill report (dry-run)" : "Registration-date backfill report");
  report.forEach(({ file, total, historyDates, fallbackDates, preservedDates }) => {
    console.log(`${file}: ${total} total / ${historyDates} from Git / ${fallbackDates} fallback (${fallbackDate}) / ${preservedDates} preserved`);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
