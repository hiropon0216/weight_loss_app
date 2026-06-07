const STORE_KEY = "weightTracker:v1";
const BACKUP_STORE_KEY = "weightTracker:v1:backup";
const ALPHA = 0.25;
const MS_PER_DAY = 86400000;
const WEEKLY_BOSS_HP = 2000;
const MIN_RECORD_WEIGHT = 30;
const MAX_RECORD_WEIGHT = 199.9;
const CUSTOM_TIMER_PRESET_ID = "custom";
const SAVED_TIMER_PRESET_PREFIX = "saved:";
const GENERIC_FOOD_MASTER_URL = "./data/generic_foods_core.json?v=1";
const PROCESSED_FOOD_MASTER_URL = "./data/processed_foods_core.json?v=1";
const EXERCISE_INTAKE_CREDIT_RATE = 0.75;
const PFC_TARGETS = {
  proteinGPerKg: { min: 1.8, max: 2.2 },
  fatEnergyRatio: { min: 0.2, max: 0.3 },
  carbsEnergyRatio: { min: 0.35, max: 0.55 },
};
const OPEN_FOOD_FACTS_FIELDS = [
  "code",
  "status",
  "result",
  "product_name",
  "brands",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "serving_size",
  "nutrition_data_per",
  "nutriments",
].join(",");
const FALLBACK_GENERIC_FOODS = [
  {
    id: "fallback:lettuce-raw",
    name: "レタス 生",
    kana: "れたす なま",
    aliases: ["レタス", "れたす", "lettuce"],
    category: "野菜類",
    ediblePortionNote: "生・可食部100gあたり",
    nutrientsPer100g: { energyKcal: 11, proteinG: 0.6, fatG: 0.1, carbsG: 2.8, fiberG: 1.1, saltG: 0 },
  },
];
const ROUND_TIMER_PRESETS = [
  { id: "boxing-standard", name: "3分 × 3R", prepSec: 10, workSec: 180, restSec: 60, rounds: 3 },
  { id: "boxing-short", name: "2分 × 3R", prepSec: 10, workSec: 120, restSec: 60, rounds: 3 },
  { id: "hiit", name: "HIIT", prepSec: 10, workSec: 30, restSec: 15, rounds: 8 },
  { id: "tabata", name: "タバタ", prepSec: 10, workSec: 20, restSec: 10, rounds: 8 },
  { id: CUSTOM_TIMER_PRESET_ID, name: "カスタム", prepSec: 10, workSec: 180, restSec: 60, rounds: 3 },
];
const DEFAULT_ROUND_TIMER = {
  presetId: "boxing-standard",
  prepSec: 10,
  workSec: 180,
  restSec: 60,
  rounds: 3,
  sound: true,
  savedPresets: [],
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const todayIso = () => toIsoDate(new Date());
const addDaysIso = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
};

const defaultState = {
  settings: {
    heightCm: 167,
    age: 32,
    sex: "male",
    startDate: todayIso(),
    startWeightKg: 78,
    goalWeightKg: 67,
    goalDate: addDaysIso(112),
  },
  weightEntries: [],
  exerciseLogs: [],
  dailyChecks: [],
  mealLogs: [],
  customFoodMaster: [],
  workoutPlan: null,
  workoutPlans: [],
  workoutHistory: [],
  roundTimer: { ...DEFAULT_ROUND_TIMER },
};

let state = loadState();
let selectedDate = todayIso();
let calendarMonth = selectedDate.slice(0, 7);
let genericFoods = FALLBACK_GENERIC_FOODS;
let foodSearchQuery = "";
let foodSearchStatus = "バーコードはカメラ撮影、または番号入力で検索できます。";
let pendingFoodEntry = null;
let masterFoodEntryOpen = false;
let saveStatusTimer = null;
let settingsFeedbackTimer = null;
let workoutFeedbackTimer = null;
let timerFeedbackTimer = null;
let timerAudioContext = null;
let gongBuffer = null;
let timerLastPhase = null;
let wakeLockSentinel = null;
let wakeLockPending = false;
let roundTimerRuntime = {
  status: "idle",
  stageIndex: 0,
  stages: [],
  remainingMs: null,
  phaseEndsAt: null,
  tickId: null,
  lastCountdownSecond: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return loadBackupState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return loadBackupState();
  }
}

function loadBackupState() {
  try {
    const raw = localStorage.getItem(BACKUP_STORE_KEY);
    if (!raw) return structuredClone(defaultState);
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(saved) {
  const base = structuredClone(defaultState);
  const dailyChecks = Array.isArray(saved?.dailyChecks) ? saved.dailyChecks.map(migrateDailyCheck) : [];
  const mealLogs = Array.isArray(saved?.mealLogs) ? saved.mealLogs.map(normalizeMealLog).filter(Boolean) : [];
  const customFoodMaster = Array.isArray(saved?.customFoodMaster)
    ? saved.customFoodMaster.map(normalizeFoodMasterEntry).filter(Boolean)
    : [];
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved?.settings || {}) },
    weightEntries: Array.isArray(saved?.weightEntries) ? saved.weightEntries : [],
    exerciseLogs: Array.isArray(saved?.exerciseLogs) ? saved.exerciseLogs : [],
    dailyChecks,
    mealLogs,
    customFoodMaster,
    workoutPlans: Array.isArray(saved?.workoutPlans) ? saved.workoutPlans : [],
    workoutHistory: Array.isArray(saved?.workoutHistory) ? saved.workoutHistory : [],
    workoutPlan: saved?.workoutPlan || null,
    roundTimer: normalizeRoundTimer(saved?.roundTimer),
  };
}

function normalizeMealLog(entry) {
  if (!entry || typeof entry !== "object" || !entry.date || !entry.displayName) return null;
  const nutrients = entry.nutrientsSnapshot && typeof entry.nutrientsSnapshot === "object"
    ? entry.nutrientsSnapshot
    : {};
  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: entry.date,
    sourceType: entry.sourceType || "generic",
    foodId: entry.foodId || "",
    displayName: entry.displayName,
    category: entry.category || "",
    amountG: Number(entry.amountG) || 0,
    amountLabel: typeof entry.amountLabel === "string" ? entry.amountLabel : "",
    nutrientsSnapshot: {
      energyKcal: Number(nutrients.energyKcal) || 0,
      proteinG: Number(nutrients.proteinG) || 0,
      fatG: Number(nutrients.fatG) || 0,
      carbsG: Number(nutrients.carbsG) || 0,
      fiberG: Number(nutrients.fiberG) || 0,
      saltG: Number(nutrients.saltG) || 0,
    },
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeSavedTimerPresets(presets) {
  if (!Array.isArray(presets)) return [];
  return presets
    .filter((preset) => preset && typeof preset === "object")
    .map((preset) => ({
      id: typeof preset.id === "string" && preset.id ? preset.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: typeof preset.name === "string" && preset.name.trim() ? preset.name.trim().slice(0, 32) : "保存設定",
      prepSec: clampInt(preset.prepSec, 0, 600, DEFAULT_ROUND_TIMER.prepSec),
      workSec: clampInt(preset.workSec, 1, 3600, DEFAULT_ROUND_TIMER.workSec),
      restSec: clampInt(preset.restSec, 0, 1800, DEFAULT_ROUND_TIMER.restSec),
      rounds: clampInt(preset.rounds, 1, 99, DEFAULT_ROUND_TIMER.rounds),
    }))
    .slice(0, 20);
}

function normalizeRoundTimer(timer) {
  const savedPresets = normalizeSavedTimerPresets(timer?.savedPresets);
  const legacyPresetMap = {
    "sandbag-standard": "boxing-standard",
    "sandbag-short": "boxing-short",
  };
  const normalizedPresetId = legacyPresetMap[timer?.presetId] || timer?.presetId;
  const presetId = ROUND_TIMER_PRESETS.some((preset) => preset.id === normalizedPresetId)
    || savedPresets.some((preset) => `${SAVED_TIMER_PRESET_PREFIX}${preset.id}` === normalizedPresetId)
    ? normalizedPresetId
    : DEFAULT_ROUND_TIMER.presetId;
  return {
    presetId,
    prepSec: clampInt(timer?.prepSec, 0, 600, DEFAULT_ROUND_TIMER.prepSec),
    workSec: clampInt(timer?.workSec, 1, 3600, DEFAULT_ROUND_TIMER.workSec),
    restSec: clampInt(timer?.restSec, 0, 1800, DEFAULT_ROUND_TIMER.restSec),
    rounds: clampInt(timer?.rounds, 1, 99, DEFAULT_ROUND_TIMER.rounds),
    sound: timer?.sound !== false,
    savedPresets,
  };
}

function migrateDailyCheck(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return {
    date: entry.date,
    exerciseDone: Boolean(entry.exerciseDone),
    protein100: Boolean(entry.protein100),
    vegetables350: Boolean(entry.vegetables350 || entry.vegetablesFiber),
    carbPortion: Boolean(entry.carbPortion || entry.lunchCarbPortion || entry.dinnerCarbPortion),
    noFried: Boolean(entry.noFried || entry.noHighFat || entry.lunchNoFried || entry.dinnerNoFried),
    noJuiceAlcohol: Boolean(entry.noJuiceAlcohol || entry.noAlcoholSweets),
    noSweets: Boolean(entry.noSweets || entry.noAlcoholSweets),
    noLateSnack: Boolean(entry.noLateSnack),
    water1500: Boolean(entry.water1500),
    note: typeof entry.note === "string" ? entry.note : "",
  };
}

function saveState(message = "保存済み") {
  const current = localStorage.getItem(STORE_KEY);
  if (current) localStorage.setItem(BACKUP_STORE_KEY, current);
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  showSaveStatus(message);
}

function showSaveStatus(message = "保存済み") {
  const status = document.querySelector("#saveStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.add("saved");
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    status.textContent = "端末内保存";
    status.classList.remove("saved");
  }, 1600);
}

function showSettingsSavedFeedback() {
  const feedback = document.querySelector("#settingsFeedback");
  const button = document.querySelector("#saveSettingsButton");
  if (!feedback || !button) return;
  feedback.textContent = "設定を保存しました。目標とBMI指標を更新済みです。";
  feedback.classList.add("active");
  button.textContent = "保存しました";
  button.classList.add("saved");
  if (settingsFeedbackTimer) clearTimeout(settingsFeedbackTimer);
  settingsFeedbackTimer = setTimeout(() => {
    feedback.classList.remove("active");
    button.textContent = "設定を保存";
    button.classList.remove("saved");
  }, 2200);
}

function showWorkoutGeneratedFeedback(plan) {
  const feedback = document.querySelector("#workoutFeedback");
  const button = document.querySelector("#generateWorkout");
  const menu = document.querySelector("#exerciseGeneratedMenu");
  if (!feedback || !button) return;
  const kcal = workoutPlanKcal(plan);
  const date = plan.date.replaceAll("-", "/");
  feedback.textContent = plan.items.length
    ? `${date} の最適メニューを生成しました。${plan.items.length}種目で約${kcal}kcalを削ります。記録画面にも反映済みです。`
    : `${date} の休養メニューを生成しました。実施する種目をONにすると、運動メニューを作れます。`;
  feedback.classList.add("active");
  button.textContent = "生成しました";
  button.classList.add("saved");
  menu?.classList.add("just-generated");
  if (workoutFeedbackTimer) clearTimeout(workoutFeedbackTimer);
  workoutFeedbackTimer = setTimeout(() => {
    feedback.classList.remove("active");
    button.textContent = "最適メニューの自動生成";
    button.classList.remove("saved");
    menu?.classList.remove("just-generated");
  }, 2600);
}

function sortedWeights() {
  return [...state.weightEntries].sort((a, b) => a.date.localeCompare(b.date));
}

function trendSeries() {
  let trend = null;
  return sortedWeights().map((entry) => {
    trend = trend === null ? entry.weightKg : trend + ALPHA * (entry.weightKg - trend);
    return { ...entry, trendKg: round1(trend) };
  });
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function daysBetween(a, b) {
  const start = new Date(`${a}T00:00:00`);
  const end = new Date(`${b}T00:00:00`);
  return Math.round((end - start) / MS_PER_DAY);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeFoodMasterEntry(food) {
  if (!food || typeof food !== "object" || !food.id || !food.name) return null;
  const nutrients = food.nutrientsPer100g && typeof food.nutrientsPer100g === "object"
    ? food.nutrientsPer100g
    : {};
  const unitNutrients = food.nutrientsPerUnit && typeof food.nutrientsPerUnit === "object"
    ? food.nutrientsPerUnit
    : nutrients;
  const unitMode = food.unitMode === "serving" ? "serving" : "gram";
  const unitLabel = typeof food.unitLabel === "string" && food.unitLabel.trim()
    ? food.unitLabel.trim()
    : unitMode === "serving" ? "1食" : "100g";
  return {
    id: String(food.id),
    name: String(food.name),
    kana: typeof food.kana === "string" ? food.kana : "",
    aliases: Array.isArray(food.aliases) ? food.aliases.filter(Boolean).map(String) : [],
    category: typeof food.category === "string" ? food.category : "未分類",
    sourceType: food.sourceType || "generic",
    unitMode,
    unitLabel,
    servingGrams: Number(food.servingGrams) || 0,
    ediblePortionNote: typeof food.ediblePortionNote === "string" ? food.ediblePortionNote : unitMode === "serving" ? `${unitLabel}あたり` : "100gあたり",
    nutrientsPer100g: {
      energyKcal: Number(nutrients.energyKcal) || 0,
      proteinG: Number(nutrients.proteinG) || 0,
      fatG: Number(nutrients.fatG) || 0,
      carbsG: Number(nutrients.carbsG) || 0,
      fiberG: Number(nutrients.fiberG) || 0,
      saltG: Number(nutrients.saltG) || 0,
    },
    nutrientsPerUnit: {
      energyKcal: Number(unitNutrients.energyKcal) || 0,
      proteinG: Number(unitNutrients.proteinG) || 0,
      fatG: Number(unitNutrients.fatG) || 0,
      carbsG: Number(unitNutrients.carbsG) || 0,
      fiberG: Number(unitNutrients.fiberG) || 0,
      saltG: Number(unitNutrients.saltG) || 0,
    },
  };
}

async function fetchFoodMaster(url) {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error("food master unavailable");
    const foods = await response.json();
    return Array.isArray(foods) ? foods.map(normalizeFoodMasterEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function loadGenericFoodMaster() {
  try {
    const [generic, processed] = await Promise.all([
      fetchFoodMaster(GENERIC_FOOD_MASTER_URL),
      fetchFoodMaster(PROCESSED_FOOD_MASTER_URL),
    ]);
    const normalized = [...generic, ...processed];
    genericFoods = normalized.length ? normalized : FALLBACK_GENERIC_FOODS;
    renderFood();
    renderRecordNutritionSummary();
  } catch {
    genericFoods = FALLBACK_GENERIC_FOODS;
    renderFood();
  }
}

function getFoodById(id) {
  return foodMasterList().find((food) => food.id === id) || null;
}

function foodMasterList() {
  return [...genericFoods, ...(state.customFoodMaster || [])];
}

function foodSearchHaystack(food) {
  return [
    food.name,
    food.kana,
    food.category,
    food.ediblePortionNote,
    ...(food.aliases || []),
  ].join(" ").toLowerCase();
}

function searchGenericFoods(query = foodSearchQuery) {
  const term = query.trim().toLowerCase();
  const foods = foodMasterList();
  if (!term) return foods.slice(0, 8);
  return foods
    .map((food) => {
      const haystack = foodSearchHaystack(food);
      const exact = food.name.toLowerCase() === term || (food.aliases || []).some((alias) => alias.toLowerCase() === term);
      const starts = food.name.toLowerCase().startsWith(term) || food.kana.toLowerCase().startsWith(term);
      const includes = haystack.includes(term);
      const category = food.category.toLowerCase().includes(term);
      const score = exact ? 4 : starts ? 3 : category ? 2 : includes ? 1 : 0;
      return { food, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, "ja"))
    .slice(0, 20)
    .map((entry) => entry.food);
}

function calculateFoodNutrients(food, amountG) {
  const amount = Number(amountG) || 0;
  const servingMode = food?.unitMode === "serving";
  const factor = servingMode ? amount : amount / 100;
  const nutrients = servingMode ? food?.nutrientsPerUnit || {} : food?.nutrientsPer100g || {};
  return {
    energyKcal: Math.round((Number(nutrients.energyKcal) || 0) * factor),
    proteinG: round1((Number(nutrients.proteinG) || 0) * factor),
    fatG: round1((Number(nutrients.fatG) || 0) * factor),
    carbsG: round1((Number(nutrients.carbsG) || 0) * factor),
    fiberG: round1((Number(nutrients.fiberG) || 0) * factor),
    saltG: round2((Number(nutrients.saltG) || 0) * factor),
  };
}

function foodUnitBaseLabel(food) {
  return food?.unitMode === "serving" ? food.unitLabel || "1食" : "100g";
}

function foodAmountUnit(food) {
  return food?.unitMode === "serving" ? (food.unitLabel || "食").replace(/^1/, "") || "食" : "g";
}

function foodAmountStep(food) {
  return food?.unitMode === "serving" ? "0.5" : "1";
}

function foodAmountLabel(food, amount) {
  const value = Number(amount) || 0;
  if (food?.unitMode === "serving") {
    const unit = foodAmountUnit(food);
    return `${Number.isInteger(value) ? value : round1(value)}${unit}`;
  }
  return `${round1(value)}g`;
}

function foodAmountG(food, amount) {
  const value = Number(amount) || 0;
  if (food?.unitMode === "serving") return food.servingGrams ? round1(food.servingGrams * value) : 0;
  return value;
}

function mealLogsForDate(date) {
  return (state.mealLogs || [])
    .filter((entry) => entry.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function nutritionTotals(date) {
  return mealLogsForDate(date).reduce((totals, entry) => {
    const nutrients = entry.nutrientsSnapshot || {};
    totals.energyKcal += Number(nutrients.energyKcal) || 0;
    totals.proteinG += Number(nutrients.proteinG) || 0;
    totals.fatG += Number(nutrients.fatG) || 0;
    totals.carbsG += Number(nutrients.carbsG) || 0;
    totals.fiberG += Number(nutrients.fiberG) || 0;
    totals.saltG += Number(nutrients.saltG) || 0;
    return totals;
  }, { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0, saltG: 0 });
}

function formatKcal(value) {
  return `${Math.round(Number(value) || 0)} kcal`;
}

function formatGram(value) {
  return `${round1(Number(value) || 0).toFixed(1)}g`;
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalInputNumber(selector) {
  const value = document.querySelector(selector)?.value;
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatWeightInputValue(rawValue) {
  const digits = String(rawValue || "").replace(/\D/g, "");
  if (!digits) return "";
  const allowsHundreds = digits[0] === "1";
  const limit = allowsHundreds ? 4 : 3;
  const trimmed = digits.slice(0, limit);
  if (!allowsHundreds && trimmed.length === 3) {
    return `${trimmed.slice(0, 2)}.${trimmed.slice(2)}`;
  }
  if (allowsHundreds && trimmed.length === 4) {
    return `${trimmed.slice(0, 3)}.${trimmed.slice(3)}`;
  }
  return trimmed;
}

function parseWeightInputValue(rawValue) {
  const formatted = formatWeightInputValue(rawValue);
  if (!formatted) return null;
  if (!/^\d{1,3}(?:\.\d)?$/.test(formatted)) return null;
  const weight = Number(formatted);
  if (!Number.isFinite(weight)) return null;
  if (weight < MIN_RECORD_WEIGHT || weight > MAX_RECORD_WEIGHT) return null;
  return round1(weight);
}

function syncWeightInputFormatting() {
  const input = document.querySelector("#weightInput");
  if (!input) return;
  const formatted = formatWeightInputValue(input.value);
  if (input.value !== formatted) input.value = formatted;
}

function parseGrams(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(",", ".").toLowerCase();
  const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*(g|ｇ|gram|grams)/);
  if (!match) return null;
  return Number(match[1]);
}

function nutrimentValue(nutriments, key) {
  return optionalNumber(nutriments?.[key]);
}

function nutrimentsByBasis(nutriments, suffix) {
  return {
    energyKcal: nutrimentValue(nutriments, `energy-kcal_${suffix}`),
    proteinG: nutrimentValue(nutriments, `proteins_${suffix}`),
    fatG: nutrimentValue(nutriments, `fat_${suffix}`),
    carbsG: nutrimentValue(nutriments, `carbohydrates_${suffix}`),
    fiberG: nutrimentValue(nutriments, `fiber_${suffix}`),
    saltG: nutrimentValue(nutriments, `salt_${suffix}`),
  };
}

function emptyNutrients() {
  return { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0, saltG: 0 };
}

function roundNutrients(nutrients) {
  return {
    energyKcal: Math.round(Number(nutrients.energyKcal) || 0),
    proteinG: round1(Number(nutrients.proteinG) || 0),
    fatG: round1(Number(nutrients.fatG) || 0),
    carbsG: round1(Number(nutrients.carbsG) || 0),
    fiberG: round1(Number(nutrients.fiberG) || 0),
    saltG: round2(Number(nutrients.saltG) || 0),
  };
}

function scaleNutrients(nutrients, factor) {
  return roundNutrients({
    energyKcal: (Number(nutrients.energyKcal) || 0) * factor,
    proteinG: (Number(nutrients.proteinG) || 0) * factor,
    fatG: (Number(nutrients.fatG) || 0) * factor,
    carbsG: (Number(nutrients.carbsG) || 0) * factor,
    fiberG: (Number(nutrients.fiberG) || 0) * factor,
    saltG: (Number(nutrients.saltG) || 0) * factor,
  });
}

function hasKcal(nutrients) {
  return Number.isFinite(Number(nutrients?.energyKcal));
}

function normalizeBarcodeProduct(payload, barcode) {
  if (!payload || payload.status !== "success" || !payload.product) {
    return { found: false, code: barcode };
  }
  const product = payload.product;
  const nutriments = product.nutriments || {};
  const perServingRaw = nutrimentsByBasis(nutriments, "serving");
  const per100Raw = nutrimentsByBasis(nutriments, "100g");
  const packageSizeG = optionalNumber(product.product_quantity) || parseGrams(product.quantity);
  const servingSizeG = parseGrams(product.serving_size) || packageSizeG;
  const name = product.product_name || "名称未登録の商品";
  const brand = product.brands || "";
  const base = {
    code: payload.code || barcode,
    name,
    brand,
    quantityLabel: product.quantity || "",
    servingSizeLabel: product.serving_size || "",
    packageSizeG,
    servingSizeG,
    rawBasis: product.nutrition_data_per || "",
  };

  if (hasKcal(perServingRaw)) {
    return {
      found: true,
      complete: true,
      basis: "serving",
      unit: "食",
      amountLabelBase: servingSizeG ? `1食 ${round1(servingSizeG)}g` : "1食",
      amountGPerUnit: servingSizeG || 0,
      nutrientsPerUnit: roundNutrients(perServingRaw),
      nutrientsPer100g: hasKcal(per100Raw) ? roundNutrients(per100Raw) : null,
      ...base,
    };
  }

  if (hasKcal(per100Raw) && packageSizeG) {
    return {
      found: true,
      complete: true,
      basis: "package",
      unit: "個",
      amountLabelBase: `1個 ${round1(packageSizeG)}g`,
      amountGPerUnit: packageSizeG,
      nutrientsPerUnit: scaleNutrients(per100Raw, packageSizeG / 100),
      nutrientsPer100g: roundNutrients(per100Raw),
      ...base,
    };
  }

  if (hasKcal(per100Raw)) {
    return {
      found: true,
      complete: true,
      basis: "gram",
      unit: "g",
      amountLabelBase: "100g",
      amountGPerUnit: 1,
      nutrientsPerUnit: roundNutrients(per100Raw),
      nutrientsPer100g: roundNutrients(per100Raw),
      ...base,
    };
  }

  return {
    found: true,
    complete: false,
    reason: "nutrition_missing",
    ...base,
  };
}

async function lookupBarcodeProduct(barcode) {
  const code = barcode.replace(/\D/g, "");
  if (!code) throw new Error("barcode_required");
  const endpoint = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=${encodeURIComponent(OPEN_FOOD_FACTS_FIELDS)}`;
  const response = await fetch(endpoint, { method: "GET" });
  const payload = await response.json();
  return normalizeBarcodeProduct(payload, code);
}

function calculateBarcodeNutrients(product, amount) {
  if (!product || !product.complete) return emptyNutrients();
  const value = Number(amount) || 0;
  if (product.basis === "gram") {
    return scaleNutrients(product.nutrientsPerUnit, value / 100);
  }
  return scaleNutrients(product.nutrientsPerUnit, value);
}

function barcodeAmountG(product, amount) {
  const value = Number(amount) || 0;
  if (!product) return 0;
  if (product.basis === "gram") return value;
  return product.amountGPerUnit ? round1(product.amountGPerUnit * value) : 0;
}

function barcodeAmountLabel(product, amount) {
  const value = Number(amount) || 0;
  if (!product) return "";
  if (product.basis === "gram") return `${round1(value)}g`;
  const unitValue = Number.isInteger(value) ? String(value) : String(round1(value));
  return `${unitValue}${product.unit}`;
}

function barcodeDisplayName(product) {
  if (!product) return "";
  return [product.brand, product.name].filter(Boolean).join(" ");
}

function latestEntry() {
  return sortedWeights().at(-1) || null;
}

function latestTrend() {
  return trendSeries().at(-1) || null;
}

function recentAverage(days) {
  const entries = sortedWeights();
  if (!entries.length) return null;
  const latest = entries.at(-1).date;
  const values = entries
    .filter((entry) => daysBetween(entry.date, latest) < days)
    .map((entry) => entry.weightKg);
  return average(values);
}

function currentWeekAverage() {
  const entries = sortedWeights();
  if (!entries.length) return null;
  const latest = new Date(`${entries.at(-1).date}T00:00:00`);
  const day = latest.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(latest);
  monday.setDate(latest.getDate() + mondayOffset);
  const mondayIso = toIsoDate(monday);
  return average(entries.filter((entry) => entry.date >= mondayIso).map((entry) => entry.weightKg));
}

function trendPacePerWeek() {
  const series = trendSeries();
  if (series.length < 2) return null;
  const latest = series.at(-1);
  const anchor = [...series].reverse().find((entry) => daysBetween(entry.date, latest.date) >= 14) || series[0];
  const elapsed = Math.max(1, daysBetween(anchor.date, latest.date));
  return ((latest.trendKg - anchor.trendKg) / elapsed) * 7;
}

function requiredPacePerWeek() {
  const referenceDate = latestTrend()?.date || latestEntry()?.date || todayIso();
  const baseWeight = currentBodyWeightKg();
  const daysLeft = daysBetween(referenceDate, state.settings.goalDate);
  if (daysLeft <= 0) return null;
  return ((state.settings.goalWeightKg - baseWeight) / daysLeft) * 7;
}

function forecastGoalDate() {
  const latest = latestTrend();
  const pace = trendPacePerWeek();
  if (!latest || pace === null || pace >= -0.01) return null;
  const remaining = latest.trendKg - state.settings.goalWeightKg;
  if (remaining <= 0) return latest.date;
  const days = Math.round((remaining / Math.abs(pace)) * 7);
  const d = new Date(`${latest.date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function bmi(weightKg) {
  const heightM = state.settings.heightCm / 100;
  return weightKg / (heightM * heightM);
}

function basalMetabolicRate(weightKg = currentBodyWeightKg()) {
  const heightCm = Number(state.settings.heightCm) || 0;
  const age = Number(state.settings.age) || 0;
  if (!heightCm || !age || !weightKg) return null;
  const sexAdjustment = state.settings.sex === "female" ? -161 : 5;
  return Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexAdjustment);
}

function requiredDailyDeficitKcal() {
  const referenceDate = latestTrend()?.date || latestEntry()?.date || todayIso();
  const daysLeft = daysBetween(referenceDate, state.settings.goalDate);
  const baseWeight = currentBodyWeightKg();
  const remainingKg = baseWeight - state.settings.goalWeightKg;
  if (daysLeft <= 0 || remainingKg <= 0) return null;
  return Math.round((remainingKg * 7200) / daysLeft);
}

function exerciseIntakeCreditKcal(date) {
  return Math.round(exerciseBurnForDate(date) * EXERCISE_INTAKE_CREDIT_RATE);
}

function intakeGuidance(date) {
  const bmr = basalMetabolicRate();
  const required = requiredDailyDeficitKcal();
  if (!bmr || required === null) return null;
  const exercise = exerciseBurnForDate(date);
  const exerciseCredit = exerciseIntakeCreditKcal(date);
  const lower = bmr;
  const upper = Math.max(lower, bmr + exerciseCredit - required);
  const intake = Math.round(nutritionTotals(date).energyKcal);
  const actualDeficit = Math.round((bmr + exerciseCredit) - intake);
  return {
    bmr,
    exercise,
    exerciseCredit,
    required,
    lower,
    upper,
    intake,
    actualDeficit,
    hasFoodLog: mealLogsForDate(date).length > 0,
  };
}

function weightForBmi(targetBmi) {
  const heightM = state.settings.heightCm / 100;
  return targetBmi * heightM * heightM;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function render() {
  renderToday();
  renderCalendar();
  renderTrend();
  renderExercise();
  renderFood();
  renderRoundTimer();
  renderSettings();
}

function renderToday() {
  const selectedWeight = state.weightEntries.find((entry) => entry.date === selectedDate);
  const trend = latestTrend();
  const target = state.settings.goalWeightKg;
  const trendWeight = trend?.trendKg ?? state.settings.startWeightKg;
  const bmiBaseWeight = selectedWeight?.weightKg ?? trend?.trendKg ?? state.settings.startWeightKg;
  const start = state.settings.startWeightKg;
  const totalToLose = Math.max(0.1, start - target);
  const lost = Math.max(0, start - trendWeight);
  const progress = Math.max(0, Math.min(100, (lost / totalToLose) * 100));
  const remaining = Math.max(0, trendWeight - target);
  const forecast = forecastGoalDate();

  setText("#trendWeight", trend ? trend.trendKg.toFixed(1) : "--.-");
  setText("#trendCaption", trend ? `${trend.date}時点。実測の揺れを25%ずつ反映しています。` : "朝の体重を入力すると、ぶれをならして表示します。");
  setText("#progressPercent", `${Math.round(progress)}%`);
  setText("#actualWeight", selectedWeight ? `${selectedWeight.weightKg.toFixed(1)} kg` : "--.- kg");
  setText("#remainingWeight", `${remaining.toFixed(1)} kg`);
  setText("#bmiValue", round1(bmi(bmiBaseWeight)).toFixed(1));
  setText("#forecastDate", forecast || "--");

  const ring = document.querySelector("#progressRing");
  ring.style.strokeDashoffset = String(301.59 * (1 - progress / 100));

  document.querySelector("#weightInput").value = selectedWeight ? selectedWeight.weightKg.toFixed(1) : "";
  document.querySelector("#deleteRecord").disabled = !selectedWeight && !hasSelectedCheckData() && !mealLogsForDate(selectedDate).length;
  setText("#streakDays", `${streakDays()}日`);
  setText("#monthEntries", `${entriesInMonth(calendarMonth)}回`);

  const checks = getSelectedCheck();
  setExerciseSegment(Boolean(checks.exerciseDone));
  updateFoodBurner();
  setDecisionStamp(document.querySelector("#dailyRank"), dailyDecision(selectedDate));
  renderRecordNutritionSummary();
  renderExerciseMotivation();
  renderRecordWorkoutPlan();
}

function renderCalendar() {
  const grid = document.querySelector("#calendarGrid");
  const [year, month] = calendarMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - startOffset);
  const recorded = new Set(state.weightEntries.map((entry) => entry.date));
  const scored = new Map(calendarScoreEntries().map((entry) => [entry.date, entry.rank]));
  const today = todayIso();

  setText("#calendarTitle", `${year}年${month}月`);
  grid.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const iso = toIsoDate(day);
    const classes = [
      "day-cell",
      day.getMonth() === month - 1 ? "" : "outside",
      iso === today ? "today" : "",
      iso === selectedDate ? "selected" : "",
      recorded.has(iso) ? "has-weight" : "",
    ].filter(Boolean).join(" ");
    const decision = scored.get(iso);
    const badge = decision ? `<span class="score-badge ${decisionClass(decision.status)}">${escapeHtml(decision.short)}</span>` : "";
    return `<button class="${classes}" type="button" data-date="${iso}" aria-label="${iso}">${day.getDate()}${badge}</button>`;
  }).join("");
}

function renderTrend() {
  const avg7 = recentAverage(7);
  const weekAvg = currentWeekAverage();
  const pace = trendPacePerWeek();
  const required = requiredPacePerWeek();

  setText("#avg7", avg7 ? `${round1(avg7).toFixed(1)} kg` : "--.- kg");
  setText("#weekAvg", weekAvg ? `${round1(weekAvg).toFixed(1)} kg` : "--.- kg");
  setText("#currentPace", pace === null ? "-- kg/週" : `${round2(pace).toFixed(2)} kg/週`);
  setText("#requiredPace", required === null ? "-- kg/週" : `${round2(required).toFixed(2)} kg/週`);

  const notice = document.querySelector("#paceNotice");
  notice.classList.toggle("warn", required !== null && Math.abs(required) > 0.9);
  const dailyDeficit = requiredDailyDeficitKcal();
  const baseWeightLabel = latestTrend() ? "トレンド体重基準" : "現在体重基準";
  if (required === null || dailyDeficit === null) {
    notice.textContent = "目標と期限を設定すると必要ペースと目標カロリー差を表示します。";
  } else if (Math.abs(required) > 1.0) {
    notice.textContent = `${baseWeightLabel}で週${Math.abs(required).toFixed(2)}kg、1日約${dailyDeficit}kcalのカロリー差が必要です。危険ラインの週1.0kgを超えているため、目標か期限の見直しを推奨します。`;
  } else {
    notice.textContent = `${baseWeightLabel}で週${Math.abs(required).toFixed(2)}kg、1日約${dailyDeficit}kcalのカロリー差が目安です。日々の実測ではなくトレンド体重で見ていきます。`;
  }

  drawChart();
  renderWeeklySummary();
}

function earliestActivityDate() {
  const dates = [
    ...state.weightEntries.map((entry) => entry.date),
    ...state.dailyChecks.filter(checkHasData).map((entry) => entry.date),
    ...(state.mealLogs || []).map((entry) => entry.date),
  ];
  return dates.length ? dates.reduce((min, date) => (date < min ? date : min)) : null;
}

function renderWeeklySummary() {
  const entries = sortedWeights();
  const latestDate = entries.at(-1)?.date || todayIso();
  const end = new Date(`${latestDate}T00:00:00`);
  const windowStart = new Date(end);
  windowStart.setDate(end.getDate() - 6);
  // 利用開始前の日を0点で不当に数えないよう、最初の記録日を下限にする
  const firstActivity = earliestActivityDate();
  const start = firstActivity && firstActivity > toIsoDate(windowStart)
    ? new Date(`${firstActivity}T00:00:00`)
    : windowStart;
  const startIso = toIsoDate(start);

  const results = [];
  let recordedDays = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = toIsoDate(cursor);
    const hasRecord = state.weightEntries.some((entry) => entry.date === date);
    const hasCheck = state.dailyChecks.some((entry) => entry.date === date && checkHasData(entry));
    const hasMeal = mealLogsForDate(date).length > 0;
    if (hasRecord || hasCheck || hasMeal) recordedDays += 1;
    results.push(dailyDecision(date));
  }

  const totalDays = results.length;
  const recordedFoodDays = results.filter((entry) => entry.guidance?.hasFoodLog).length;
  const totalRequired = results.reduce((sum, entry) => sum + (entry.guidance?.required || 0), 0);
  const totalActual = results.reduce((sum, entry) => sum + (entry.guidance?.hasFoodLog ? (entry.guidance?.actualDeficit || 0) : 0), 0);
  const weeklyDecision = weeklyDecisionSummary(results, recordedDays);
  setText("#weeklyRange", `${startIso.replaceAll("-", "/")} - ${latestDate.replaceAll("-", "/")}`);
  setDecisionStamp(document.querySelector("#weeklyRank"), weeklyDecision);

  const comment = document.querySelector("#weeklyComment");
  if (!recordedDays) {
    comment.textContent = "この期間にはまだ評価対象の記録がありません。";
  } else {
    comment.textContent = `直近${totalDays}日で食事記録は${recordedFoodDays}日、目標カロリー差は合計${totalRequired}kcal、実績カロリー差は${totalActual}kcalです。${weeklyDecision.reason}`;
  }
}

function renderExercise() {
  ["strength", "bag", "running"].forEach((type) => {
    if (!selectedPlanLevel(type)) setPlanLevel(type, "normal");
  });
  renderWorkoutPlan();
  renderRecordWorkoutPlan();
}

function renderFood() {
  renderFoodSearch();
  renderMasterFoodForm();
  renderPendingFoodResult();
  renderFoodTodaySummary();
  renderMealHistory();
}

function renderFoodSearch() {
  const input = document.querySelector("#foodSearchInput");
  const container = document.querySelector("#foodSearchResults");
  const status = document.querySelector("#foodSearchStatus");
  if (!input || !container) return;
  if (document.activeElement !== input) input.value = foodSearchQuery;
  if (status) status.textContent = foodSearchStatus;
  const rawQuery = foodSearchQuery.trim();
  const barcodeCandidate = rawQuery.replace(/\D/g, "");
  const compactQuery = rawQuery.replace(/[\s-]/g, "");
  if (!rawQuery) {
    container.innerHTML = `<p class="empty-state">食材名、カテゴリ、バーコード番号を入力してください。</p>`;
    return;
  }
  if (barcodeCandidate.length >= 8 && barcodeCandidate === compactQuery) {
    container.innerHTML = `<p class="empty-state">バーコード番号は商品DBを検索し、結果を「今日一日の摂取」に表示します。</p>`;
    return;
  }
  const results = searchGenericFoods();
  if (!results.length) {
    container.innerHTML = `<p class="empty-state">該当する食材がありません。よく使う食品は食材登録から追加できます。</p>`;
    return;
  }
  container.innerHTML = results.map((food) => {
    const nutrients = food.unitMode === "serving" ? food.nutrientsPerUnit : food.nutrientsPer100g;
    const active = pendingFoodEntry?.type === "generic" && pendingFoodEntry.foodId === food.id ? " active" : "";
    return `
      <button class="food-result-button${active}" type="button" data-food-id="${escapeHtml(food.id)}">
        <span class="food-result-main">
          <strong>${escapeHtml(food.name)}</strong>
          <small>${escapeHtml(food.category)} / ${escapeHtml(food.ediblePortionNote)}</small>
        </span>
        <span class="food-result-kcal">${formatKcal(nutrients.energyKcal)} / ${escapeHtml(foodUnitBaseLabel(food))}</span>
      </button>
    `;
  }).join("");
}

function perUnitNutritionList(label, nutrients) {
  return `
    <div><dt>${escapeHtml(label)}</dt><dd>${formatKcal(nutrients.energyKcal)}</dd></div>
    <div><dt>P<br>たんぱく質</dt><dd>${formatGram(nutrients.proteinG)}</dd></div>
    <div><dt>F<br>脂質</dt><dd>${formatGram(nutrients.fatG)}</dd></div>
    <div><dt>C<br>炭水化物</dt><dd>${formatGram(nutrients.carbsG)}</dd></div>
  `;
}

function nutritionPreviewMarkup(amountLabel, nutrients) {
  return `
    <article>
      <span>${escapeHtml(amountLabel)}</span>
      <strong>${formatKcal(nutrients.energyKcal)}</strong>
    </article>
    <article>
      <span>P（たんぱく質）</span>
      <strong>${formatGram(nutrients.proteinG)}</strong>
    </article>
    <article>
      <span>F（脂質）</span>
      <strong>${formatGram(nutrients.fatG)}</strong>
    </article>
    <article>
      <span>C（炭水化物）</span>
      <strong>${formatGram(nutrients.carbsG)}</strong>
    </article>
  `;
}

function renderPendingFoodResult() {
  const container = document.querySelector("#pendingFoodResult");
  if (!container) return;
  if (!pendingFoodEntry) {
    container.innerHTML = `<p class="empty-state">検索結果を選択すると、ここで量を確認して登録できます。</p>`;
    return;
  }

  if (pendingFoodEntry.type === "generic") {
    const food = getFoodById(pendingFoodEntry.foodId);
    if (!food) {
      pendingFoodEntry = null;
      renderPendingFoodResult();
      return;
    }
    const amountValue = pendingFoodEntry.amountG === "" || pendingFoodEntry.amountG === undefined
      ? ""
      : String(pendingFoodEntry.amountG);
    const nutrients = food.unitMode === "serving" ? food.nutrientsPerUnit : food.nutrientsPer100g;
    const amountUnit = foodAmountUnit(food);
    const amountLabel = food.unitMode === "serving" ? "食べた数" : "食べた量";
    container.innerHTML = `
      <article class="pending-food-card">
        <div class="pending-food-head">
          <div>
            <span class="panel-label">実績登録</span>
            <h3>${escapeHtml(food.name)}</h3>
            <p>${escapeHtml(food.category)} / ${escapeHtml(food.ediblePortionNote)}</p>
          </div>
          <button class="ghost-button pending-close-button" type="button" data-pending-action="clear">×</button>
        </div>
        <dl class="per-100-list">${perUnitNutritionList(foodUnitBaseLabel(food), nutrients)}</dl>
        <div class="pending-food-form">
          <div class="form-row">
            <label for="pendingFoodAmount">${amountLabel}</label>
            <div class="input-with-unit">
              <input id="pendingFoodAmount" data-pending-input="amount" type="number" min="0.1" step="${foodAmountStep(food)}" inputmode="decimal" value="${escapeHtml(amountValue)}" placeholder="${food.unitMode === "serving" ? "1" : "100"}">
              <span>${escapeHtml(amountUnit)}</span>
            </div>
          </div>
          <div class="calculated-nutrition" id="pendingNutritionPreview"></div>
          <p class="pending-food-message" id="pendingFoodMessage" aria-live="polite"></p>
          <button class="primary-button full-button" type="button" data-pending-action="register">食べた！🍽️</button>
        </div>
      </article>
    `;
    renderPendingNutritionPreview();
    return;
  }

  if (pendingFoodEntry.type === "barcode") {
    const product = pendingFoodEntry.product;
    const amount = Number(pendingFoodEntry.amount) || (product.basis === "gram" ? 100 : 1);
    const amountUnit = product.basis === "gram" ? "g" : product.unit;
    const amountLabel = product.basis === "gram" ? "食べた量" : "食べた数";
    container.innerHTML = `
      <article class="pending-food-card">
        <div class="pending-food-head">
          <div>
            <span class="panel-label">実績登録</span>
            <h3>${escapeHtml(barcodeDisplayName(product))}</h3>
            <p>${escapeHtml([
              product.quantityLabel ? `内容量 ${product.quantityLabel}` : "",
              product.servingSizeLabel ? `1食 ${product.servingSizeLabel}` : product.amountLabelBase,
            ].filter(Boolean).join(" / ") || "取得結果を確認してください。")}</p>
          </div>
          <button class="ghost-button pending-close-button" type="button" data-pending-action="clear">×</button>
        </div>
        <dl class="per-100-list">${perUnitNutritionList(product.amountLabelBase, product.nutrientsPerUnit)}</dl>
        <div class="pending-food-form">
          <div class="form-row">
            <label for="pendingFoodAmount">${amountLabel}</label>
            <div class="input-with-unit">
              <input id="pendingFoodAmount" data-pending-input="amount" type="number" min="0.1" step="${product.basis === "gram" ? "1" : "0.5"}" inputmode="decimal" value="${escapeHtml(String(amount))}">
              <span>${escapeHtml(amountUnit)}</span>
            </div>
          </div>
          <div class="calculated-nutrition" id="pendingNutritionPreview"></div>
          <p class="pending-food-message" id="pendingFoodMessage" aria-live="polite"></p>
          <div class="pending-button-row">
            <button class="primary-button" type="button" data-pending-action="register">食べた！🍽️</button>
            <button class="ghost-button" type="button" data-pending-action="manual">手入力で補完</button>
          </div>
        </div>
      </article>
    `;
    renderPendingNutritionPreview();
    return;
  }

  renderManualPendingFood();
}

function renderMasterFoodForm() {
  const container = document.querySelector("#masterFoodEntryPanel");
  if (!container) return;
  if (!masterFoodEntryOpen) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <article class="pending-food-card manual-pending-card">
      <div class="pending-food-head">
        <div>
          <span class="panel-label">食材登録</span>
          <h3>よく食べる食品を登録</h3>
          <p>商品は1個、料理は1食、食材は100g基準で登録します。まとめ料理も1食単位で登録できます。</p>
        </div>
        <button class="ghost-button pending-close-button" type="button" data-master-action="clear">×</button>
      </div>
      <form class="manual-food-form" id="masterFoodForm">
        <div class="form-row">
          <label for="masterFoodName">名称</label>
          <input id="masterFoodName" type="text" placeholder="例: 雪見だいふく / 自作サラダ" required>
        </div>
        <div class="manual-nutrition-grid">
          <div class="form-row">
            <label for="masterFoodUnitMode">登録単位</label>
            <select id="masterFoodUnitMode" required>
              <option value="serving">1個・1食あたり</option>
              <option value="gram">100gあたり</option>
            </select>
          </div>
          <div class="form-row">
            <label for="masterFoodUnitLabel">単位名</label>
            <input id="masterFoodUnitLabel" type="text" placeholder="例: 1個 / 1食 / 1袋" value="1食">
          </div>
          <div class="form-row">
            <label for="masterFoodServingGrams">参考重量 g</label>
            <input id="masterFoodServingGrams" type="number" min="0" step="1" inputmode="decimal" placeholder="任意">
          </div>
          <div class="form-row">
            <label for="masterFoodKcal">kcal 必須</label>
            <input id="masterFoodKcal" type="number" min="1" step="1" inputmode="decimal" required>
          </div>
          <div class="form-row">
            <label for="masterFoodProtein">P（たんぱく質）g</label>
            <input id="masterFoodProtein" type="number" min="0" step="0.1" inputmode="decimal">
          </div>
          <div class="form-row">
            <label for="masterFoodFat">F（脂質）g</label>
            <input id="masterFoodFat" type="number" min="0" step="0.1" inputmode="decimal">
          </div>
          <div class="form-row">
            <label for="masterFoodCarbs">C（炭水化物）g</label>
            <input id="masterFoodCarbs" type="number" min="0" step="0.1" inputmode="decimal">
          </div>
        </div>
        <p class="pending-food-message" id="pendingFoodMessage" aria-live="polite"></p>
        <button class="primary-button full-button" type="submit">食材を登録 📝</button>
      </form>
    </article>
  `;
}

function renderManualPendingFood() {
  const container = document.querySelector("#pendingFoodResult");
  if (!container) return;
  const barcodeLabel = pendingFoodEntry?.barcode ? `バーコード ${pendingFoodEntry.barcode}` : "手入力補完";
  const defaultName = pendingFoodEntry?.name || "";
  container.innerHTML = `
    <article class="pending-food-card manual-pending-card">
      <div class="pending-food-head">
        <div>
          <span class="panel-label">実績登録</span>
          <h3>${escapeHtml(barcodeLabel)}</h3>
          <p>kcalだけ必須。PFCは分かる範囲で補完できます。</p>
        </div>
        <button class="ghost-button pending-close-button" type="button" data-pending-action="clear">×</button>
      </div>
      <form class="manual-food-form" id="pendingManualFoodForm">
        <div class="form-row">
          <label for="pendingManualName">食品名</label>
          <input id="pendingManualName" type="text" value="${escapeHtml(defaultName)}" placeholder="例: コンビニサラダ">
        </div>
        <div class="manual-nutrition-grid">
          <div class="form-row">
            <label for="pendingManualKcal">kcal 必須</label>
            <input id="pendingManualKcal" type="number" min="1" step="1" inputmode="decimal" required>
          </div>
          <div class="form-row">
            <label for="pendingManualProtein">P（たんぱく質）g</label>
            <input id="pendingManualProtein" type="number" min="0" step="0.1" inputmode="decimal">
          </div>
          <div class="form-row">
            <label for="pendingManualFat">F（脂質）g</label>
            <input id="pendingManualFat" type="number" min="0" step="0.1" inputmode="decimal">
          </div>
          <div class="form-row">
            <label for="pendingManualCarbs">C（炭水化物）g</label>
            <input id="pendingManualCarbs" type="number" min="0" step="0.1" inputmode="decimal">
          </div>
        </div>
        <p class="pending-food-message" id="pendingFoodMessage" aria-live="polite"></p>
        <button class="primary-button full-button" type="submit">食べた！🍽️</button>
      </form>
    </article>
  `;
}

function renderPendingNutritionPreview() {
  const container = document.querySelector("#pendingNutritionPreview");
  const input = document.querySelector("#pendingFoodAmount");
  if (!container || !input || !pendingFoodEntry) return;
  const amount = Number(input.value) || 0;
  if (amount <= 0) {
    container.innerHTML = `<p class="empty-state">食べた量を入力すると計算結果を表示します。</p>`;
    return;
  }
  if (pendingFoodEntry.type === "generic") {
    const food = getFoodById(pendingFoodEntry.foodId);
    if (!food) return;
    container.innerHTML = nutritionPreviewMarkup(foodAmountLabel(food, amount), calculateFoodNutrients(food, amount));
    return;
  }
  if (pendingFoodEntry.type === "barcode") {
    const product = pendingFoodEntry.product;
    container.innerHTML = nutritionPreviewMarkup(barcodeAmountLabel(product, amount), calculateBarcodeNutrients(product, amount));
  }
}

function setPendingMessage(message) {
  const element = document.querySelector("#pendingFoodMessage");
  if (element) element.textContent = message;
}

function addMealLog(log, statusMessage = "登録しました。続けて検索できます。") {
  state.mealLogs.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: selectedDate,
    createdAt: new Date().toISOString(),
    ...log,
  });
  pendingFoodEntry = null;
  foodSearchStatus = statusMessage;
  saveState("食事保存済み");
  render();
}

function recentMealHistory(limit = 10) {
  return [...(state.mealLogs || [])]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}

function addMealLogFromHistory(id) {
  const source = (state.mealLogs || []).find((entry) => entry.id === id);
  if (!source) return;
  addMealLog({
    sourceType: source.sourceType,
    foodId: source.foodId,
    displayName: source.displayName,
    category: source.category,
    amountG: source.amountG,
    amountLabel: source.amountLabel,
    nutrientsSnapshot: { ...(source.nutrientsSnapshot || emptyNutrients()) },
  }, `${source.displayName}をもう一度登録しました。`);
}

function setPendingGenericFood(foodId) {
  const food = getFoodById(foodId);
  if (!food) return;
  pendingFoodEntry = { type: "generic", foodId: food.id, amountG: "" };
  foodSearchStatus = food.unitMode === "serving"
    ? "食べた数を入力して、今日の摂取に登録できます。"
    : "食べたg数を入力して、今日の摂取に登録できます。";
  renderFood();
  document.querySelector("#pendingFoodAmount")?.focus();
}

function showManualFoodEntry(context = {}) {
  pendingFoodEntry = {
    type: "manual",
    barcode: context.barcode || "",
    name: context.name || "",
  };
  foodSearchStatus = "kcalだけ必須です。PFCは分かる範囲で補完できます。";
  renderFood();
  document.querySelector("#pendingManualKcal")?.focus();
}

function showMasterFoodEntry() {
  masterFoodEntryOpen = true;
  pendingFoodEntry = null;
  foodSearchStatus = "よく使う食品をマスタに登録できます。単位は100g、または1個・1食から選べます。";
  renderFood();
  document.querySelector("#masterFoodName")?.focus();
}

async function performUnifiedFoodSearch() {
  const input = document.querySelector("#foodSearchInput");
  const rawQuery = (input?.value || foodSearchQuery).trim();
  foodSearchQuery = rawQuery;
  const barcodeCandidate = rawQuery.replace(/\D/g, "");
  const compactQuery = rawQuery.replace(/[\s-]/g, "");
  if (!rawQuery) {
    foodSearchStatus = "食材名、カテゴリ、バーコード番号を入力してください。";
    renderFood();
    return;
  }
  if (barcodeCandidate.length >= 8 && barcodeCandidate === compactQuery) {
    foodSearchStatus = "商品DBを検索しています。";
    pendingFoodEntry = null;
    renderFood();
    try {
      const product = await lookupBarcodeProduct(barcodeCandidate);
      if (!product.found) {
        foodSearchStatus = "商品が見つかりませんでした。kcalだけ入力して補完できます。";
        showManualFoodEntry({ barcode: barcodeCandidate });
        return;
      }
      if (!product.complete) {
        foodSearchStatus = "商品名は取得できましたが、栄養値が不足しています。kcalだけ入力して補完できます。";
        showManualFoodEntry({ barcode: barcodeCandidate, name: barcodeDisplayName(product) || product.name });
        return;
      }
      pendingFoodEntry = {
        type: "barcode",
        product,
        amount: product.basis === "gram" ? 100 : 1,
      };
      foodSearchStatus = "商品情報を取得しました。内容を確認して登録してください。";
      renderFood();
      document.querySelector("#pendingFoodAmount")?.focus();
    } catch {
      foodSearchStatus = "通信に失敗しました。kcalだけ入力して補完できます。";
      showManualFoodEntry({ barcode: barcodeCandidate });
    }
    return;
  }

  const results = searchGenericFoods(rawQuery);
  foodSearchStatus = results.length
    ? "候補を選択すると、今日の摂取欄で量を入力できます。"
    : "該当する食材がありません。よく使う食品は食材登録から追加できます。";
  renderFood();
}

async function decodeBarcodeFromImage(file) {
  if (!file) return { code: "", reason: "empty" };
  if (!("BarcodeDetector" in window)) {
    return { code: "", reason: "unsupported" };
  }
  let imageBitmap = null;
  try {
    let formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
    if (typeof BarcodeDetector.getSupportedFormats === "function") {
      const supported = await BarcodeDetector.getSupportedFormats();
      formats = formats.filter((format) => supported.includes(format));
    }
    const detector = formats.length ? new BarcodeDetector({ formats }) : new BarcodeDetector();
    imageBitmap = await createImageBitmap(file);
    const codes = await detector.detect(imageBitmap);
    const code = codes?.[0]?.rawValue?.replace(/\D/g, "") || "";
    return code ? { code, reason: "" } : { code: "", reason: "not_found" };
  } catch {
    return { code: "", reason: "failed" };
  } finally {
    imageBitmap?.close?.();
  }
}

function registerPendingFood() {
  if (!pendingFoodEntry) return;
  if (pendingFoodEntry.type === "generic") {
    const food = getFoodById(pendingFoodEntry.foodId);
    const amount = Number(document.querySelector("#pendingFoodAmount")?.value);
    if (!food || !Number.isFinite(amount) || amount <= 0) {
      setPendingMessage(food?.unitMode === "serving" ? "食べた数を入力してください。" : "食べたg数を入力してください。");
      return;
    }
    addMealLog({
      sourceType: food.sourceType === "custom" ? "custom_master" : "generic",
      foodId: food.id,
      displayName: food.name,
      category: food.category,
      amountG: foodAmountG(food, amount),
      amountLabel: foodAmountLabel(food, amount),
      nutrientsSnapshot: calculateFoodNutrients(food, amount),
    });
    return;
  }
  if (pendingFoodEntry.type === "barcode") {
    const product = pendingFoodEntry.product;
    const amount = Number(document.querySelector("#pendingFoodAmount")?.value);
    if (!product?.complete || !Number.isFinite(amount) || amount <= 0) {
      setPendingMessage("食べた量を入力してください。");
      return;
    }
    addMealLog({
      sourceType: "barcode",
      foodId: `barcode:${product.code}`,
      displayName: barcodeDisplayName(product),
      category: "加工食品",
      amountG: barcodeAmountG(product, amount),
      amountLabel: barcodeAmountLabel(product, amount),
      nutrientsSnapshot: calculateBarcodeNutrients(product, amount),
    });
  }
}

function registerManualFood() {
  if (!pendingFoodEntry || pendingFoodEntry.type !== "manual") return;
  const kcal = Number(document.querySelector("#pendingManualKcal")?.value);
  if (!Number.isFinite(kcal) || kcal <= 0) {
    setPendingMessage("kcalは必須です。1以上の数値を入力してください。");
    return;
  }
  const name = document.querySelector("#pendingManualName")?.value.trim()
    || pendingFoodEntry.name
    || (pendingFoodEntry.barcode ? `バーコード ${pendingFoodEntry.barcode}` : "手入力食品");
  addMealLog({
    sourceType: pendingFoodEntry.barcode ? "manual_barcode" : "manual",
    foodId: pendingFoodEntry.barcode ? `barcode:${pendingFoodEntry.barcode}` : "",
    displayName: name,
    category: "手入力",
    amountG: 0,
    amountLabel: "手入力",
    nutrientsSnapshot: roundNutrients({
      energyKcal: kcal,
      proteinG: optionalInputNumber("#pendingManualProtein"),
      fatG: optionalInputNumber("#pendingManualFat"),
      carbsG: optionalInputNumber("#pendingManualCarbs"),
      fiberG: 0,
      saltG: 0,
    }),
  });
}

function registerMasterFood() {
  if (!masterFoodEntryOpen) return;
  const name = document.querySelector("#masterFoodName")?.value.trim();
  const kcal = Number(document.querySelector("#masterFoodKcal")?.value);
  if (!name) {
    setPendingMessage("名称を入力してください。");
    return;
  }
  if (!Number.isFinite(kcal) || kcal <= 0) {
    setPendingMessage("kcalは必須です。1以上の数値を入力してください。");
    return;
  }
  const unitMode = document.querySelector("#masterFoodUnitMode")?.value === "gram" ? "gram" : "serving";
  const rawUnitLabel = document.querySelector("#masterFoodUnitLabel")?.value.trim();
  const unitLabel = unitMode === "gram" ? "100g" : rawUnitLabel || "1食";
  const nutrients = roundNutrients({
    energyKcal: kcal,
    proteinG: optionalInputNumber("#masterFoodProtein"),
    fatG: optionalInputNumber("#masterFoodFat"),
    carbsG: optionalInputNumber("#masterFoodCarbs"),
    fiberG: 0,
    saltG: 0,
  });
  const customFood = normalizeFoodMasterEntry({
    id: `custom:${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    aliases: [],
    category: "ユーザー登録",
    sourceType: "custom",
    unitMode,
    unitLabel,
    servingGrams: optionalInputNumber("#masterFoodServingGrams"),
    ediblePortionNote: unitMode === "gram" ? "100gあたり" : `${unitLabel}あたり`,
    nutrientsPer100g: unitMode === "gram" ? nutrients : emptyNutrients(),
    nutrientsPerUnit: nutrients,
  });
  if (!customFood) {
    setPendingMessage("マスタ登録に失敗しました。入力内容を確認してください。");
    return;
  }
  state.customFoodMaster = [customFood, ...(state.customFoodMaster || [])].slice(0, 200);
  masterFoodEntryOpen = false;
  pendingFoodEntry = null;
  foodSearchQuery = name;
  foodSearchStatus = "マスタに登録しました。検索結果から選択して食事実績に追加できます。";
  saveState("マスタ保存済み");
  renderFood();
}

function renderRecordNutritionSummary() {
  const totals = nutritionTotals(selectedDate);
  setText("#recordNutritionKcal", formatKcal(totals.energyKcal));
  setText("#recordNutritionProtein", formatGram(totals.proteinG));
  setText("#recordNutritionFat", formatGram(totals.fatG));
  setText("#recordNutritionCarbs", formatGram(totals.carbsG));
  renderPfcGuidance(totals, {
    proteinCard: "#recordProteinCard",
    fatCard: "#recordFatCard",
    carbsCard: "#recordCarbsCard",
    note: "#recordPfcNote",
  });
  renderIntakeGuidance("#recordIntakeFloor", "#recordIntakeCeiling", "#recordIntakeNote", "#recordIntakeGauge", "#recordNutritionKcal");
  renderMealLogList("#recordMealLogList", "#recordMealLogEmpty", true);
}

function renderFoodTodaySummary() {
  const totals = nutritionTotals(selectedDate);
  setText("#foodTodayDate", selectedDate.replaceAll("-", "/"));
  setText("#foodTodayKcal", formatKcal(totals.energyKcal));
  setText("#foodTodayProtein", formatGram(totals.proteinG));
  setText("#foodTodayFat", formatGram(totals.fatG));
  setText("#foodTodayCarbs", formatGram(totals.carbsG));
  renderPfcGuidance(totals, {
    proteinCard: "#foodProteinCard",
    fatCard: "#foodFatCard",
    carbsCard: "#foodCarbsCard",
    note: "#foodPfcNote",
  });
  renderIntakeGuidance("#foodIntakeFloor", "#foodIntakeCeiling", "#foodIntakeNote", "#foodIntakeGauge", "#foodTodayKcal");
  renderMealLogList("#foodMealLogList", "#foodMealLogEmpty", false);
}

function pfcGuidance(totals) {
  const intake = Number(totals.energyKcal) || 0;
  const weight = currentBodyWeightKg();
  if (!intake || !weight) return null;
  const protein = Number(totals.proteinG) || 0;
  const fat = Number(totals.fatG) || 0;
  const carbs = Number(totals.carbsG) || 0;
  const proteinMin = Math.round(weight * PFC_TARGETS.proteinGPerKg.min);
  const proteinMax = Math.round(weight * PFC_TARGETS.proteinGPerKg.max);
  const fatRatio = (fat * 9) / intake;
  const carbsRatio = (carbs * 4) / intake;
  const macroEnergy = (protein * 4) + (fat * 9) + (carbs * 4);
  const missingMacroData = macroEnergy < intake * 0.55;
  const warnings = {
    protein: protein < proteinMin || protein > proteinMax,
    fat: fatRatio < PFC_TARGETS.fatEnergyRatio.min || fatRatio > PFC_TARGETS.fatEnergyRatio.max,
    carbs: carbsRatio < PFC_TARGETS.carbsEnergyRatio.min || carbsRatio > PFC_TARGETS.carbsEnergyRatio.max,
  };
  const messages = [];
  if (protein < proteinMin) messages.push(`Pは${proteinMin}-${proteinMax}g目安に対して不足`);
  if (protein > proteinMax) messages.push(`Pは${proteinMin}-${proteinMax}g目安を超過`);
  if (fatRatio < PFC_TARGETS.fatEnergyRatio.min) messages.push("Fは20-30%目安に対して少なめ");
  if (fatRatio > PFC_TARGETS.fatEnergyRatio.max) messages.push("Fは20-30%目安を超過");
  if (carbsRatio < PFC_TARGETS.carbsEnergyRatio.min) messages.push("Cは35-55%目安に対して少なめ");
  if (carbsRatio > PFC_TARGETS.carbsEnergyRatio.max) messages.push("Cは35-55%目安を超過");
  if (missingMacroData) messages.push("kcalに対してPFC入力が不足している可能性あり");
  return {
    proteinMin,
    proteinMax,
    fatRatio,
    carbsRatio,
    missingMacroData,
    warnings,
    messages,
  };
}

function renderPfcGuidance(totals, selectors) {
  const guidance = pfcGuidance(totals);
  const cards = [
    [selectors.proteinCard, guidance?.warnings.protein],
    [selectors.fatCard, guidance?.warnings.fat],
    [selectors.carbsCard, guidance?.warnings.carbs],
  ];
  cards.forEach(([selector, isWarn]) => {
    const card = document.querySelector(selector);
    card?.classList.remove("macro-warn");
    if (guidance && isWarn) card?.classList.add("macro-warn");
  });
  const note = document.querySelector(selectors.note);
  if (!note) return;
  note.classList.remove("danger");
  if (!guidance) {
    note.textContent = "PFCバランスは食事登録後に表示します。";
    return;
  }
  if (guidance.messages.length) {
    note.classList.add("danger");
    note.textContent = `減量中の目安: P ${guidance.proteinMin}-${guidance.proteinMax}g / F 20-30% / C 35-55%。${guidance.messages.join("、")}。`;
    return;
  }
  note.textContent = `PFCは目安範囲内です。P ${guidance.proteinMin}-${guidance.proteinMax}g / F 20-30% / C 35-55% を基準にしています。`;
}

function renderIntakeGuidance(floorSelector, ceilingSelector, noteSelector, gaugeSelector, totalSelector) {
  const guidance = intakeGuidance(selectedDate);
  const totalCard = document.querySelector(totalSelector)?.closest(".intake-total-card");
  totalCard?.classList.remove("warn", "danger");
  if (!guidance) {
    setText(floorSelector, "-- kcal");
    setText(ceilingSelector, "-- kcal");
    setText(noteSelector, "基礎代謝と目標カロリー差から食事の目安を表示します。");
    renderIntakeGauge(gaugeSelector, null);
    return;
  }
  setText(floorSelector, `${guidance.lower} kcal`);
  setText(ceilingSelector, `${guidance.upper} kcal`);
  renderIntakeGauge(gaugeSelector, guidance);
  const note = document.querySelector(noteSelector);
  if (!note) return;
  note.classList.remove("warn", "danger");
  if (!guidance.hasFoodLog) {
    note.textContent = `下限は基礎代謝${guidance.lower}kcalです。上限は基礎代謝に運動反映分${guidance.exerciseCredit}kcalを足し、目標カロリー差${guidance.required}kcalを差し引いた${guidance.upper}kcalを目安にします。`;
    return;
  }
  if (guidance.intake < guidance.lower) {
    note.classList.add("danger");
    totalCard?.classList.add("danger");
    note.textContent = `摂取が基礎代謝 ${guidance.lower}kcal を下回っています。食事量が少なすぎるため、まずは下限を満たしてください。`;
    return;
  }
  if (guidance.intake > guidance.upper) {
    note.classList.add("danger");
    totalCard?.classList.add("danger");
    note.textContent = `摂取が上限目安 ${guidance.upper}kcal を ${guidance.intake - guidance.upper}kcal 上回っています。生活活動分は含めず、運動消費の75%を上限に反映しています。`;
    return;
  }
  note.textContent = `基礎代謝 ${guidance.lower}kcal は下回らず、上限目安 ${guidance.upper}kcal に収まっています。目標カロリー差は1日約${guidance.required}kcalです。`;
}

function renderIntakeGauge(selector, guidance) {
  const gauge = document.querySelector(selector);
  if (!gauge) return;
  gauge.classList.remove("warn", "danger", "empty", "overlap");
  if (!guidance) {
    gauge.classList.add("empty");
    gauge.style.setProperty("--intake-pct", "0%");
    gauge.style.setProperty("--lower-pct", "0%");
    gauge.style.setProperty("--upper-pct", "0%");
    return;
  }
  const max = Math.max(guidance.upper * 1.18, guidance.lower * 1.18, guidance.intake, 1);
  const intakePct = Math.min(100, Math.round((guidance.intake / max) * 1000) / 10);
  const lowerPct = Math.min(100, Math.round((guidance.lower / max) * 1000) / 10);
  const upperPct = Math.min(100, Math.round((guidance.upper / max) * 1000) / 10);
  gauge.style.setProperty("--intake-pct", `${intakePct}%`);
  gauge.style.setProperty("--lower-pct", `${lowerPct}%`);
  gauge.style.setProperty("--upper-pct", `${upperPct}%`);
  gauge.classList.toggle("overlap", Math.abs(upperPct - lowerPct) < 1);
  if (guidance.hasFoodLog && (guidance.intake < guidance.lower || guidance.intake > guidance.upper)) {
    gauge.classList.add("danger");
  }
}

function renderMealLogList(listSelector, emptySelector, compact) {
  const list = document.querySelector(listSelector);
  const empty = document.querySelector(emptySelector);
  if (!list || !empty) return;
  const logs = mealLogsForDate(selectedDate);
  empty.classList.toggle("is-hidden", Boolean(logs.length));
  list.innerHTML = logs.map((entry) => {
    const nutrients = entry.nutrientsSnapshot || {};
    const amountLabel = entry.amountLabel || (entry.amountG ? `${round1(entry.amountG).toFixed(0)}g` : "手入力");
    return `
      <article class="meal-log-item${compact ? " compact" : ""}">
        <div>
          <strong>${escapeHtml(entry.displayName)}</strong>
          <span>${escapeHtml(amountLabel)} / ${formatKcal(nutrients.energyKcal)} / P（たんぱく質）${formatGram(nutrients.proteinG)} / F（脂質）${formatGram(nutrients.fatG)} / C（炭水化物）${formatGram(nutrients.carbsG)}</span>
        </div>
        <button class="ghost-button meal-delete-button" type="button" data-delete-meal-log="${escapeHtml(entry.id)}">削除</button>
      </article>
    `;
  }).join("");
}

function renderMealHistory() {
  const list = document.querySelector("#foodMealHistoryList");
  const empty = document.querySelector("#foodMealHistoryEmpty");
  if (!list || !empty) return;
  const logs = recentMealHistory(10);
  empty.classList.toggle("is-hidden", Boolean(logs.length));
  list.innerHTML = logs.map((entry) => {
    const nutrients = entry.nutrientsSnapshot || {};
    const amountLabel = entry.amountLabel || (entry.amountG ? `${round1(entry.amountG).toFixed(0)}g` : "手入力");
    return `
      <article class="meal-history-item">
        <div>
          <strong>${escapeHtml(entry.displayName)}</strong>
          <span>${escapeHtml(amountLabel)} / ${formatKcal(nutrients.energyKcal)} / ${escapeHtml(entry.date.replaceAll("-", "/"))}</span>
        </div>
        <button class="ghost-button compact-button" type="button" data-repeat-meal-log="${escapeHtml(entry.id)}">食べた！🍽️</button>
      </article>
    `;
  }).join("");
}

function currentRoundTimer() {
  state.roundTimer = normalizeRoundTimer(state.roundTimer);
  return state.roundTimer;
}

function buildRoundTimerStages(settings) {
  const stages = [];
  if (settings.prepSec > 0) {
    stages.push({ phase: "prep", round: 1, durationSec: settings.prepSec });
  }
  for (let round = 1; round <= settings.rounds; round += 1) {
    stages.push({ phase: "work", round, durationSec: settings.workSec });
    if (round < settings.rounds && settings.restSec > 0) {
      stages.push({ phase: "rest", round, durationSec: settings.restSec });
    }
  }
  return stages;
}

function resetRoundTimer(shouldRender = true) {
  stopRoundTimerTick();
  const stages = buildRoundTimerStages(currentRoundTimer());
  roundTimerRuntime = {
    status: "idle",
    stageIndex: 0,
    stages,
    remainingMs: stages[0]?.durationSec * 1000 || 0,
    phaseEndsAt: null,
    tickId: null,
    lastCountdownSecond: null,
  };
  if (shouldRender) renderRoundTimer();
}

function ensureRoundTimerRuntime() {
  if (roundTimerRuntime.stages.length) return;
  resetRoundTimer(false);
}

function currentRoundTimerStage() {
  ensureRoundTimerRuntime();
  return roundTimerRuntime.stages[roundTimerRuntime.stageIndex] || {
    phase: "complete",
    round: currentRoundTimer().rounds,
    durationSec: 0,
  };
}

function timerPhaseLabel(phase) {
  return {
    prep: "準備",
    work: "WORK",
    rest: "REST",
    complete: "完了",
  }[phase] || "準備";
}

function timerStatusLabel(status) {
  return {
    idle: "待機中",
    running: "進行中",
    paused: "一時停止",
    complete: "完了",
  }[status] || "待機中";
}

function formatTimerClock(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatTimerDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes && rest) return `${minutes}分${rest}秒`;
  if (minutes) return `${minutes}分`;
  return `${rest}秒`;
}

function roundTimerTotalSeconds(settings) {
  return settings.prepSec + (settings.workSec * settings.rounds) + (settings.restSec * Math.max(0, settings.rounds - 1));
}

function renderRoundTimer() {
  const display = document.querySelector("#roundTimerDisplay");
  if (!display) return;

  const settings = currentRoundTimer();
  ensureRoundTimerRuntime();
  const stage = currentRoundTimerStage();
  const phase = roundTimerRuntime.status === "complete" ? "complete" : stage.phase;
  const remainingSeconds = roundTimerRuntime.status === "complete"
    ? 0
    : (roundTimerRuntime.remainingMs ?? stage.durationSec * 1000) / 1000;

  display.className = `timer-display timer-phase-${phase}`;
  setText("#timerPhase", timerPhaseLabel(phase));

  // 次フェーズの予告（種類＋長さ）を事前表示
  const nextStage = roundTimerRuntime.status === "complete"
    ? null
    : (roundTimerRuntime.stages[roundTimerRuntime.stageIndex + 1] || null);
  const nextText = roundTimerRuntime.status === "complete"
    ? "—"
    : (nextStage ? `${timerPhaseLabel(nextStage.phase)} ${formatTimerDuration(nextStage.durationSec)}` : "完了");
  setText("#timerNextValue", nextText);

  // フェーズが変わったら、スロットのように1段落ちて切り替える
  if (phase !== timerLastPhase) {
    timerLastPhase = phase;
    const phaseEl = document.querySelector("#timerPhase");
    if (phaseEl) {
      phaseEl.classList.remove("slot-in");
      void phaseEl.offsetWidth; // アニメーションを再生し直すためのreflow
      phaseEl.classList.add("slot-in");
    }
  }

  setText("#timerTime", formatTimerClock(remainingSeconds));
  setText("#timerRound", `ROUND ${stage.round || settings.rounds} / ${settings.rounds}`);
  setText("#timerStatus", timerStatusLabel(roundTimerRuntime.status));
  setText("#timerSummary", `準備${formatTimerDuration(settings.prepSec)} / ワーク${formatTimerDuration(settings.workSec)} / 休憩${formatTimerDuration(settings.restSec)} / ${settings.rounds}R / 合計${formatTimerDuration(roundTimerTotalSeconds(settings))}`);

  const startPause = document.querySelector("#timerStartPause");
  if (startPause) {
    startPause.textContent = roundTimerRuntime.status === "running" ? "一時停止" : roundTimerRuntime.status === "complete" ? "もう一度" : "開始";
  }

  const preset = document.querySelector("#timerPreset");
  if (preset) {
    const optionsHtml = roundTimerPresetOptionsHtml(settings);
    if (preset.innerHTML !== optionsHtml) preset.innerHTML = optionsHtml;
  }
  updateInputValue("#timerPreset", settings.presetId);
  updateInputValue("#timerPrepSec", settings.prepSec);
  updateInputValue("#timerWorkSec", round2(settings.workSec / 60));
  updateInputValue("#timerRestSec", settings.restSec);
  updateInputValue("#timerRounds", settings.rounds);
  updateTimerPresetNameFromSelection();
  syncWakeLock();
}

function updateInputValue(selector, value) {
  const input = document.querySelector(selector);
  if (!input || document.activeElement === input) return;
  input.value = String(value);
}

function matchRoundTimerPreset(settings) {
  const preset = ROUND_TIMER_PRESETS.find((item) => (
    item.id !== CUSTOM_TIMER_PRESET_ID
    && item.prepSec === settings.prepSec
    && item.workSec === settings.workSec
    && item.restSec === settings.restSec
    && item.rounds === settings.rounds
  ));
  if (preset) return preset.id;
  const savedPreset = currentRoundTimer().savedPresets.find((item) => (
    item.prepSec === settings.prepSec
    && item.workSec === settings.workSec
    && item.restSec === settings.restSec
    && item.rounds === settings.rounds
  ));
  return savedPreset ? `${SAVED_TIMER_PRESET_PREFIX}${savedPreset.id}` : CUSTOM_TIMER_PRESET_ID;
}

function saveRoundTimerSettings(nextSettings, options = {}) {
  const shouldReset = options.reset !== false;
  state.roundTimer = normalizeRoundTimer(nextSettings);
  saveState("タイマー設定保存済み");
  if (shouldReset) resetRoundTimer(false);
  renderRoundTimer();
}

function roundTimerPresetOptionsHtml(settings = currentRoundTimer()) {
  const builtInOptions = ROUND_TIMER_PRESETS
    .map((preset) => `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`)
    .join("");
  const savedOptions = settings.savedPresets
    .map((preset) => `<option value="${SAVED_TIMER_PRESET_PREFIX}${preset.id}">${escapeHtml(preset.name)}</option>`)
    .join("");
  return savedOptions
    ? `<optgroup label="基本">${builtInOptions}</optgroup><optgroup label="保存済み">${savedOptions}</optgroup>`
    : builtInOptions;
}

function roundTimerPresetById(value) {
  if (value?.startsWith(SAVED_TIMER_PRESET_PREFIX)) {
    const savedId = value.slice(SAVED_TIMER_PRESET_PREFIX.length);
    return currentRoundTimer().savedPresets.find((preset) => preset.id === savedId) || null;
  }
  return ROUND_TIMER_PRESETS.find((preset) => preset.id === value) || null;
}

function applySelectedRoundTimerPreset() {
  const selected = document.querySelector("#timerPreset")?.value;
  const preset = roundTimerPresetById(selected);
  if (!preset) return;
  saveRoundTimerSettings({
    ...currentRoundTimer(),
    presetId: selected,
    prepSec: preset.prepSec,
    workSec: preset.workSec,
    restSec: preset.restSec,
    rounds: preset.rounds,
  });
  showTimerFeedback(`${preset.name} を反映しました。`);
}

function updateTimerPresetNameFromSelection() {
  const nameInput = document.querySelector("#timerPresetName");
  const presetSelect = document.querySelector("#timerPreset");
  if (!nameInput || !presetSelect || document.activeElement === nameInput) return;
  const preset = roundTimerPresetById(presetSelect.value);
  nameInput.value = presetSelect.value?.startsWith(SAVED_TIMER_PRESET_PREFIX) && preset ? preset.name : "";
}

function saveCurrentRoundTimerPreset() {
  const settings = currentRoundTimer();
  const nameInput = document.querySelector("#timerPresetName");
  const selected = document.querySelector("#timerPreset")?.value || "";
  const name = nameInput?.value.trim() || `${formatTimerDuration(settings.workSec)} × ${settings.rounds}R`;
  const existingId = selected.startsWith(SAVED_TIMER_PRESET_PREFIX)
    ? selected.slice(SAVED_TIMER_PRESET_PREFIX.length)
    : null;
  const presetId = existingId || `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  const nextPreset = {
    id: presetId,
    name,
    prepSec: settings.prepSec,
    workSec: settings.workSec,
    restSec: settings.restSec,
    rounds: settings.rounds,
  };
  const savedPresets = [
    nextPreset,
    ...settings.savedPresets.filter((preset) => preset.id !== presetId),
  ].slice(0, 20);
  saveRoundTimerSettings({
    ...settings,
    presetId: `${SAVED_TIMER_PRESET_PREFIX}${presetId}`,
    savedPresets,
  }, { reset: false });
  showTimerFeedback(`${name} を保存しました。`);
}

function deleteSelectedRoundTimerPreset() {
  const selected = document.querySelector("#timerPreset")?.value || "";
  if (!selected.startsWith(SAVED_TIMER_PRESET_PREFIX)) {
    showTimerFeedback("保存済み設定だけ削除できます。");
    return;
  }
  const settings = currentRoundTimer();
  const presetId = selected.slice(SAVED_TIMER_PRESET_PREFIX.length);
  const target = settings.savedPresets.find((preset) => preset.id === presetId);
  const savedPresets = settings.savedPresets.filter((preset) => preset.id !== presetId);
  saveRoundTimerSettings({
    ...settings,
    presetId: CUSTOM_TIMER_PRESET_ID,
    savedPresets,
  }, { reset: false });
  showTimerFeedback(`${target?.name || "保存済み設定"} を削除しました。`);
}

function showTimerFeedback(message) {
  const feedback = document.querySelector("#timerFeedback");
  if (!feedback) return;
  feedback.textContent = message;
  if (timerFeedbackTimer) clearTimeout(timerFeedbackTimer);
  timerFeedbackTimer = setTimeout(() => {
    feedback.textContent = "";
  }, 2200);
}

function setTimerSettingsOpen(open) {
  const modal = document.querySelector("#timerSettingsModal");
  if (!modal) return;
  modal.classList.toggle("active", open);
  modal.setAttribute("aria-hidden", String(!open));
  if (open) {
    renderRoundTimer();
    document.querySelector("#timerPreset")?.focus();
  } else {
    document.querySelector("#openTimerSettings")?.focus();
  }
}

// 画面スリープ防止：タイマー実行中だけ Screen Wake Lock を取得する。
function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLockSentinel || wakeLockPending) return;
  wakeLockPending = true;
  navigator.wakeLock.request("screen")
    .then((lock) => {
      wakeLockSentinel = lock;
      // バックグラウンド化等でOSが解放したら参照をクリア（復帰時に再取得する）
      lock.addEventListener("release", () => { wakeLockSentinel = null; });
    })
    .catch(() => {})
    .finally(() => { wakeLockPending = false; });
}

function releaseWakeLock() {
  const lock = wakeLockSentinel;
  wakeLockSentinel = null;
  if (lock) lock.release().catch(() => {});
}

// タイマーの状態に合わせて Wake Lock を取得/解放する。
function syncWakeLock() {
  if (roundTimerRuntime.status === "running") requestWakeLock();
  else releaseWakeLock();
}

function startRoundTimer() {
  ensureRoundTimerRuntime();
  if (roundTimerRuntime.status === "complete") resetRoundTimer(false);
  const stage = currentRoundTimerStage();
  roundTimerRuntime.status = "running";
  roundTimerRuntime.remainingMs = roundTimerRuntime.remainingMs ?? stage.durationSec * 1000;
  roundTimerRuntime.phaseEndsAt = Date.now() + roundTimerRuntime.remainingMs;
  roundTimerRuntime.lastCountdownSecond = null;
  roundTimerRuntime.tenSecondPlayed = false;
  playTimerTone("gong");
  startRoundTimerTick();
  renderRoundTimer();
}

function pauseRoundTimer() {
  if (roundTimerRuntime.status !== "running") return;
  playClick();
  roundTimerRuntime.remainingMs = Math.max(0, roundTimerRuntime.phaseEndsAt - Date.now());
  roundTimerRuntime.status = "paused";
  roundTimerRuntime.phaseEndsAt = null;
  stopRoundTimerTick();
  renderRoundTimer();
}

function toggleRoundTimer() {
  if (roundTimerRuntime.status === "running") {
    pauseRoundTimer();
  } else {
    startRoundTimer();
  }
}

function startRoundTimerTick() {
  stopRoundTimerTick();
  roundTimerRuntime.tickId = setInterval(updateRoundTimerTick, 200);
  updateRoundTimerTick();
}

function stopRoundTimerTick() {
  if (!roundTimerRuntime.tickId) return;
  clearInterval(roundTimerRuntime.tickId);
  roundTimerRuntime.tickId = null;
}

function updateRoundTimerTick() {
  if (roundTimerRuntime.status !== "running") return;

  roundTimerRuntime.remainingMs = Math.max(0, roundTimerRuntime.phaseEndsAt - Date.now());
  const countdownSecond = Math.ceil(roundTimerRuntime.remainingMs / 1000);
  const currentPhase = roundTimerRuntime.stages[roundTimerRuntime.stageIndex]?.phase;
  // 拍子木はワークの最後10秒だけ（準備・休憩では鳴らさない）
  if (countdownSecond === 10 && !roundTimerRuntime.tenSecondPlayed && currentPhase === "work") {
    roundTimerRuntime.tenSecondPlayed = true;
    playTimerTone("clapper");
  }
  if (countdownSecond > 0 && countdownSecond <= 3 && countdownSecond !== roundTimerRuntime.lastCountdownSecond) {
    roundTimerRuntime.lastCountdownSecond = countdownSecond;
    playTimerTone("countdown");
  }

  if (roundTimerRuntime.remainingMs <= 0) {
    advanceRoundTimerStage();
  }
  renderRoundTimer();
}

function advanceRoundTimerStage() {
  roundTimerRuntime.stageIndex += 1;
  if (roundTimerRuntime.stageIndex >= roundTimerRuntime.stages.length) {
    completeRoundTimer();
    return;
  }
  const nextStage = currentRoundTimerStage();
  roundTimerRuntime.remainingMs = nextStage.durationSec * 1000;
  roundTimerRuntime.phaseEndsAt = Date.now() + roundTimerRuntime.remainingMs;
  roundTimerRuntime.lastCountdownSecond = null;
  roundTimerRuntime.tenSecondPlayed = false;
  playTimerTone(nextStage.phase);
}

function completeRoundTimer() {
  stopRoundTimerTick();
  roundTimerRuntime.status = "complete";
  roundTimerRuntime.remainingMs = 0;
  roundTimerRuntime.phaseEndsAt = null;
  roundTimerRuntime.lastCountdownSecond = null;
  playTimerTone("complete");
}

// 一時停止・リセット時のシンプルな機械音（短いクリック）。
function playClick() {
  try {
    timerAudioContext = timerAudioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (timerAudioContext.state === "suspended") timerAudioContext.resume();
    const ctx = timerAudioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.05);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // best-effort
  }
}

function playTimerTone(type) {
  try {
    timerAudioContext = timerAudioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (timerAudioContext.state === "suspended") timerAudioContext.resume();
    // 効果音は3種類のみ：拍子木(残り10秒) / ゴング(フェーズ切替) / カウントダウン(残り3秒)
    if (type === "clapper") { playClapper(); return; }
    if (type === "countdown") { playCountdownBeep(); return; }
    playGong();
  } catch {
    // Audio is best-effort only.
  }
}

function playCountdownBeep() {
  const ctx = timerAudioContext;
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = 740;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.16);
}

// 拍子木（カチン）：硬い木がぶつかる、鋭く乾いた打撃音。
function playClapper() {
  const ctx = timerAudioContext;
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // 鋭い打撃（高域ノイズのクリック）
  const dur = 0.05;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 1500;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.6, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  noise.connect(highpass);
  highpass.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t);
  noise.stop(t + dur);

  // 木の響き（短い高音の余韻）
  [1900, 2600].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(i === 0 ? 0.3 : 0.18, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.08);
  });
}

// ボクシングのゴング：実録音(gong.mp3)を1回そのまま再生（単発ゴング）。
// 未ロード/デコード失敗時はFM合成(playGongSynth)にフォールバック。
function playGong() {
  const ctx = timerAudioContext;
  if (gongBuffer && ctx) {
    const src = ctx.createBufferSource();
    src.buffer = gongBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    return;
  }
  playGongSynth();
}

// ゴング音源を事前読み込み（初回のフェーズ切替から実録音で鳴らすため）。
function preloadGong() {
  try {
    timerAudioContext = timerAudioContext || new (window.AudioContext || window.webkitAudioContext)();
    fetch("./gong.mp3")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("gong fetch failed"))))
      .then((ab) => timerAudioContext.decodeAudioData(ab))
      .then((buf) => { gongBuffer = buf; })
      .catch(() => { gongBuffer = null; });
  } catch {
    // best-effort（合成フォールバックに任せる）
  }
}

// FM合成のゴング（実録音が使えない場合のフォールバック）。
function playGongSynth() {
  const ctx = timerAudioContext;
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // ハンマー打撃の金属的アタック（高域ノイズ）
  const noiseDur = 0.06;
  const nbuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nd.length; i += 1) {
    nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 2);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = nbuf;
  const nbp = ctx.createBiquadFilter();
  nbp.type = "highpass";
  nbp.frequency.value = 2500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.45, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  noise.connect(nbp);
  nbp.connect(ng);
  ng.connect(master);
  noise.start(t);
  noise.stop(t + noiseDur);

  // FMベル声部：carrier + 非整数比のmodulator。変調指数が減衰し音色が明→暗へ。
  const fmVoice = (carrierHz, ratio, peakIndex, level, dur) => {
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = carrierHz;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = carrierHz * ratio;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(peakIndex, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + dur * 0.5);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(level, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    carrier.connect(amp);
    amp.connect(master);
    mod.start(t);
    carrier.start(t);
    mod.stop(t + dur + 0.05);
    carrier.stop(t + dur + 0.05);
  };

  // 明るい金属ベル。2声をわずかに離調して約4Hzのうなり、上音用にもう1声。
  fmVoice(784, 1.41, 784 * 3, 0.5, 2.6);
  fmVoice(788, 1.41, 788 * 3, 0.32, 2.6);
  fmVoice(784, 2.76, 784 * 2, 0.16, 1.4);
}

function goalSafety(heightCm, goalKg, goalDateIso) {
  const heightM = (Number(heightCm) || 0) / 100;
  if (heightM <= 0 || !Number.isFinite(goalKg) || goalKg <= 0) {
    return { level: "ok", text: "" };
  }
  const goalBmi = goalKg / (heightM * heightM);
  const healthyLow = round1(18.5 * heightM * heightM);
  const healthyHigh = round1(25 * heightM * heightM);
  const messages = [];
  let level = "ok";
  if (goalBmi < 18.5) {
    level = "danger";
    messages.push(`目標 ${round1(goalKg)}kg は BMI ${goalBmi.toFixed(1)} で低体重域です。健康のため ${healthyLow}kg 以上（BMI18.5以上）を推奨します。`);
  } else if (goalBmi >= 25) {
    level = "caution";
    messages.push(`目標 ${round1(goalKg)}kg は BMI ${goalBmi.toFixed(1)} でまだ肥満域です。${healthyHigh}kg 以下（BMI25未満）を目指すとより健康的です。`);
  }
  const baseWeight = currentBodyWeightKg();
  const referenceDate = latestTrend()?.date || latestEntry()?.date || todayIso();
  const daysLeft = goalDateIso ? daysBetween(referenceDate, goalDateIso) : 0;
  if (daysLeft > 0 && baseWeight > goalKg) {
    const pace = ((baseWeight - goalKg) / daysLeft) * 7;
    const dailyDeficit = Math.round(((baseWeight - goalKg) * 7200) / daysLeft);
    if (pace > 1.0) {
      level = "danger";
      messages.push(`この期限だと週 ${pace.toFixed(2)}kg の減量と1日あたり約${dailyDeficit}kcalのカロリー差が必要です。危険ラインの週1.0kgを超えているため、目標体重か期限の見直しを推奨します。`);
    } else if (pace > 0.7) {
      if (level !== "danger") level = "caution";
      messages.push(`この期限だと週 ${pace.toFixed(2)}kg の減量と1日あたり約${dailyDeficit}kcalのカロリー差が必要です。やや高いペースなので、数週間ごとに進捗を確認しましょう。`);
      }
  }
  if (!messages.length) {
    messages.push(`目標 ${round1(goalKg)}kg は BMI ${goalBmi.toFixed(1)} で健康域です（健康域: ${healthyLow}〜${healthyHigh}kg）。`);
  }
  return { level, text: messages.join(" ") };
}

function applyGoalNotice(heightCm, goalKg, goalDateIso) {
  const el = document.querySelector("#goalNotice");
  if (!el) return;
  const { level, text } = goalSafety(heightCm, goalKg, goalDateIso);
  el.textContent = text;
  el.classList.remove("ok", "caution", "danger");
  el.classList.add(level);
  el.classList.toggle("is-hidden", !text);
}

function renderSettings() {
  document.querySelector("#heightCm").value = state.settings.heightCm;
  document.querySelector("#age").value = state.settings.age;
  document.querySelector("#sex").value = state.settings.sex;
  document.querySelector("#startWeight").value = state.settings.startWeightKg;
  document.querySelector("#goalWeight").value = state.settings.goalWeightKg;
  document.querySelector("#goalDate").value = state.settings.goalDate;
  setText("#bmi25Weight", `${round1(weightForBmi(25)).toFixed(1)} kg`);
  setText("#bmi22Weight", `${round1(weightForBmi(22)).toFixed(1)} kg`);
  const bmr = basalMetabolicRate();
  const dailyDeficit = requiredDailyDeficitKcal();
  setText("#bmrValue", bmr ? `${bmr} kcal` : "-- kcal");
  setText("#requiredDeficitValue", dailyDeficit ? `${dailyDeficit} kcal` : "-- kcal");
  applyGoalNotice(state.settings.heightCm, state.settings.goalWeightKg, state.settings.goalDate);
}

function drawChart() {
  const canvas = document.querySelector("#weightChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 720;
  const cssHeight = Math.round(cssWidth * 0.58);
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const entries = sortedWeights();
  const trends = trendSeries();
  const pad = { top: 22, right: 16, bottom: 34, left: 42 };
  const w = cssWidth - pad.left - pad.right;
  const h = cssHeight - pad.top - pad.bottom;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (entries.length < 2) {
    ctx.fillStyle = "#6c685f";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("2日以上記録するとグラフを表示します", cssWidth / 2, cssHeight / 2);
    return;
  }

  const values = [...entries.map((e) => e.weightKg), ...trends.map((e) => e.trendKg), state.settings.goalWeightKg];
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const firstDate = entries[0].date;
  const lastDate = entries.at(-1).date;
  const span = Math.max(1, daysBetween(firstDate, lastDate));
  const x = (date) => pad.left + (daysBetween(firstDate, date) / span) * w;
  const y = (value) => pad.top + ((max - value) / (max - min)) * h;

  ctx.strokeStyle = "#d8e2dd";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6c685f";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  for (let tick = min; tick <= max; tick += 1) {
    const yy = y(tick);
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(cssWidth - pad.right, yy);
    ctx.stroke();
    ctx.fillText(`${tick}`, pad.left - 8, yy + 4);
  }

  ctx.strokeStyle = "#c4892f";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(pad.left, y(state.settings.goalWeightKg));
  ctx.lineTo(cssWidth - pad.right, y(state.settings.goalWeightKg));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(47, 111, 159, 0.38)";
  entries.forEach((entry) => {
    ctx.beginPath();
    ctx.arc(x(entry.date), y(entry.weightKg), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = "#227a5b";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  trends.forEach((entry, index) => {
    const xx = x(entry.date);
    const yy = y(entry.trendKg);
    if (index === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  });
  ctx.stroke();

  ctx.fillStyle = "#6c685f";
  ctx.textAlign = "left";
  ctx.fillText(firstDate.slice(5), pad.left, cssHeight - 12);
  ctx.textAlign = "right";
  ctx.fillText(lastDate.slice(5), cssWidth - pad.right, cssHeight - 12);
}

function getSelectedCheck() {
  const date = selectedDate;
  let check = state.dailyChecks.find((entry) => entry.date === date);
  if (!check) {
    check = {
      date,
      exerciseDone: false,
      protein100: false,
      vegetables350: false,
      carbPortion: false,
      noFried: false,
      noJuiceAlcohol: false,
      noSweets: false,
      noLateSnack: false,
      water1500: false,
      note: "",
    };
    state.dailyChecks.push(check);
  }
  return check;
}

const CHECK_FIELDS = [
  "exerciseDone",
  "protein100", "vegetables350", "carbPortion", "noFried",
  "noJuiceAlcohol", "noSweets", "noLateSnack", "water1500",
];

function checkHasData(entry) {
  if (!entry) return false;
  if (entry.note) return true;
  return CHECK_FIELDS.some((field) => entry[field]);
}

function hasSelectedCheckData() {
  return checkHasData(state.dailyChecks.find((entry) => entry.date === selectedDate));
}

function saveDailyChecks() {
  const check = getSelectedCheck();
  check.exerciseDone = document.querySelector("[data-exercise='true']")?.classList.contains("active") || false;
  document.querySelectorAll("[data-check]").forEach((input) => {
    check[input.dataset.check] = input.checked;
  });
  check.note = document.querySelector("#dailyNote")?.value.trim() || check.note || "";
  saveState();
  render();
}

function entriesInMonth(month) {
  return state.weightEntries.filter((entry) => entry.date.startsWith(month)).length;
}

function streakDays() {
  const recorded = new Set(state.weightEntries.map((entry) => entry.date));
  let cursor = new Date(`${todayIso()}T00:00:00`);
  // 当日はまだ進行中。今日の体重が未記録でも前日までの連続記録は途切れていないので、
  // 今日を飛ばして前日から数える（前日記録→当日0になる不具合の対策）。
  if (!recorded.has(toIsoDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let count = 0;
  while (recorded.has(toIsoDate(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function dailyScore(date) {
  const check = state.dailyChecks.find((entry) => entry.date === date);
  let score = scoreFromCheck(check);
  score += exerciseScore(date, check);
  score = Math.max(0, score);
  return Math.min(100, score);
}

function scoreFromCheck(check) {
  return 0;
}

function currentUiScore() {
  const guidance = intakeGuidance(selectedDate);
  if (!guidance || !guidance.hasFoodLog || guidance.required <= 0) return 0;
  const ratio = guidance.actualDeficit / guidance.required;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

function exerciseScore(date, check) {
  if (!check?.exerciseDone) return 0;
  const plan = getWorkoutPlanForDate(date);
  if (!plan?.items?.length) return 9;
  const kcal = workoutPlanKcal(plan);
  if (kcal <= 0) return 9;
  return Math.max(6, Math.min(18, Math.round(Math.sqrt(kcal) * 0.48)));
}

function decisionClass(status) {
  return `decision-${status}`;
}

function dailyDecision(date) {
  const guidance = intakeGuidance(date);
  if (!guidance) {
    return { status: "fail", label: "不合格", short: "否", reason: "目標体重か期限が未設定です。", guidance: null };
  }
  if (!guidance.hasFoodLog) {
    return { status: "fail", label: "不合格", short: "否", reason: "食事実績が未登録です。", guidance };
  }
  if (guidance.intake < guidance.lower) {
    return { status: "fail", label: "不合格", short: "否", reason: `基礎代謝 ${guidance.lower}kcal を下回っています。`, guidance };
  }
  if (guidance.intake <= guidance.upper) {
    return { status: "pass", label: "合格", short: "合", reason: `目標カロリー差 ${guidance.required}kcal を達成しています。`, guidance };
  }
  return { status: "fail", label: "不合格", short: "否", reason: `上限目安を ${guidance.intake - guidance.upper}kcal 上回っています。`, guidance };
}

function weeklyDecisionSummary(results, recordedDays) {
  if (!recordedDays) {
    return { status: "fail", label: "不合格", short: "否", reason: "まだ評価対象の記録がありません。" };
  }
  const recordedFoodDays = results.filter((entry) => entry.guidance?.hasFoodLog).length;
  const totalRequired = results.reduce((sum, entry) => sum + (entry.guidance?.required || 0), 0);
  const totalActual = results.reduce((sum, entry) => sum + (entry.guidance?.hasFoodLog ? (entry.guidance?.actualDeficit || 0) : 0), 0);
  if (recordedFoodDays < 4) {
    return { status: "fail", label: "不合格", short: "否", reason: "食事記録が4日未満のため、週間判定は不合格です。" };
  }
  if (totalActual >= totalRequired) {
    return { status: "pass", label: "合格", short: "合", reason: "7日合計で目標カロリー差を達成しています。" };
  }
  return { status: "fail", label: "不合格", short: "否", reason: `7日合計で目標カロリー差に ${totalRequired - totalActual}kcal 届いていません。` };
}

function setDecisionStamp(element, decision) {
  if (!element || !decision) return;
  element.textContent = decision.label;
  element.className = `decision-stamp ${decisionClass(decision.status)}${element.id === "dailyRank" ? " small" : ""}`;
}

function calendarScoreEntries() {
  const dates = new Set([
    ...state.weightEntries.map((entry) => entry.date),
    ...state.dailyChecks.filter(checkHasData).map((entry) => entry.date),
    ...(state.mealLogs || []).map((entry) => entry.date),
  ]);
  return [...dates].map((date) => ({ date, ...dailyDecision(date) }));
}

function selectedPlanLevel(type) {
  return document.querySelector(`[data-plan-level^="${type}:"].active`)?.dataset.planLevel.split(":")[1] || "";
}

function setPlanLevel(type, level) {
  document.querySelectorAll(`[data-plan-level^="${type}:"]`).forEach((button) => {
    button.classList.toggle("active", button.dataset.planLevel === `${type}:${level}`);
  });
}

function levelLabel(level) {
  return { soft: "ソフト", normal: "ノーマル", hard: "ハード" }[level] || "ノーマル";
}

// ===== 筋トレ: 動作パターン別データ（pattern / muscle / equipment / region でタグ付け） =====
// url 省略 = 腕立て・スクワット等のあまりに自明な種目（リンク不要）。それ以外は日本語の解説ページを付与。
const STRENGTH_EXERCISES = [
  // --- コア（自重・上下どちらの日でも使用） ---
  { id: "plank", name: "プランク", rep: "30〜45秒", pattern: "core", muscle: "abs", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "side-plank", name: "サイドプランク", rep: "20〜30秒/側", url: "https://melos.media/training/64419/2/", pattern: "core", muscle: "obliques", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "crunch", name: "クランチ", rep: "12〜15回", pattern: "core", muscle: "abs", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "leg-raise", name: "レッグレイズ", rep: "12〜15回", url: "https://www.shopjapan.co.jp/diet_labo/training/article_023/", pattern: "core", muscle: "abs", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "dead-bug", name: "デッドバグ", rep: "10回/側", url: "https://fily.jp/articles/2000", pattern: "core", muscle: "abs", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "mountain-climber", name: "マウンテンクライマー", rep: "30秒", url: "https://ufit.co.jp/blogs/training/mountain-climber", pattern: "core", muscle: "abs", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "reverse-crunch", name: "リバースクランチ", rep: "12〜15回", url: "https://melos.media/training/151743/", pattern: "core", muscle: "abs", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "bicycle-crunch", name: "バイシクルクランチ", rep: "左右20回", url: "https://melos.media/training/151743/", pattern: "core", muscle: "obliques", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "hollow-hold", name: "ホローホールド", rep: "30秒", url: "https://melos.media/training/151743/", pattern: "core", muscle: "abs", equipment: "bodyweight", region: "core", kind: "core" },
  { id: "russian-twist", name: "ロシアンツイスト", rep: "左右20回", url: "https://ufit.co.jp/blogs/training/russian-twist", pattern: "core", muscle: "obliques", equipment: "bodyweight", region: "core", kind: "core" },
  // --- 下半身: スクワット系（膝） ---
  { id: "squat", name: "スクワット", rep: "15回", pattern: "squat", muscle: "quad", equipment: "bodyweight", region: "lower", kind: "main" },
  { id: "goblet-squat", name: "ゴブレットスクワット", rep: "10〜12回", url: "https://www.kintore-hack.com/how-to-goblet-squat/", pattern: "squat", muscle: "quad", equipment: "dumbbell", region: "lower", kind: "main" },
  // --- 下半身: ヒンジ系（股関節） ---
  { id: "hip-lift", name: "ヒップリフト", rep: "15回", url: "https://melos.media/training/60969/", pattern: "hinge", muscle: "glute", equipment: "bodyweight", region: "lower", kind: "main" },
  { id: "db-rdl", name: "ルーマニアンデッドリフト", rep: "10〜12回", url: "https://fibe.jp/faq/romanian-deadlift-dumbbell/", pattern: "hinge", muscle: "hamstring", equipment: "dumbbell", region: "lower", kind: "main" },
  { id: "db-deadlift", name: "ダンベルデッドリフト", rep: "10回", url: "https://power-hacks.com/dumbbell-deadlift/", pattern: "hinge", muscle: "hamstring", equipment: "dumbbell", region: "lower", kind: "main" },
  { id: "db-hip-lift", name: "ダンベルヒップリフト", rep: "12〜15回", url: "https://melos.media/training/60969/", pattern: "hinge", muscle: "glute", equipment: "dumbbell", region: "lower", kind: "main" },
  // --- 下半身: 片脚 ---
  { id: "back-lunge", name: "バックランジ", rep: "10回/脚", url: "https://melos.media/training/272277/2/", pattern: "unilateral", muscle: "quad", equipment: "bodyweight", region: "lower", kind: "main" },
  { id: "split-squat", name: "スプリットスクワット", rep: "10回/脚", url: "https://qitano.com/split-squat", pattern: "unilateral", muscle: "glute", equipment: "bodyweight", region: "lower", kind: "main" },
  { id: "db-lunge", name: "ダンベルランジ", rep: "10回/脚", url: "https://qitano.com/dumbbell-lunge", pattern: "unilateral", muscle: "quad", equipment: "dumbbell", region: "lower", kind: "main" },
  // --- 下半身: カーフ（自重のみ。ダンベル日も自重で補完） ---
  { id: "calf-raise", name: "カーフレイズ", rep: "20回", url: "https://fily.jp/articles/4835", pattern: "calf", muscle: "calf", equipment: "bodyweight", region: "lower", kind: "main" },
  // --- 上半身: 水平プッシュ ---
  { id: "push-up", name: "腕立て伏せ", rep: "10〜15回", pattern: "h-push", muscle: "chest", equipment: "bodyweight", region: "upper", kind: "main" },
  { id: "knee-push-up", name: "膝つき腕立て伏せ", rep: "12〜15回", pattern: "h-push", muscle: "chest", equipment: "bodyweight", region: "upper", kind: "main" },
  { id: "floor-press", name: "ダンベルフロアプレス", rep: "10〜12回", url: "https://vokka.jp/17340/", pattern: "h-push", muscle: "chest", equipment: "dumbbell", region: "upper", kind: "main" },
  // --- 上半身: 垂直プッシュ ---
  { id: "pike-push-up", name: "パイクプッシュアップ", rep: "8〜12回", url: "https://melos.media/training/184478/", pattern: "v-push", muscle: "shoulder", equipment: "bodyweight", region: "upper", kind: "main" },
  { id: "shoulder-press", name: "ダンベルショルダープレス", rep: "10〜12回", url: "https://belegend.jp/article/communication/9594/", pattern: "v-push", muscle: "shoulder", equipment: "dumbbell", region: "upper", kind: "main" },
  // --- 上半身: 水平プル（自宅・自重向けに補強） ---
  { id: "one-arm-row", name: "ワンハンドロー", rep: "10〜12回/側", url: "https://sports.yahoo.co.jp/column/detail/2024071200022-spnavido", pattern: "h-pull", muscle: "back", equipment: "dumbbell", region: "upper", kind: "main" },
  { id: "towel-row", name: "タオルローイング", rep: "12〜15回", url: "https://qool.jp/200490", pattern: "h-pull", muscle: "back", equipment: "bodyweight", region: "upper", kind: "main" },
  { id: "inverted-row", name: "斜め懸垂（机ロウ）", rep: "10〜12回", url: "https://qitano.com/inverted-row", pattern: "h-pull", muscle: "back", equipment: "bodyweight", region: "upper", kind: "main" },
  // --- 上半身: 垂直プル / 後背 ---
  { id: "db-reverse-fly", name: "ダンベルリバースフライ", rep: "12〜15回", url: "https://fily.jp/articles/3555", pattern: "v-pull", muscle: "rear-delt", equipment: "dumbbell", region: "upper", kind: "main" },
  { id: "superman", name: "スーパーマン", rep: "15回", url: "https://fily.jp/articles/2007", pattern: "v-pull", muscle: "back", equipment: "bodyweight", region: "upper", kind: "main" },
  // --- 上半身: 腕（単関節） ---
  { id: "db-curl", name: "ダンベルカール", rep: "10〜12回", url: "https://fily.jp/articles/2285", pattern: "arm", muscle: "biceps", equipment: "dumbbell", region: "upper", kind: "main" },
];

// 1セッションの構成: 必須パターン + 不足分を埋める補充パターン（種目数だけ先頭から採用）
const STRENGTH_TEMPLATES = {
  upper: { required: ["h-push", "h-pull", "core"], fill: ["v-pull", "v-push", "arm"] },
  lower: { required: ["squat", "hinge", "core"], fill: ["unilateral", "calf", "hinge"] },
};
// 部位×器具の4回ローテーション（上×自重→下×ダンベル→上×ダンベル→下×自重）
const STRENGTH_COUNT_BY_LEVEL = { soft: 4, normal: 5, hard: 6 };
const STRENGTH_SETS = { main: { soft: 3, normal: 3, hard: 4 }, core: { soft: 2, normal: 2, hard: 3 } };

// 履歴を参照して、その日に鍛えるべき部位（上半身/下半身）を自動選択する。
// 直近7日で実施回数が少ない部位を優先し、同数なら前回と反対の部位（連日同部位を避け回復を確保）。
function autoStrengthRegion(date) {
  const sessions = (state.workoutHistory || [])
    .filter((entry) => entry.date < date && entry.region)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!sessions.length) return "upper";
  const from = new Date(`${date}T00:00:00`);
  from.setDate(from.getDate() - 7);
  const fromIso = toIsoDate(from);
  const window = sessions.filter((entry) => entry.date >= fromIso);
  const upper = window.filter((entry) => entry.region === "upper").length;
  const lower = window.filter((entry) => entry.region === "lower").length;
  if (upper === lower) return sessions[0].region === "upper" ? "lower" : "upper";
  return upper < lower ? "upper" : "lower";
}

// 直近 days 日の筋群ごとの実施回数（週次バランスの基準）
function strengthMuscleLoad(days) {
  const counts = {};
  const from = new Date(`${selectedDate}T00:00:00`);
  from.setDate(from.getDate() - days);
  const fromIso = toIsoDate(from);
  (state.workoutHistory || [])
    .filter((entry) => entry.date >= fromIso && entry.date < selectedDate && Array.isArray(entry.muscles))
    .forEach((entry) => entry.muscles.forEach((m) => { counts[m] = (counts[m] || 0) + 1; }));
  return counts;
}

// 直近 days 日の器具ごとの実施回数（自重×ダンベルを週単位でも均す基準）
function strengthEquipLoad(days) {
  const counts = { bodyweight: 0, dumbbell: 0 };
  const from = new Date(`${selectedDate}T00:00:00`);
  from.setDate(from.getDate() - days);
  const fromIso = toIsoDate(from);
  (state.workoutHistory || [])
    .filter((entry) => entry.date >= fromIso && entry.date < selectedDate && Array.isArray(entry.equipments))
    .forEach((entry) => entry.equipments.forEach((e) => { counts[e] = (counts[e] || 0) + 1; }));
  return counts;
}

function pickStrengthExercises(region, count) {
  const template = STRENGTH_TEMPLATES[region] || STRENGTH_TEMPLATES.upper;
  const slots = [...template.required, ...template.fill].slice(0, count);
  const recentMuscle = strengthMuscleLoad(7);
  const recentEquip = strengthEquipLoad(7);
  const prevIds = latestStrengthHistoryIds();
  // 候補は部位内の全器具（コアは常に自重）。器具は1日固定にせず、セッション内で自重×ダンベルを均す。
  const pool = STRENGTH_EXERCISES.filter((ex) => ex.pattern === "core" || ex.region === region);
  const usedIds = new Set();
  const sessionEquip = { bodyweight: 0, dumbbell: 0 }; // メイン種目のセッション内器具カウント
  const chosen = [];
  const scoreOf = (ex) => {
    let s = -(recentMuscle[ex.muscle] || 0) * 2   // 直近で多い筋群は減点（手薄を優先）
            - (prevIds.has(ex.id) ? 3 : 0)        // 前回と同一種目は回避
            + Math.random();                      // 同点はランダム
    if (ex.pattern !== "core") {
      // セッション内で少ない器具を強く優先＋週内で少ない器具を軽く優先（自重×ダンベルのバランス配分）
      s += -(sessionEquip[ex.equipment] || 0) * 2.5 - (recentEquip[ex.equipment] || 0) * 0.5;
    }
    return s;
  };
  for (const pattern of slots) {
    let cands = pool.filter((ex) => ex.pattern === pattern && !usedIds.has(ex.id));
    if (!cands.length) {
      // 候補が尽きた枠は、同部位の未使用種目（コア以外）で密度を保つ
      cands = pool.filter((ex) => ex.pattern !== "core" && !usedIds.has(ex.id));
    }
    if (!cands.length) continue;
    const best = cands.map((ex) => ({ ex, s: scoreOf(ex) })).sort((a, b) => b.s - a.s)[0].ex;
    usedIds.add(best.id);
    chosen.push(best);
    if (best.pattern !== "core") sessionEquip[best.equipment] = (sessionEquip[best.equipment] || 0) + 1;
  }
  return chosen;
}

function formatStrengthStep(ex, level) {
  const sets = (STRENGTH_SETS[ex.kind] || STRENGTH_SETS.main)[level];
  return { id: ex.id, muscle: ex.muscle, equipment: ex.equipment, url: ex.url || "", text: `${ex.name} ${ex.rep} × ${sets}セット` };
}

function buildStrengthSteps(level, region) {
  const count = STRENGTH_COUNT_BY_LEVEL[level] || 5;
  return pickStrengthExercises(region, count).map((ex) => formatStrengthStep(ex, level));
}

function buildWorkoutPlan() {
  const labels = { strength: "筋トレ", bag: "サンドバッグ", running: "ランニング" };
  const strengthRegion = autoStrengthRegion(selectedDate);
  const strengthMinutes = { soft: "15分", normal: "30分", hard: "1時間" };
  const buildStrengthMenu = (level) => {
    const steps = buildStrengthSteps(level, strengthRegion);
    return {
      target: `${strengthMinutes[level]}・休憩60〜75秒`,
      region: strengthRegion,
      equipments: steps.map((step) => step.equipment).filter(Boolean),
      steps,
    };
  };
  const menus = {
    strength: {
      soft: buildStrengthMenu("soft"),
      normal: buildStrengthMenu("normal"),
      hard: buildStrengthMenu("hard"),
    },
    bag: {
      soft: { target: "6R", steps: ["6R（1R 3分 + 20秒休憩）"] },
      normal: { target: "12R", steps: ["12R（1R 3分 + 20秒休憩）"] },
      hard: { target: "18R", steps: ["18R（1R 3分 + 20秒休憩）"] },
    },
    running: {
      soft: { target: "5km", steps: ["5kmを会話できるペースで走る"] },
      normal: { target: "10km", steps: ["10kmを会話できるペースで走る"] },
      hard: { target: "20km", steps: ["20kmを会話できるペースで走る"] },
    },
  };

  const items = Object.keys(labels)
    .filter((type) => document.querySelector(`[data-plan-enabled="${type}"]`)?.checked)
    .map((type) => {
      const level = selectedPlanLevel(type) || "normal";
      const estimatedKcal = estimateWorkoutKcal(type, level);
      return { type, label: labels[type], level, estimatedKcal, ...menus[type][level] };
    });

  return { date: selectedDate, items };
}

function currentBodyWeightKg() {
  return latestTrend()?.trendKg || latestEntry()?.weightKg || state.settings.startWeightKg || 78;
}

function estimateWorkoutKcal(type, level) {
  const kg = currentBodyWeightKg();
  const specs = {
    strength: {
      soft: { met: 3.8, minutes: 15 },
      normal: { met: 5.0, minutes: 30 },
      hard: { met: 6.0, minutes: 60 },
    },
    bag: {
      soft: { met: 5.8, minutes: 20 },
      normal: { met: 8.5, minutes: 40 },
      hard: { met: 10.8, minutes: 60 },
    },
    running: {
      soft: { met: 8.5, minutes: 37.5 },
      normal: { met: 8.5, minutes: 75 },
      hard: { met: 8.5, minutes: 150 },
    },
  };
  const spec = specs[type]?.[level];
  if (!spec) return 0;
  return Math.round((spec.met * 3.5 * kg * spec.minutes) / 200);
}

function workoutPlanKcal(plan) {
  return (plan?.items || []).reduce((sum, item) => sum + (Number(item.estimatedKcal) || estimateWorkoutKcal(item.type, item.level)), 0);
}

function upsertWorkoutPlan(plan) {
  state.workoutPlan = plan;
  state.workoutPlans = [
    ...(state.workoutPlans || []).filter((entry) => entry.date !== plan.date),
    plan,
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
}

function getWorkoutPlanForDate(date) {
  if (state.workoutPlan?.date === date) return state.workoutPlan;
  return (state.workoutPlans || []).find((plan) => plan.date === date) || null;
}

function latestStrengthHistoryIds() {
  return new Set(
    [...(state.workoutHistory || [])]
      .filter((entry) => entry.date < selectedDate && entry.strengthStepIds?.length)
      .sort((a, b) => b.date.localeCompare(a.date))
      .at(0)?.strengthStepIds || []
  );
}

function rememberWorkoutPlan(plan) {
  const strength = plan.items.find((item) => item.type === "strength");
  if (!strength) return;
  state.workoutHistory = [
    ...(state.workoutHistory || []).filter((entry) => entry.date !== plan.date),
    {
      date: plan.date,
      region: strength.region || null,
      equipments: strength.equipments || [],
      strengthStepIds: strength.steps.map((step) => step.id).filter(Boolean),
      muscles: strength.steps.map((step) => step.muscle).filter(Boolean),
    },
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
}

function renderPlanInto(selector, plan = state.workoutPlan) {
  const container = document.querySelector(selector);
  if (!container) return;
  if (!plan) {
    container.innerHTML = "";
    return;
  }
  if (!plan.items.length) {
    container.innerHTML = `
      <h3>${plan.date.replaceAll("-", "/")} の休養メニュー</h3>
      <p>この日は休養として保存しました。実施する種目をONにして再生成すると、運動メニューに更新できます。</p>
    `;
    return;
  }
  container.innerHTML = `
    <h3>${plan.date.replaceAll("-", "/")} の最適メニュー</h3>
    ${plan.items.map((item) => `
      <article class="generated-item">
        <strong>${item.label}<span>${levelLabel(item.level)} / ${escapeHtml(item.target)} / 約${item.estimatedKcal || estimateWorkoutKcal(item.type, item.level)}kcal</span></strong>
        <ul>${item.steps.map(renderWorkoutStep).join("")}</ul>
      </article>
    `).join("")}
  `;
}

function renderWorkoutStep(step) {
  if (typeof step === "string") return `<li>${escapeHtml(step)}</li>`;
  const link = step.url ? ` <a href="${escapeHtml(step.url)}" target="_blank" rel="noopener">参考</a>` : "";
  return `<li>${escapeHtml(step.text)}${link}</li>`;
}

function renderWorkoutPlan() {
  renderPlanInto("#exerciseGeneratedMenu");
}

function renderRecordWorkoutPlan() {
  const plan = getWorkoutPlanForDate(selectedDate);
  if (!plan) {
    const container = document.querySelector("#recordGeneratedMenu");
    if (container) {
      container.innerHTML = `<p>この日の運動メニューはまだ自動生成されていません。運動画面で「最適メニューの自動生成」を押すと、ここにメニューが出ます。</p>`;
    }
    return;
  }
  renderPlanInto("#recordGeneratedMenu", plan);
}

function renderExerciseMotivation() {
  const container = document.querySelector("#exerciseMotivationPanel");
  if (!container) return;
  const streak = exerciseStreak(selectedDate);
  const burn = weeklyBurnProgress(selectedDate);
  const milestone = nextStreakMilestone(streak.count);
  const streakLevel = streak.count >= 7 ? "level-3" : streak.count >= 3 ? "level-2" : streak.count >= 1 ? "level-1" : "level-0";
  const streakTitle = streak.count ? `${streak.count}日継続中` : "継続記録はまだ始まっていません";
  const streakMessage = streak.count
    ? `${streak.restDays ? `計画休養${streak.restDays}日を含めて、` : ""}運動リズムを維持できています。次は${milestone}日継続を狙いましょう。`
    : "運動を実施するか、休養用の空メニューを作って保存すると継続記録が始まります。";
  const remainingRate = Math.max(0, Math.min(100, (burn.remaining / WEEKLY_BOSS_HP) * 100));
  const burnRate = Math.max(0, Math.min(100, (burn.total / WEEKLY_BOSS_HP) * 100));
  const burnPhase = burn.remaining <= 0 ? "defeated" : remainingRate <= 25 ? "phase-critical" : remainingRate <= 55 ? "phase-damaged" : "phase-healthy";
  const burnMessage = burn.remaining <= 0
    ? `今週の運動消費は${burn.total}kcalです。週間目標を達成しています。`
    : `今週の運動消費は${burn.total}kcalです。週間目標まであと${burn.remaining}kcalです。`;

  container.innerHTML = `
    <article class="streak-panel">
      <div class="motivation-head">
        <div>
          <span class="panel-label">TRAINING STREAK</span>
          <strong>${escapeHtml(streakTitle)}</strong>
        </div>
      </div>
      <div class="streak-counter ${streakLevel}" aria-label="運動継続日数 ${streak.count}日">
        <span>継続日数</span>
        <strong>${streak.count}</strong>
        <small>日</small>
      </div>
      <p>${escapeHtml(streakMessage)}</p>
    </article>
    <article class="boss-panel ${burnPhase}">
      <div class="motivation-head">
        <div>
          <span class="panel-label">WEEKLY BURN</span>
          <strong>週間目標まで ${burn.remaining} kcal</strong>
        </div>
        <span>${escapeHtml(burn.rangeLabel)}</span>
      </div>
      <div class="boss-gauge-card" aria-label="週間燃焼ゲージ">
        <div class="boss-gauge-head">
          <span>今週の燃焼</span>
          <strong>${burn.total}<small>kcal</small></strong>
        </div>
        <div class="boss-gauge" aria-hidden="true">
          <span style="width: ${burnRate}%"></span>
        </div>
        <div class="boss-gauge-foot">
          <span>0</span>
          <span>${WEEKLY_BOSS_HP}kcal</span>
        </div>
      </div>
      <p>${escapeHtml(burnMessage)}</p>
    </article>
  `;
}

function exerciseStreak(anchorDate) {
  let count = 0;
  let restDays = 0;
  const cursor = new Date(`${anchorDate}T00:00:00`);
  // 当日はまだ進行中。今日の運動が未記録でも前日までの継続は途切れていないので、
  // 今日を飛ばして前日から数える（前日運動→当日表示が0になる不具合の対策）。
  if (anchorDate === todayIso() && !exerciseStreakStatus(anchorDate).ok) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const date = toIsoDate(cursor);
    const status = exerciseStreakStatus(date);
    if (!status.ok) break;
    count += 1;
    if (status.type === "rest") restDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { count, restDays };
}

function exerciseStreakStatus(date) {
  const check = state.dailyChecks.find((entry) => entry.date === date);
  if (check?.exerciseDone) return { ok: true, type: "exercise" };
  const plan = getWorkoutPlanForDate(date);
  if (check && plan && !plan.items.length && !check.exerciseDone) return { ok: true, type: "rest" };
  return { ok: false, type: "none" };
}

function nextStreakMilestone(count) {
  return [3, 7, 14, 30, 60, 100].find((day) => day > count) || count + 50;
}

function weeklyBurnProgress(anchorDate) {
  const start = weekStart(anchorDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  let total = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    total += exerciseBurnForDate(toIsoDate(cursor));
  }
  const remaining = Math.max(0, WEEKLY_BOSS_HP - total);
  return {
    total,
    remaining,
    rangeLabel: `${toIsoDate(start).replaceAll("-", "/")} - ${toIsoDate(end).replaceAll("-", "/")}`,
  };
}

function weekStart(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
  const day = date.getDay();
  const offset = (day + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function exerciseBurnForDate(date) {
  const check = state.dailyChecks.find((entry) => entry.date === date);
  if (!check?.exerciseDone) return 0;
  const plan = getWorkoutPlanForDate(date);
  if (plan?.items?.length) return workoutPlanKcal(plan);
  return 250;
}

function setExerciseSegment(done) {
  document.querySelectorAll("[data-exercise]").forEach((button) => {
    button.classList.toggle("active", button.dataset.exercise === String(done));
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function activateView(viewName) {
  document.querySelectorAll(".tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#view-${viewName}`)?.classList.add("active");
  drawChart();
}

function setSettingsOpen(open) {
  const overlay = document.querySelector("#settingsOverlay");
  if (!overlay) return;
  overlay.classList.toggle("active", open);
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    renderSettings();
    document.querySelector("#heightCm")?.focus();
  } else {
    document.querySelector("#openSettingsView")?.focus();
  }
}

function upsertWeight(date, weightKg) {
  const existing = state.weightEntries.find((entry) => entry.date === date);
  if (existing) existing.weightKg = weightKg;
  else state.weightEntries.push({ date, weightKg });
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activateView(tab.dataset.view);
    });
  });

  document.querySelector("#weightForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveRecord();
  });

  document.querySelector("#saveRecord").addEventListener("click", saveRecord);

  function saveRecord() {
    const weightInput = document.querySelector("#weightInput");
    const rawWeight = weightInput.value.trim();
    const weightValue = parseWeightInputValue(rawWeight);
    if (rawWeight && weightValue === null) {
      showSaveStatus("体重は30.0〜199.9kgの範囲で、小数第1位まで入力してください。");
      weightInput.focus();
      return;
    }
    if (weightValue !== null) {
      upsertWeight(selectedDate, weightValue);
    }
    const check = getSelectedCheck();
    check.exerciseDone = document.querySelector("[data-exercise='true']").classList.contains("active");
    saveState("記録を保存しました");
    render();
  }

  document.querySelector("#deleteRecord").addEventListener("click", () => {
    state.weightEntries = state.weightEntries.filter((entry) => entry.date !== selectedDate);
    state.dailyChecks = state.dailyChecks.filter((entry) => entry.date !== selectedDate);
    state.mealLogs = (state.mealLogs || []).filter((entry) => entry.date !== selectedDate);
    if (state.workoutPlan?.date === selectedDate) state.workoutPlan = null;
    state.workoutPlans = (state.workoutPlans || []).filter((entry) => entry.date !== selectedDate);
    saveState();
    render();
  });

  document.querySelector("#closeResult").addEventListener("click", hideResultModal);
  document.querySelector("#resultModal").addEventListener("click", (event) => {
    if (event.target.id === "resultModal") hideResultModal();
  });

  document.querySelector("#calendarGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    selectedDate = button.dataset.date;
    calendarMonth = selectedDate.slice(0, 7);
    render();
  });

  document.querySelector("#prevMonth").addEventListener("click", () => {
    const [year, month] = calendarMonth.split("-").map(Number);
    calendarMonth = toIsoDate(new Date(year, month - 2, 1)).slice(0, 7);
    render();
  });

  document.querySelector("#nextMonth").addEventListener("click", () => {
    const [year, month] = calendarMonth.split("-").map(Number);
    calendarMonth = toIsoDate(new Date(year, month, 1)).slice(0, 7);
    render();
  });

  document.querySelector("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings.heightCm = Number(document.querySelector("#heightCm").value);
    state.settings.age = Number(document.querySelector("#age").value);
    state.settings.sex = document.querySelector("#sex").value;
    state.settings.startWeightKg = Number(document.querySelector("#startWeight").value);
    state.settings.goalWeightKg = Number(document.querySelector("#goalWeight").value);
    state.settings.goalDate = document.querySelector("#goalDate").value;
    saveState("設定保存済み");
    render();
    showSettingsSavedFeedback();
  });

  document.querySelector("#settingsForm").addEventListener("input", () => {
    applyGoalNotice(
      Number(document.querySelector("#heightCm").value),
      Number(document.querySelector("#goalWeight").value),
      document.querySelector("#goalDate").value
    );
    const previewWeight = currentBodyWeightKg();
    const previewSex = document.querySelector("#sex").value;
    const previewAge = Number(document.querySelector("#age").value);
    const previewHeight = Number(document.querySelector("#heightCm").value);
    const bmr = previewHeight && previewAge
      ? Math.round((10 * previewWeight) + (6.25 * previewHeight) - (5 * previewAge) + (previewSex === "female" ? -161 : 5))
      : null;
    const goalKg = Number(document.querySelector("#goalWeight").value);
    const goalDate = document.querySelector("#goalDate").value;
    const referenceDate = latestTrend()?.date || latestEntry()?.date || todayIso();
    const daysLeft = goalDate ? daysBetween(referenceDate, goalDate) : 0;
    const dailyDeficit = daysLeft > 0 && previewWeight > goalKg ? Math.round(((previewWeight - goalKg) * 7200) / daysLeft) : null;
    setText("#bmrValue", bmr ? `${bmr} kcal` : "-- kcal");
    setText("#requiredDeficitValue", dailyDeficit ? `${dailyDeficit} kcal` : "-- kcal");
  });

  document.querySelector("#openSettingsView").addEventListener("click", () => setSettingsOpen(true));
  document.querySelector("#closeSettingsView").addEventListener("click", () => setSettingsOpen(false));
  document.querySelector("#settingsOverlay").addEventListener("click", (event) => {
    if (event.target.id === "settingsOverlay") setSettingsOpen(false);
  });

  document.querySelector("#weightInput").addEventListener("input", syncWeightInputFormatting);

  document.querySelector("#openFoodView").addEventListener("click", () => {
    activateView("food");
    document.querySelector("#foodSearchInput")?.focus();
  });

  document.querySelector("#unifiedFoodSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    performUnifiedFoodSearch();
  });

  document.querySelector("#foodSearchInput").addEventListener("input", (event) => {
    foodSearchQuery = event.target.value;
    const barcodeCandidate = foodSearchQuery.trim().replace(/\D/g, "");
    const compactQuery = foodSearchQuery.trim().replace(/[\s-]/g, "");
    foodSearchStatus = barcodeCandidate.length >= 8 && barcodeCandidate === compactQuery
      ? "検索ボタンで商品DBを確認します。"
      : "候補を選択すると、今日の摂取欄で量を入力できます。";
    renderFoodSearch();
  });

  document.querySelector("#foodSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-food-id]");
    if (!button) return;
    setPendingGenericFood(button.dataset.foodId);
  });

  document.querySelector("#scanBarcodeButton").addEventListener("click", () => {
    document.querySelector("#barcodeImageInput")?.click();
  });

  document.querySelector("#barcodeImageInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    foodSearchStatus = "画像からバーコードを読み取っています。";
    renderFoodSearch();
    const result = await decodeBarcodeFromImage(file);
    event.target.value = "";
    if (!result.code) {
      if (result.reason === "unsupported") {
        foodSearchStatus = "このブラウザでは画像からの自動読取に未対応です。バーコード番号を入力して検索できます。";
      } else if (result.reason === "not_found") {
        foodSearchStatus = "画像からバーコードを読み取れませんでした。番号入力で検索できます。";
      } else {
        foodSearchStatus = "バーコード読取に失敗しました。番号入力で検索できます。";
      }
      renderFoodSearch();
      return;
    }
    const input = document.querySelector("#foodSearchInput");
    if (input) input.value = result.code;
    foodSearchQuery = result.code;
    await performUnifiedFoodSearch();
  });

  document.querySelector("#pendingFoodResult").addEventListener("input", (event) => {
    if (event.target.matches("[data-pending-input='amount']") && pendingFoodEntry) {
      const value = event.target.value;
      if (pendingFoodEntry.type === "generic") pendingFoodEntry.amountG = value === "" ? "" : Number(value) || 0;
      if (pendingFoodEntry.type === "barcode") pendingFoodEntry.amount = value === "" ? "" : Number(value) || 0;
      renderPendingNutritionPreview();
    }
  });

  document.querySelector("#pendingFoodResult").addEventListener("focusin", (event) => {
    if (event.target.matches("[data-pending-input='amount']")) {
      event.target.select();
    }
  });

  document.querySelector("#pendingFoodResult").addEventListener("click", (event) => {
    const button = event.target.closest("[data-pending-action]");
    if (!button) return;
    if (button.dataset.pendingAction === "clear") {
      pendingFoodEntry = null;
      renderFood();
      return;
    }
    if (button.dataset.pendingAction === "register") {
      registerPendingFood();
      return;
    }
    if (button.dataset.pendingAction === "manual") {
      const product = pendingFoodEntry?.product;
      showManualFoodEntry({
        barcode: product?.code || "",
        name: product ? barcodeDisplayName(product) : "",
      });
    }
  });

  document.querySelector("#pendingFoodResult").addEventListener("submit", (event) => {
    event.preventDefault();
    registerManualFood();
  });

  document.querySelector("#masterFoodEntryPanel")?.addEventListener("change", (event) => {
    if (!event.target.matches("#masterFoodUnitMode")) return;
    const unitLabel = document.querySelector("#masterFoodUnitLabel");
    if (!unitLabel) return;
    if (event.target.value === "gram") {
      unitLabel.value = "100g";
      unitLabel.disabled = true;
      return;
    }
    unitLabel.disabled = false;
    if (unitLabel.value === "100g") unitLabel.value = "1食";
  });

  document.querySelector("#masterFoodEntryPanel")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-master-action]");
    if (!button) return;
    if (button.dataset.masterAction === "clear") {
      masterFoodEntryOpen = false;
      renderFood();
    }
  });

  document.querySelector("#masterFoodEntryPanel")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.matches("#masterFoodForm")) registerMasterFood();
  });

  document.querySelector("#showMasterFoodEntry")?.addEventListener("click", () => {
    showMasterFoodEntry();
  });

  document.addEventListener("click", (event) => {
    const repeatButton = event.target.closest("[data-repeat-meal-log]");
    if (repeatButton) {
      addMealLogFromHistory(repeatButton.dataset.repeatMealLog);
      return;
    }
    const button = event.target.closest("[data-delete-meal-log]");
    if (!button) return;
    state.mealLogs = (state.mealLogs || []).filter((entry) => entry.id !== button.dataset.deleteMealLog);
    saveState("食事削除済み");
    render();
  });

  document.querySelector("#exercisePlanner").addEventListener("click", (event) => {
    const button = event.target.closest("[data-plan-level]");
    if (!button) return;
    const [type, level] = button.dataset.planLevel.split(":");
    setPlanLevel(type, level);
  });

  document.querySelector("#exercisePlanner").addEventListener("change", (event) => {
    const input = event.target.closest("[data-plan-enabled]");
    if (!input || !input.checked) return;
    launchBreakerSparks(input.closest(".power-breaker"));
  });

  document.querySelector("#generateWorkout").addEventListener("click", () => {
    const plan = buildWorkoutPlan();
    upsertWorkoutPlan(plan);
    rememberWorkoutPlan(plan);
    saveState();
    renderWorkoutPlan();
    renderExerciseMotivation();
    renderRecordWorkoutPlan();
    updateFoodBurner();
    showWorkoutGeneratedFeedback(plan);
  });

  document.querySelector("#timerStartPause").addEventListener("click", toggleRoundTimer);

  // タブ/アプリ復帰時、タイマー実行中なら Wake Lock を取り直す（バックグラウンドで自動解放されるため）
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncWakeLock();
  });

  document.querySelector("#timerReset").addEventListener("click", () => {
    playClick();
    resetRoundTimer();
  });

  document.querySelector("#openTimerSettings").addEventListener("click", () => {
    setTimerSettingsOpen(true);
  });

  document.querySelector("#closeTimerSettings").addEventListener("click", () => {
    setTimerSettingsOpen(false);
  });

  document.querySelector("#timerSettingsModal").addEventListener("click", (event) => {
    if (event.target.id === "timerSettingsModal") setTimerSettingsOpen(false);
  });

  document.querySelector("#timerPreset").addEventListener("change", updateTimerPresetNameFromSelection);

  document.querySelector("#applyTimerPreset").addEventListener("click", applySelectedRoundTimerPreset);

  document.querySelector("#saveTimerPreset").addEventListener("click", () => {
    saveCurrentRoundTimerPreset();
  });

  document.querySelector("#deleteTimerPreset").addEventListener("click", () => {
    deleteSelectedRoundTimerPreset();
  });

  document.querySelectorAll("[data-timer-setting]").forEach((input) => {
    const updateTimerSetting = () => {
      const current = currentRoundTimer();
      const next = {
        ...current,
        [input.dataset.timerSetting]: Number(input.value),
      };
      next.presetId = matchRoundTimerPreset(normalizeRoundTimer(next));
      saveRoundTimerSettings(next);
    };
    input.addEventListener("input", updateTimerSetting);
    input.addEventListener("change", updateTimerSetting);
  });

  document.querySelectorAll("[data-timer-setting-min]").forEach((input) => {
    const updateTimerSettingMin = () => {
      const next = {
        ...currentRoundTimer(),
        [input.dataset.timerSettingMin]: Math.round(Number(input.value) * 60),
      };
      next.presetId = matchRoundTimerPreset(normalizeRoundTimer(next));
      saveRoundTimerSettings(next);
    };
    input.addEventListener("input", updateTimerSettingMin);
    input.addEventListener("change", updateTimerSettingMin);
  });

  document.querySelector("#exerciseSegment").addEventListener("click", (event) => {
    const button = event.target.closest("[data-exercise]");
    if (!button) return;
    setExerciseSegment(button.dataset.exercise === "true");
    updateFoodBurner();
    if (button.dataset.exercise === "true") launchFoodBurn();
  });
  document.querySelector("#resetData").addEventListener("click", () => {
    if (confirm("端末内の体重・運動データをすべて削除しますか？")) {
      state = structuredClone(defaultState);
      resetRoundTimer(false);
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(BACKUP_STORE_KEY);
      render();
    }
  });
  window.addEventListener("resize", drawChart);
}

function launchBreakerSparks(breaker) {
  const burst = breaker?.querySelector(".spark-burst");
  if (!burst) return;
  burst.innerHTML = "";
  breaker.classList.remove("firing");
  for (let i = 0; i < 18; i += 1) {
    const spark = document.createElement("span");
    spark.style.setProperty("--angle", `${-75 + Math.random() * 150}deg`);
    spark.style.setProperty("--distance", `${26 + Math.random() * 38}px`);
    spark.style.animationDelay = `${Math.random() * 0.08}s`;
    burst.appendChild(spark);
  }
  requestAnimationFrame(() => breaker.classList.add("firing"));
  setTimeout(() => {
    breaker.classList.remove("firing");
    burst.innerHTML = "";
  }, 720);
}

function updateFoodBurner() {
  const guidance = intakeGuidance(selectedDate);

  const burner = document.querySelector("#fatBurner");
  if (!burner) return;
  const score = currentUiScore();
  const level = score === 0 ? 0 : Math.min(10, Math.ceil(score / 10));
  burner.className = `fat-burner heat-${level}`;
  const text = document.querySelector("#fatBurnText");
  if (!text) return;
  if (!guidance) {
    text.textContent = "目標体重と期限を設定すると、今日必要なカロリー差を計算します。まずは設定を確認してください。";
    return;
  }
  if (!guidance.hasFoodLog) {
    text.textContent = `今日の目標カロリー差は約${guidance.required}kcalです。食事実績がまだないため、判定は行いません。食事を登録すると現在の進捗を確認できます。`;
    return;
  }
  const decision = dailyDecision(selectedDate);
  if (guidance.intake < guidance.lower) {
    text.textContent = `今日の摂取は${guidance.intake}kcalです。基礎代謝の目安 ${guidance.lower}kcal を下回っているため、食事量が少なすぎます。まずは下限まで補ってください。`;
    return;
  }
  if (guidance.intake > guidance.upper) {
    text.textContent = `今日の摂取は${guidance.intake}kcalです。上限目安 ${guidance.upper}kcal を ${guidance.intake - guidance.upper}kcal 上回っています。次の食事は軽めにするか、運動量を増やして調整してください。`;
    return;
  }
  if (decision.status === "pass") {
    text.textContent = `今日の摂取は${guidance.intake}kcalで、目安範囲内です。実績カロリー差は${guidance.actualDeficit}kcal、目標は${guidance.required}kcalです。このペースなら今日の判定は合格です。`;
    return;
  }
  text.textContent = `今日の摂取は${guidance.intake}kcalで、食事量は目安範囲内です。ただし実績カロリー差は${guidance.actualDeficit}kcalで、目標の${guidance.required}kcalに届いていません。運動を追加するか、以降の食事量を調整してください。`;
}

function launchFoodBurn() {
  const burner = document.querySelector("#fatBurner");
  if (!burner) return;
  burner.classList.remove("burst");
  requestAnimationFrame(() => burner.classList.add("burst"));
  setTimeout(() => burner.classList.remove("burst"), 560);
}

function showResultModal() {
  setText("#resultTitle", "記録完了");
  setText("#resultMessage", "今日の積み上げを保存しました。");
  const modal = document.querySelector("#resultModal");
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function hideResultModal() {
  const modal = document.querySelector("#resultModal");
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.querySelector("#confettiLayer").innerHTML = "";
  const gloom = document.querySelector("#gloomLayer");
  gloom.classList.remove("active");
  gloom.innerHTML = "";
}

function launchConfetti() {
  const layer = document.querySelector("#confettiLayer");
  const colors = ["#f6c83f", "#3fb8e8", "#64bf41", "#e88a2c", "#ffffff", "#e94c72"];
  layer.innerHTML = "";
  for (let i = 0; i < 72; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.55}s`;
    piece.style.animationDuration = `${1.35 + Math.random() * 1.1}s`;
    piece.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 180)}px`);
    piece.style.setProperty("--spin", `${Math.round(360 + Math.random() * 720)}deg`);
    layer.appendChild(piece);
  }
  setTimeout(() => {
    layer.innerHTML = "";
  }, 3200);
}

function launchGloom() {
  const layer = document.querySelector("#gloomLayer");
  layer.innerHTML = "";
  layer.classList.add("active");
  for (let i = 0; i < 46; i += 1) {
    const drop = document.createElement("span");
    drop.className = "rain-drop";
    drop.style.left = `${Math.random() * 110}%`;
    drop.style.animationDelay = `${Math.random() * 0.8}s`;
    drop.style.animationDuration = `${0.85 + Math.random() * 0.8}s`;
    layer.appendChild(drop);
  }
  setTimeout(() => {
    layer.classList.remove("active");
    layer.innerHTML = "";
  }, 3200);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

bindEvents();
render();
loadGenericFoodMaster();
preloadGong();
