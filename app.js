const STORE_KEY = "weightTracker:v1";
const BACKUP_STORE_KEY = "weightTracker:v1:backup";
const ALPHA = 0.25;
const MS_PER_DAY = 86400000;
const WEEKLY_BOSS_HP = 2000;
const MIN_RECORD_WEIGHT = 30;
const MAX_RECORD_WEIGHT = 199.9;
const CUSTOM_TIMER_PRESET_ID = "custom";
const WEEKDAY_MEAL_CHECKS = [
  {
    id: "weekdayStartAfterNoon",
    group: "午前",
    points: 18,
    title: "食事開始が12:00以降",
    detail: "糖分入り飲料やつまみ食いも開始扱い",
  },
  {
    id: "weekdayFastingUnsweetenedDrink",
    group: "午前",
    points: 8,
    title: "断食中は無糖飲料のみ",
    detail: "水、お茶、ブラックコーヒーはOK",
  },
  {
    id: "weekdayFirstStapleNormal",
    group: "午前",
    points: 8,
    title: "1食目の米・パン・麺を通常量まで",
    detail: "大盛り、おかわり、主食2種類を避ける",
  },
  {
    id: "weekdayFirstProtein",
    group: "午前",
    points: 6,
    title: "1食目にたんぱく質の主役あり",
    detail: "肉、魚、卵、豆腐、納豆、プロテインなど",
  },
  {
    id: "weekdayEndByEight",
    group: "午後",
    points: 20,
    title: "最後の食事・飲み物が20:00まで",
    detail: "20:00以降は無糖飲料だけにする",
  },
  {
    id: "weekdayDinnerStapleNormal",
    group: "午後",
    points: 14,
    title: "夕食の米・パン・麺を通常量まで",
    detail: "ラーメン+ライス、替え玉、追加パンなし",
  },
  {
    id: "weekdayNoFriedFat",
    group: "午後",
    points: 10,
    title: "揚げ物・脂質多めを避けた",
    detail: "唐揚げ、フライ、ラーメン、菓子パンを控える",
  },
  {
    id: "weekdayNoAlcoholSweetDrink",
    group: "午後",
    points: 8,
    title: "酒・甘い飲み物なし",
    detail: "アルコール、ジュース、砂糖入りカフェ飲料なし",
  },
  {
    id: "weekdayNoLateSnack",
    group: "午後",
    points: 8,
    title: "予定外の間食・夜食なし",
    detail: "夕食後の追加摂取を止める",
  },
];
const WEEKEND_MEAL_CHECKS = [
  {
    id: "weekendNoGrazing",
    group: "午前",
    points: 15,
    title: "朝からだらだら食べ続けなかった",
    detail: "食べる時間を決め、つまみ続けを避ける",
  },
  {
    id: "weekendFirstProtein",
    group: "午前",
    points: 10,
    title: "最初の食事にたんぱく質あり",
    detail: "休日の食事開始を雑にしない",
  },
  {
    id: "weekendNoSweetDrink",
    group: "午前",
    points: 10,
    title: "甘い飲み物を控えた",
    detail: "飲み物でチートを増やさない",
  },
  {
    id: "weekendCheatOnce",
    group: "午後",
    points: 24,
    title: "チートは1回に収めた",
    detail: "ラーメンならラーメン、スイーツならスイーツで止める",
  },
  {
    id: "weekendNoLargeStaple",
    group: "午後",
    points: 16,
    title: "大盛り・替え玉・追加飯なし",
    detail: "休日の超過を一番増やしやすい追加主食を止める",
  },
  {
    id: "weekendNoLateSnack",
    group: "午後",
    points: 15,
    title: "夜食しなかった",
    detail: "休日の締めに追加で食べない",
  },
  {
    id: "weekendVegetablesFiber",
    group: "午後",
    points: 10,
    title: "野菜・汁物・食物繊維を入れた",
    detail: "満腹感を作り、チートの連鎖を防ぐ",
  },
];
const ROUND_TIMER_PRESETS = [
  { id: "boxing-6r", name: "3分 × 6R", prepSec: 30, workSec: 180, restSec: 20, rounds: 6 },
  { id: "boxing-12r", name: "3分 × 12R", prepSec: 30, workSec: 180, restSec: 20, rounds: 12 },
  { id: "boxing-18r", name: "3分 × 18R", prepSec: 30, workSec: 180, restSec: 20, rounds: 18 },
  { id: "tabata", name: "タバタ 20秒 × 8R", prepSec: 30, workSec: 20, restSec: 10, rounds: 8 },
  { id: CUSTOM_TIMER_PRESET_ID, name: "カスタム", prepSec: 30, workSec: 180, restSec: 20, rounds: 6 },
];
const DEFAULT_ROUND_TIMER = {
  presetId: "boxing-6r",
  prepSec: 30,
  workSec: 180,
  restSec: 20,
  rounds: 6,
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
  workoutPlan: null,
  workoutPlans: [],
  workoutHistory: [],
  roundTimer: { ...DEFAULT_ROUND_TIMER },
};

let state = loadState();
let selectedDate = todayIso();
let calendarMonth = selectedDate.slice(0, 7);
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
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved?.settings || {}) },
    weightEntries: Array.isArray(saved?.weightEntries) ? saved.weightEntries : [],
    exerciseLogs: Array.isArray(saved?.exerciseLogs) ? saved.exerciseLogs : [],
    dailyChecks,
    workoutPlans: Array.isArray(saved?.workoutPlans) ? saved.workoutPlans : [],
    workoutHistory: Array.isArray(saved?.workoutHistory) ? saved.workoutHistory : [],
    workoutPlan: saved?.workoutPlan || null,
    roundTimer: normalizeRoundTimer(saved?.roundTimer),
  };
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeRoundTimer(timer) {
  const savedPresets = [];
  const legacyPresetMap = {
    "sandbag-standard": "boxing-6r",
    "sandbag-short": "boxing-6r",
    "boxing-standard": "boxing-6r",
    "boxing-short": "boxing-6r",
    "hiit": "tabata",
  };
  const normalizedPresetId = legacyPresetMap[timer?.presetId] || timer?.presetId;
  const matchedPreset = ROUND_TIMER_PRESETS.find((preset) => preset.id === normalizedPresetId);
  const presetId = matchedPreset
    ? normalizedPresetId
    : DEFAULT_ROUND_TIMER.presetId;
  const presetDefaults = presetId !== CUSTOM_TIMER_PRESET_ID
    ? (matchedPreset || ROUND_TIMER_PRESETS.find((preset) => preset.id === presetId))
    : null;
  return {
    presetId,
    prepSec: presetDefaults ? presetDefaults.prepSec : clampInt(timer?.prepSec, 0, 600, DEFAULT_ROUND_TIMER.prepSec),
    workSec: presetDefaults ? presetDefaults.workSec : clampInt(timer?.workSec, 1, 3600, DEFAULT_ROUND_TIMER.workSec),
    restSec: presetDefaults ? presetDefaults.restSec : clampInt(timer?.restSec, 0, 1800, DEFAULT_ROUND_TIMER.restSec),
    rounds: presetDefaults ? presetDefaults.rounds : clampInt(timer?.rounds, 1, 99, DEFAULT_ROUND_TIMER.rounds),
    sound: timer?.sound !== false,
    savedPresets,
  };
}

function migrateDailyCheck(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return {
    date: entry.date,
    exerciseDone: Boolean(entry.exerciseDone),
    weekdayStartAfterNoon: Boolean(entry.weekdayStartAfterNoon),
    weekdayFastingUnsweetenedDrink: Boolean(entry.weekdayFastingUnsweetenedDrink || entry.weekdayNoCalorieDrink),
    weekdayFirstStapleNormal: Boolean(entry.weekdayFirstStapleNormal || entry.carbPortion || entry.lunchCarbPortion),
    weekdayFirstProtein: Boolean(entry.weekdayFirstProtein || entry.protein100),
    weekdayEndByEight: Boolean(entry.weekdayEndByEight || entry.noLateMeal),
    weekdayDinnerStapleNormal: Boolean(entry.weekdayDinnerStapleNormal || entry.dinnerCarbPortion),
    weekdayNoFriedFat: Boolean(entry.weekdayNoFriedFat || entry.noFried || entry.noHighFat),
    weekdayNoAlcoholSweetDrink: Boolean(entry.weekdayNoAlcoholSweetDrink || entry.noJuiceAlcohol || entry.noAlcoholSweets),
    weekdayNoLateSnack: Boolean(entry.weekdayNoLateSnack || entry.noLateSnack),
    weekendNoGrazing: Boolean(entry.weekendNoGrazing),
    weekendFirstProtein: Boolean(entry.weekendFirstProtein || entry.protein100),
    weekendNoSweetDrink: Boolean(entry.weekendNoSweetDrink || entry.noJuiceAlcohol),
    weekendCheatOnce: Boolean(entry.weekendCheatOnce),
    weekendNoLargeStaple: Boolean(entry.weekendNoLargeStaple || entry.carbPortion),
    weekendNoLateSnack: Boolean(entry.weekendNoLateSnack || entry.noLateSnack),
    weekendVegetablesFiber: Boolean(entry.weekendVegetablesFiber || entry.vegetables350 || entry.vegetablesFiber),
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
  const referenceDate = latestEntry()?.date || todayIso();
  const baseWeight = currentBodyWeightKg();
  const daysLeft = daysBetween(referenceDate, state.settings.goalDate);
  if (daysLeft <= 0) return null;
  return ((state.settings.goalWeightKg - baseWeight) / daysLeft) * 7;
}

function forecastGoalDate() {
  const latest = latestEntry();
  const pace = trendPacePerWeek();
  if (!latest || pace === null || pace >= -0.01) return null;
  const remaining = latest.weightKg - state.settings.goalWeightKg;
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
  renderMealCheckSummary();
  renderRoundTimer();
  renderSettings();
}

function renderToday() {
  const selectedWeight = state.weightEntries.find((entry) => entry.date === selectedDate);
  const latestActual = latestEntry();
  const target = state.settings.goalWeightKg;
  const displayWeight = selectedWeight?.weightKg ?? latestActual?.weightKg ?? null;
  const progressWeight = displayWeight ?? state.settings.startWeightKg;
  const bmiBaseWeight = selectedWeight?.weightKg ?? progressWeight;
  const start = state.settings.startWeightKg;
  const totalToLose = Math.max(0.1, start - target);
  const lost = Math.max(0, start - progressWeight);
  const progress = Math.max(0, Math.min(100, (lost / totalToLose) * 100));
  const remaining = Math.max(0, progressWeight - target);
  const forecast = forecastGoalDate();

  setText("#trendWeight", displayWeight !== null ? displayWeight.toFixed(1) : "--.-");
  setText(
    "#trendCaption",
    selectedWeight
      ? `${selectedDate}の実測体重です。`
      : latestActual
        ? `${latestActual.date}の実測体重です。選択日は未記録です。`
        : "実測体重を入力すると表示します。"
  );
  setText("#progressPercent", `${Math.round(progress)}%`);
  setText("#actualWeight", selectedWeight ? `${selectedWeight.weightKg.toFixed(1)} kg` : "--.- kg");
  setText("#remainingWeight", `${remaining.toFixed(1)} kg`);
  setText("#bmiValue", round1(bmi(bmiBaseWeight)).toFixed(1));
  setText("#forecastDate", forecast || "--");

  const ring = document.querySelector("#progressRing");
  ring.style.strokeDashoffset = String(301.59 * (1 - progress / 100));

  document.querySelector("#weightInput").value = selectedWeight ? selectedWeight.weightKg.toFixed(1) : "";
  document.querySelector("#deleteRecord").disabled = !selectedWeight && !hasSelectedCheckData();
  setText("#streakDays", `${streakDays()}日`);
  setText("#monthEntries", `${entriesInMonth(calendarMonth)}回`);

  const checks = getSelectedCheck();
  setExerciseSegment(Boolean(checks.exerciseDone));
  updateFoodBurner();
  setDecisionStamp(document.querySelector("#dailyRank"), dailyDecision(selectedDate));
  renderMealCheckSummary();
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
  const scored = new Map(calendarScoreEntries().map((entry) => [entry.date, entry]));
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
  const baseWeightLabel = latestTrend() ? "トレンド体重基準" : "現在体重基準";
  if (required === null) {
    notice.textContent = "目標と期限を設定すると必要ペースを表示します。";
  } else if (Math.abs(required) > 1.0) {
    notice.textContent = `${baseWeightLabel}で週${Math.abs(required).toFixed(2)}kgの減量ペースが必要です。危険ラインの週1.0kgを超えているため、目標か期限の見直しを推奨します。`;
  } else {
    notice.textContent = `${baseWeightLabel}で週${Math.abs(required).toFixed(2)}kgの減量ペースが目安です。日々の実測ではなくトレンド体重で見ていきます。`;
  }

  drawChart();
  renderWeeklySummary();
}

function earliestActivityDate() {
  const dates = [
    ...state.weightEntries.map((entry) => entry.date),
    ...state.dailyChecks.filter(checkHasData).map((entry) => entry.date),
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
    if (hasRecord || hasCheck) recordedDays += 1;
    results.push(dailyDecision(date));
  }

  const totalDays = results.length;
  const checkedDays = results.filter((entry) => entry.score > 0).length;
  const averageScore = checkedDays
    ? Math.round(results.reduce((sum, entry) => sum + entry.score, 0) / checkedDays)
    : 0;
  const weeklyDecision = weeklyDecisionSummary(results, recordedDays);
  setText("#weeklyRange", `${startIso.replaceAll("-", "/")} - ${latestDate.replaceAll("-", "/")}`);
  setDecisionStamp(document.querySelector("#weeklyRank"), weeklyDecision);

  const comment = document.querySelector("#weeklyComment");
  if (!recordedDays) {
    comment.textContent = "この期間にはまだ評価対象の記録がありません。";
  } else {
    comment.textContent = `直近${totalDays}日で食事チェックは${checkedDays}日、平均${averageScore}点です。${weeklyDecision.reason}`;
  }
}

function renderExercise() {
  ["strength", "bag", "running"].forEach((type) => {
    if (!selectedPlanLevel(type)) setPlanLevel(type, "normal");
  });
  renderWorkoutPlan();
  renderRecordWorkoutPlan();
}

function renderMealCheckSummary() {
  const check = getSelectedCheck();
  const checks = mealChecksForDate(selectedDate);
  const score = mealCheckScore(check, selectedDate);
  const decision = mealCheckDecision(score, mealCheckHasData(check));
  const mode = document.querySelector("#mealCheckMode");
  const scoreEl = document.querySelector("#mealCheckScore");
  const comment = document.querySelector("#mealCheckComment");
  const windowNote = document.querySelector("#mealCheckWindow");
  const groups = document.querySelector("#mealCheckGroups");
  if (!mode || !scoreEl || !comment || !windowNote || !groups) return;

  mode.textContent = mealCheckModeLabel(selectedDate);
  scoreEl.textContent = `${score}点`;
  comment.textContent = decision.reason;
  comment.className = `meal-check-comment ${decisionClass(decision.status)}`;
  windowNote.textContent = isWeekendDate(selectedDate)
    ? "休日: 16時間断食は評価しません。チートを連鎖させず、食べ方の上限を守る日です。"
    : "平日: 12:00以降に食事開始、20:00までに最後の食事・飲み物を終える設計です。";

  const grouped = checks.reduce((map, item) => {
    if (!map.has(item.group)) map.set(item.group, []);
    map.get(item.group).push(item);
    return map;
  }, new Map());

  groups.innerHTML = [...grouped.entries()].map(([group, items]) => {
    const groupScore = items.reduce((sum, item) => sum + (check[item.id] ? item.points : 0), 0);
    const maxScore = items.reduce((sum, item) => sum + item.points, 0);
    return `
      <section class="check-block meal-check-block" aria-label="${escapeHtml(group)}チェック">
        <div class="check-subhead">
          <h3>${escapeHtml(group)}チェック</h3>
          <span class="check-gate">${groupScore}/${maxScore}点</span>
        </div>
        <div class="check-grid meal-check-grid">
          ${items.map((item) => mealCheckItemMarkup(item, Boolean(check[item.id]))).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function mealCheckItemMarkup(item, checked) {
  return `
    <label class="${checked ? "checked" : ""}">
      <input type="checkbox" data-check="${escapeHtml(item.id)}" ${checked ? "checked" : ""}>
      <span class="check-text">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.detail)} / ${item.points}点</small>
      </span>
    </label>
  `;
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
  updateInputValue("#timerWorkMin", Math.floor(settings.workSec / 60));
  updateInputValue("#timerWorkSec", String(settings.workSec % 60).padStart(2, "0"));
  updateInputValue("#timerRestSec", settings.restSec);
  updateInputValue("#timerRounds", settings.rounds);
  updateTimerWheelAria(settings);
  syncWakeLock();
}

function updateInputValue(selector, value) {
  const input = document.querySelector(selector);
  if (!input || document.activeElement === input) return;
  if ("value" in input) input.value = String(value);
  else input.textContent = String(value);
}

function updateTimerWheelAria(settings = currentRoundTimer()) {
  const values = {
    prepSec: settings.prepSec,
    workMin: Math.floor(settings.workSec / 60),
    workSec: settings.workSec % 60,
    restSec: settings.restSec,
    rounds: settings.rounds,
  };
  document.querySelectorAll("[data-timer-wheel]").forEach((wheel) => {
    const key = wheel.dataset.timerWheel;
    const windowEl = wheel.querySelector(".timer-wheel-window");
    if (!windowEl || !(key in values)) return;
    windowEl.setAttribute("aria-valuenow", String(values[key]));
    windowEl.setAttribute("aria-valuetext", key === "workSec" ? `${values[key]}秒` : windowEl.textContent.trim());
  });
}

function timerWheelNextSettings(key, direction) {
  const current = currentRoundTimer();
  const next = { ...current };
  const dir = direction > 0 ? 1 : -1;
  if (key === "prepSec") next.prepSec = clampInt(current.prepSec + (dir * 5), 0, 600, current.prepSec);
  if (key === "restSec") next.restSec = clampInt(current.restSec + (dir * 5), 0, 1800, current.restSec);
  if (key === "rounds") next.rounds = clampInt(current.rounds + dir, 1, 99, current.rounds);
  if (key === "workMin" || key === "workSec") {
    let minutes = Math.floor(current.workSec / 60);
    let seconds = current.workSec % 60;
    if (key === "workMin") minutes = clampInt(minutes + dir, 0, 60, minutes);
    if (key === "workSec") seconds = clampInt(seconds + (dir * 5), 0, 55, seconds);
    next.workSec = clampInt((minutes * 60) + seconds, 1, 3600, current.workSec);
  }
  next.presetId = matchRoundTimerPreset(next);
  return next;
}

function changeTimerWheelValue(key, direction) {
  const current = currentRoundTimer();
  const next = timerWheelNextSettings(key, direction);
  if (
    next.prepSec === current.prepSec
    && next.workSec === current.workSec
    && next.restSec === current.restSec
    && next.rounds === current.rounds
  ) {
    return;
  }
  playTick();
  saveRoundTimerSettings(next);
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
  return CUSTOM_TIMER_PRESET_ID;
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
    .filter((preset) => preset.id !== CUSTOM_TIMER_PRESET_ID)
    .map((preset) => `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`)
    .join("");
  const customOption = settings.presetId === CUSTOM_TIMER_PRESET_ID
    ? `<option value="${CUSTOM_TIMER_PRESET_ID}">カスタム</option>`
    : "";
  return `${builtInOptions}${customOption}`;
}

function roundTimerPresetById(value) {
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

function playTick() {
  try {
    timerAudioContext = timerAudioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (timerAudioContext.state === "suspended") timerAudioContext.resume();
    const ctx = timerAudioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.025);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
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
  const referenceDate = latestEntry()?.date || todayIso();
  const daysLeft = goalDateIso ? daysBetween(referenceDate, goalDateIso) : 0;
  if (daysLeft > 0 && baseWeight > goalKg) {
    const pace = ((baseWeight - goalKg) / daysLeft) * 7;
    if (pace > 1.0) {
      level = "danger";
      messages.push(`この期限だと週 ${pace.toFixed(2)}kg の減量ペースが必要です。危険ラインの週1.0kgを超えているため、目標体重か期限の見直しを推奨します。`);
    } else if (pace > 0.7) {
      if (level !== "danger") level = "caution";
      messages.push(`この期限だと週 ${pace.toFixed(2)}kg の減量ペースが必要です。やや高いペースなので、数週間ごとに進捗を確認しましょう。`);
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
  renderSettingsPacePreview();
  applyGoalNotice(state.settings.heightCm, state.settings.goalWeightKg, state.settings.goalDate);
}

function renderSettingsPacePreview() {
  const current = trendPacePerWeek();
  const required = requiredPacePerWeek();
  setText("#settingsCurrentPace", current === null ? "-- kg/週" : `${round2(current).toFixed(2)} kg/週`);
  setText("#settingsRequiredPace", required === null ? "-- kg/週" : `${round2(required).toFixed(2)} kg/週`);
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
      ...Object.fromEntries([...WEEKDAY_MEAL_CHECKS, ...WEEKEND_MEAL_CHECKS].map((item) => [item.id, false])),
      note: "",
    };
    state.dailyChecks.push(check);
  }
  return check;
}

const CHECK_FIELDS = [
  "exerciseDone",
  ...WEEKDAY_MEAL_CHECKS.map((item) => item.id),
  ...WEEKEND_MEAL_CHECKS.map((item) => item.id),
];
const MEAL_CHECK_FIELDS = [
  ...WEEKDAY_MEAL_CHECKS.map((item) => item.id),
  ...WEEKEND_MEAL_CHECKS.map((item) => item.id),
];

function checkHasData(entry) {
  if (!entry) return false;
  if (entry.note) return true;
  return CHECK_FIELDS.some((field) => entry[field]);
}

function mealCheckHasData(entry) {
  if (!entry) return false;
  return MEAL_CHECK_FIELDS.some((field) => entry[field]);
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
  saveState("食事チェック保存済み");
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
  return mealCheckScore(state.dailyChecks.find((entry) => entry.date === date), date);
}

function isWeekendDate(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function mealChecksForDate(date) {
  return isWeekendDate(date) ? WEEKEND_MEAL_CHECKS : WEEKDAY_MEAL_CHECKS;
}

function mealCheckModeLabel(date) {
  return isWeekendDate(date) ? "休日チェック（断食なし）" : "平日チェック（12:00-20:00）";
}

function mealCheckScore(check, date) {
  if (!check) return 0;
  return mealChecksForDate(date).reduce((sum, item) => sum + (check[item.id] ? item.points : 0), 0);
}

function mealCheckDecision(score, hasData = score > 0) {
  if (!hasData) {
    return { status: "fail", label: "✕", short: "✕", reason: "まだ食事チェックがありません。今日の食べ方だけを1タップで確認します。", score };
  }
  if (score >= 90) {
    return { status: "pass", label: "〇", short: "〇", reason: "強い減量日です。食事側の崩れをかなり抑えられています。", score };
  }
  if (score >= 80) {
    return { status: "pass", label: "〇", short: "〇", reason: "減量日です。食事側は十分に合格です。", score };
  }
  if (score >= 65) {
    return { status: "warn", label: "△", short: "△", reason: "維持〜微減ラインです。明日は主食量、間食、夜の追加摂取のどれか1つを締めましょう。", score };
  }
  if (score >= 50) {
    return { status: "warn", label: "△", short: "△", reason: "弱めの日です。記録はできていますが、減量への寄与は薄めです。", score };
  }
  return { status: "fail", label: "✕", short: "✕", reason: "食事側は崩れの日です。次の食事から1項目だけ戻せば十分です。", score };
}

function decisionClass(status) {
  return `decision-${status}`;
}

function dailyDecision(date) {
  const check = state.dailyChecks.find((entry) => entry.date === date);
  return mealCheckDecision(mealCheckScore(check, date), mealCheckHasData(check));
}

function weeklyDecisionSummary(results, recordedDays) {
  if (!recordedDays) {
    return { status: "fail", label: "✕", short: "✕", reason: "まだ評価対象の記録がありません。" };
  }
  const scored = results.filter((entry) => entry.score > 0);
  if (scored.length < 4) {
    return { status: "warn", label: "△", short: "△", reason: "食事チェックが4日未満です。まずは記録頻度を増やしましょう。" };
  }
  const averageScore = Math.round(scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length);
  if (averageScore >= 80) {
    return { status: "pass", label: "〇", short: "〇", reason: `平均${averageScore}点で、食事側は減量に十分寄っています。` };
  }
  if (averageScore >= 65) {
    return { status: "warn", label: "△", short: "△", reason: `平均${averageScore}点です。維持〜微減ラインなので、夜の追加摂取か主食量を1つ絞りましょう。` };
  }
  return { status: "fail", label: "✕", short: "✕", reason: `平均${averageScore}点です。食事側の崩れが体重トレンドに出やすい状態です。` };
}

function setDecisionStamp(element, decision) {
  if (!element || !decision) return;
  element.textContent = decision.label;
  element.className = `decision-stamp ${decisionClass(decision.status)}${element.id === "dailyRank" ? " small" : ""}`;
}

function calendarScoreEntries() {
  const dates = new Set([
    ...state.weightEntries.map((entry) => entry.date),
    ...state.dailyChecks.filter(mealCheckHasData).map((entry) => entry.date),
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
  return latestEntry()?.weightKg || state.settings.startWeightKg || 78;
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

function setCollapseState(sectionId, collapsed) {
  const body = document.querySelector(`#${sectionId}`);
  const button = document.querySelector(`[data-collapse-toggle="${sectionId}"]`);
  if (!body || !button) return;
  const labels = {
    recordWeightCollapse: "体重記録",
    recordFoodCollapse: "食事チェック",
    recordExerciseCollapse: "運動実績",
  };
  const label = labels[sectionId] || "セクション";
  body.hidden = collapsed;
  button.setAttribute("aria-expanded", collapsed ? "false" : "true");
  button.setAttribute("aria-label", `${label}を${collapsed ? "開く" : "閉じる"}`);
  button.closest(".collapsible-section")?.classList.toggle("is-collapsed", collapsed);
}

function shouldIgnoreCollapseClick(target) {
  return Boolean(target.closest("button, input, select, textarea, a, label, [data-no-collapse-toggle]"));
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

  document.querySelectorAll("[data-collapse-toggle]").forEach((button) => {
    setCollapseState(button.dataset.collapseToggle, button.getAttribute("aria-expanded") !== "true");
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      setCollapseState(button.dataset.collapseToggle, expanded);
    });
  });

  document.querySelectorAll(".collapsible-section").forEach((section) => {
    section.addEventListener("click", (event) => {
      if (shouldIgnoreCollapseClick(event.target)) return;
      const button = section.querySelector("[data-collapse-toggle]");
      if (!button) return;
      const expanded = button.getAttribute("aria-expanded") === "true";
      setCollapseState(button.dataset.collapseToggle, expanded);
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
    renderSettingsPacePreview();
  });

  document.querySelector("#openSettingsView").addEventListener("click", () => setSettingsOpen(true));
  document.querySelector("#closeSettingsView").addEventListener("click", () => setSettingsOpen(false));
  document.querySelector("#settingsOverlay").addEventListener("click", (event) => {
    if (event.target.id === "settingsOverlay") setSettingsOpen(false);
  });

  document.querySelector("#weightInput").addEventListener("input", syncWeightInputFormatting);

  document.querySelector("#recordFoodCollapse")?.addEventListener("change", (event) => {
    if (!event.target.matches("[data-check]")) return;
    saveDailyChecks();
    updateFoodBurner();
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

  document.querySelector("#timerPreset").addEventListener("change", () => {
    playTick();
    applySelectedRoundTimerPreset();
  });

  let timerWheelPointer = null;
  document.querySelector("#timerSettingsModal").addEventListener("click", (event) => {
    const stepButton = event.target.closest("[data-timer-wheel-step]");
    if (!stepButton) return;
    const wheel = stepButton.closest("[data-timer-wheel]");
    if (!wheel) return;
    changeTimerWheelValue(wheel.dataset.timerWheel, Number(stepButton.dataset.timerWheelStep));
  });

  document.querySelector("#timerSettingsModal").addEventListener("pointerdown", (event) => {
    const target = event.target.closest(".timer-wheel-window");
    if (!target) return;
    const wheel = target.closest("[data-timer-wheel]");
    if (!wheel) return;
    timerWheelPointer = {
      pointerId: event.pointerId,
      key: wheel.dataset.timerWheel,
      x: event.clientX,
      y: event.clientY,
    };
    target.setPointerCapture?.(event.pointerId);
  });

  document.querySelector("#timerSettingsModal").addEventListener("pointerup", (event) => {
    if (!timerWheelPointer || timerWheelPointer.pointerId !== event.pointerId) return;
    const dx = event.clientX - timerWheelPointer.x;
    const dy = event.clientY - timerWheelPointer.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) >= 14) {
      const direction = absY >= absX ? (dy < 0 ? 1 : -1) : (dx < 0 ? 1 : -1);
      changeTimerWheelValue(timerWheelPointer.key, direction);
    }
    timerWheelPointer = null;
  });

  document.querySelector("#timerSettingsModal").addEventListener("pointercancel", () => {
    timerWheelPointer = null;
  });

  document.querySelector("#timerSettingsModal").addEventListener("keydown", (event) => {
    const target = event.target.closest(".timer-wheel-window");
    if (!target) return;
    const wheel = target.closest("[data-timer-wheel]");
    if (!wheel) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1;
    changeTimerWheelValue(wheel.dataset.timerWheel, direction);
  });

  document.querySelectorAll(".timer-wheel-window").forEach((windowEl) => {
    windowEl.addEventListener("wheel", (event) => {
      const wheel = windowEl.closest("[data-timer-wheel]");
      if (!wheel) return;
      event.preventDefault();
      changeTimerWheelValue(wheel.dataset.timerWheel, event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  });

  document.querySelector("#exerciseSegment").addEventListener("click", (event) => {
    const button = event.target.closest("[data-exercise]");
    if (!button) return;
    playTick();
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
  const burner = document.querySelector("#fatBurner");
  if (!burner) return;
  const check = state.dailyChecks.find((entry) => entry.date === selectedDate);
  const score = mealCheckScore(check, selectedDate);
  const level = score === 0 ? 0 : Math.min(20, Math.ceil(score / 5));
  burner.className = `fat-burner heat-${level}`;
  const text = document.querySelector("#fatBurnText");
  if (!text) return;
  const decision = mealCheckDecision(score, mealCheckHasData(check));
  text.textContent = `${mealCheckModeLabel(selectedDate)}: ${score}点。${decision.reason}`;
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
preloadGong();
