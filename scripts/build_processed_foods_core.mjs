import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = resolve(ROOT, "data", "sources", "processed_foods_seed.json");
const OUTPUT_PATH = resolve(ROOT, "data", "processed_foods_core.json");

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, "\"");
}

function textFromHtml(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericValue(value) {
  if (!value || value === "-" || value === "－") return null;
  if (/^tr$/i.test(value)) return 0;
  const number = Number(value.replace(/[(),]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function lastNutrient(text, label, unit) {
  const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${label}\\s*\\(?\\s*([0-9.,]+|Tr|tr|-|－)\\s*\\)?\\s*${escapedUnit}`, "g");
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return null;
  return numericValue(matches.at(-1)[1]);
}

function firstNutrient(text, label, unit) {
  const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${label}\\s*\\(?\\s*([0-9.,]+|Tr|tr|-|－)\\s*\\)?\\s*${escapedUnit}`);
  const match = text.match(pattern);
  return match ? numericValue(match[1]) : null;
}

function parseFoodDbDetail(html, seed) {
  const text = textFromHtml(html);
  if (!text.includes("食品番号") && !text.includes("エネルギー")) {
    throw new Error(`${seed.id}: FoodDB detail page was not detected`);
  }

  const energyKcal = firstNutrient(text, "エネルギー", "kcal");
  const proteinG = lastNutrient(text, "たんぱく質", "g");
  const fatG = lastNutrient(text, "脂質", "g");
  const carbsG = lastNutrient(text, "炭水化物", "g");
  const fiberG = lastNutrient(text, "食物繊維総量", "g") ?? 0;
  const saltG = lastNutrient(text, "食塩相当量", "g") ?? 0;

  const missing = Object.entries({ energyKcal, proteinG, fatG, carbsG })
    .filter(([, value]) => value === null)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`${seed.id}: missing required nutrient values: ${missing.join(", ")}`);
  }

  return {
    energyKcal: Math.round(energyKcal),
    proteinG: Math.round(proteinG * 10) / 10,
    fatG: Math.round(fatG * 10) / 10,
    carbsG: Math.round(carbsG * 10) / 10,
    fiberG: Math.round(fiberG * 10) / 10,
    saltG: Math.round(saltG * 100) / 100,
  };
}

function buildEntry(seed, nutrientsPer100g) {
  return {
    id: seed.id,
    name: seed.name,
    kana: seed.kana || "",
    aliases: Array.isArray(seed.aliases) ? seed.aliases : [],
    category: seed.category,
    categoryId: seed.categoryId,
    sourceType: "processed_static",
    unitMode: "gram",
    unitLabel: "100g",
    ediblePortionNote: "可食部100gあたり",
    source: {
      name: seed.sourceName,
      url: seed.sourceUrl,
      verifiedAt: new Date().toISOString().slice(0, 10),
    },
    nutrientsPer100g,
  };
}

async function main() {
  const seeds = JSON.parse(await readFile(SEED_PATH, "utf8"));
  const entries = [];
  for (const seed of seeds) {
    if (!seed.sourceUrl || !seed.sourceUrl.startsWith("https://fooddb.mext.go.jp/")) {
      throw new Error(`${seed.id}: sourceUrl must point to fooddb.mext.go.jp`);
    }
    const response = await fetch(seed.sourceUrl);
    if (!response.ok) {
      throw new Error(`${seed.id}: source fetch failed with ${response.status}`);
    }
    const html = await response.text();
    entries.push(buildEntry(seed, parseFoodDbDetail(html, seed)));
    await sleep(120);
  }
  entries.sort((a, b) => a.category.localeCompare(b.category, "ja") || a.name.localeCompare(b.name, "ja"));
  await writeFile(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(`Wrote ${entries.length} processed food entries to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
