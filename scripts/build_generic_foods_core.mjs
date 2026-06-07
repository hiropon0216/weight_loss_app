import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER_PATH = resolve(ROOT, "data", "generic_foods_core.json");

const REQUIRED_NUTRIENTS = ["energyKcal", "proteinG", "fatG", "carbsG"];

function normalizeNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function normalizeEntry(entry) {
  if (!entry?.id || !entry?.name) {
    throw new Error("generic food entry requires id and name");
  }
  const nutrients = entry.nutrientsPer100g || {};
  for (const key of REQUIRED_NUTRIENTS) {
    if (!Number.isFinite(Number(nutrients[key]))) {
      throw new Error(`${entry.id}: nutrientsPer100g.${key} is required`);
    }
  }
  return {
    id: String(entry.id),
    name: String(entry.name),
    kana: entry.kana ? String(entry.kana) : "",
    aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String).filter(Boolean) : [],
    category: entry.category ? String(entry.category) : "未分類",
    sourceType: entry.sourceType || "mext_static",
    unitMode: "gram",
    unitLabel: "100g",
    ediblePortionNote: entry.ediblePortionNote ? String(entry.ediblePortionNote) : "可食部100gあたり",
    nutrientsPer100g: {
      energyKcal: Math.round(Number(nutrients.energyKcal) || 0),
      proteinG: normalizeNumber(nutrients.proteinG),
      fatG: normalizeNumber(nutrients.fatG),
      carbsG: normalizeNumber(nutrients.carbsG),
      fiberG: normalizeNumber(nutrients.fiberG),
      saltG: normalizeNumber(nutrients.saltG, 2),
    },
  };
}

async function main() {
  const raw = JSON.parse(await readFile(MASTER_PATH, "utf8"));
  if (!Array.isArray(raw)) throw new Error("generic food master must be an array");
  const seen = new Set();
  const normalized = raw.map(normalizeEntry).map((entry) => {
    if (seen.has(entry.id)) throw new Error(`duplicated generic food id: ${entry.id}`);
    seen.add(entry.id);
    return entry;
  });
  normalized.sort((a, b) => a.category.localeCompare(b.category, "ja") || a.name.localeCompare(b.name, "ja"));
  await writeFile(MASTER_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  console.log(`Validated ${normalized.length} generic food entries in ${MASTER_PATH}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
