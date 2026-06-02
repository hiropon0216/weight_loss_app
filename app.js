const STORE_KEY = "weightTracker:v1";
const BACKUP_STORE_KEY = "weightTracker:v1:backup";
const ALPHA = 0.25;
const MS_PER_DAY = 86400000;
const WEEKLY_BOSS_HP = 2000;

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
};

let state = loadState();
let selectedDate = todayIso();
let calendarMonth = selectedDate.slice(0, 7);
let saveStatusTimer = null;
let settingsFeedbackTimer = null;
let workoutFeedbackTimer = null;

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
  const latest = latestTrend();
  if (!latest) return null;
  const daysLeft = daysBetween(latest.date, state.settings.goalDate);
  if (daysLeft <= 0) return null;
  return ((state.settings.goalWeightKg - latest.trendKg) / daysLeft) * 7;
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

  document.querySelector("#weightInput").value = selectedWeight ? selectedWeight.weightKg : "";
  document.querySelector("#deleteRecord").disabled = !selectedWeight && !hasSelectedCheckData();
  setText("#streakDays", `${streakDays()}日`);
  setText("#monthEntries", `${entriesInMonth(calendarMonth)}回`);

  const checks = getSelectedCheck();
  setExerciseSegment(Boolean(checks.exerciseDone));
  document.querySelectorAll("[data-check]").forEach((input) => {
    input.checked = Boolean(checks[input.dataset.check]);
  });
  updateFoodBurner();
  document.querySelector("#dailyNote").value = checks.note || "";
  setRankBadge(document.querySelector("#dailyRank"), dailyRank(selectedDate));
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
    const rank = scored.get(iso);
    const badge = rank ? `<span class="score-badge ${rankClass(rank)}">${rank}</span>` : "";
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
  if (required === null) {
    notice.textContent = "目標と期限を設定すると必要ペースを表示します。";
  } else if (Math.abs(required) > 0.9) {
    notice.textContent = "期限達成に必要な減量ペースが週0.9kgを超えています。かなり速いペースです。";
  } else {
    notice.textContent = "必要ペースはゆるやかな範囲です。日々の実測ではなくトレンド体重で見ていきます。";
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

  const scores = [];
  let recordedDays = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = toIsoDate(cursor);
    const hasRecord = state.weightEntries.some((entry) => entry.date === date);
    const hasCheck = state.dailyChecks.some((entry) => entry.date === date && checkHasData(entry));
    if (hasRecord || hasCheck) recordedDays += 1;
    // 未記録日も0点として母数に含める（「記録した日だけ平均」で水増しされる逆インセンティブの防止）
    scores.push(dailyScore(date));
  }

  const totalDays = scores.length;
  const avgScore = totalDays ? average(scores) : 0;
  const rank = rankFromScore(avgScore);
  setText("#weeklyRange", `${startIso.replaceAll("-", "/")} - ${latestDate.replaceAll("-", "/")}`);
  setRankBadge(document.querySelector("#weeklyRank"), recordedDays ? rank : "D");

  const comment = document.querySelector("#weeklyComment");
  if (!recordedDays) {
    comment.textContent = "この期間にはまだ評価対象の記録がありません。";
  } else {
    comment.textContent = `直近${totalDays}日中${recordedDays}日を記録。未記録日も0点として平均${Math.round(avgScore)}点・${rank}評価です。`;
  }
}

function renderExercise() {
  ["strength", "bag", "running"].forEach((type) => {
    if (!selectedPlanLevel(type)) setPlanLevel(type, "normal");
  });
  renderStrengthFocusControls();
  renderWorkoutPlan();
  renderRecordWorkoutPlan();
}

function renderStrengthFocusControls() {
  // 日付が変わったら手動上書きをリセットし、自動ローテーションに戻す
  if (strengthFocusDate !== selectedDate) {
    strengthRegionOverride = null;
    strengthEquipmentOverride = null;
    strengthFocusDate = selectedDate;
  }
  const focus = resolveStrengthFocus(selectedDate);
  document.querySelectorAll("[data-strength-region]").forEach((button) => {
    button.classList.toggle("active", button.dataset.strengthRegion === focus.region);
  });
  document.querySelectorAll("[data-strength-equipment]").forEach((button) => {
    button.classList.toggle("active", button.dataset.strengthEquipment === focus.equipment);
  });
  const label = document.querySelector("#strengthFocusLabel");
  if (label) {
    label.textContent = `${focus.isAuto ? "今回の自動提案" : "手動設定"}：${strengthFocusLabel(focus.region, focus.equipment)}`;
  }
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
  const daysLeft = goalDateIso ? daysBetween(todayIso(), goalDateIso) : 0;
  if (daysLeft > 0 && baseWeight > goalKg) {
    const pace = ((baseWeight - goalKg) / daysLeft) * 7;
    if (pace > 0.9) {
      if (level !== "danger") level = "caution";
      messages.push(`この期限だと週 ${pace.toFixed(2)}kg の減量が必要で、安全な目安（週0.9kgまで）を超えています。期限を延ばすか目標を見直しましょう。`);
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
  document.querySelector("#startWeight").value = state.settings.startWeightKg;
  document.querySelector("#goalWeight").value = state.settings.goalWeightKg;
  document.querySelector("#goalDate").value = state.settings.goalDate;
  setText("#bmi25Weight", `${round1(weightForBmi(25)).toFixed(1)} kg`);
  setText("#bmi22Weight", `${round1(weightForBmi(22)).toFixed(1)} kg`);
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
  check.exerciseDone = document.querySelector("[data-exercise='true']").classList.contains("active");
  document.querySelectorAll("[data-check]").forEach((input) => {
    check[input.dataset.check] = input.checked;
  });
  check.note = document.querySelector("#dailyNote").value.trim();
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
  let score = 0;
  if (check?.noSweets) score += 18;
  if (check?.noJuiceAlcohol) score += 17;
  if (check?.carbPortion) score += 15;
  if (check?.noFried) score += 14;
  if (check?.protein100) score += 8;
  if (check?.noLateSnack) score += 4;
  if (check?.vegetables350) score += 3;
  if (check?.water1500) score += 3;
  return score;
}

function currentUiScore() {
  const check = {
    exerciseDone: document.querySelector("[data-exercise='true']")?.classList.contains("active") || false,
  };
  document.querySelectorAll("[data-check]").forEach((input) => {
    check[input.dataset.check] = input.checked;
  });
  const score = scoreFromCheck(check) + exerciseScore(selectedDate, check);
  return Math.max(0, Math.min(100, score));
}

function exerciseScore(date, check) {
  if (!check?.exerciseDone) return 0;
  const plan = getWorkoutPlanForDate(date);
  if (!plan?.items?.length) return 9;
  const kcal = workoutPlanKcal(plan);
  if (kcal <= 0) return 9;
  return Math.max(6, Math.min(18, Math.round(Math.sqrt(kcal) * 0.48)));
}

function dailyRank(date) {
  return rankFromScore(dailyScore(date));
}

function rankFromScore(score) {
  if (score >= 92) return "S";
  if (score >= 82) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

function rankClass(rank) {
  return `rank-${rank.toLowerCase()}`;
}

function setRankBadge(element, rank) {
  element.textContent = rank;
  element.className = `rank-badge ${rankClass(rank)}`;
}

function calendarScoreEntries() {
  const dates = new Set([
    ...state.weightEntries.map((entry) => entry.date),
    ...state.dailyChecks.filter(checkHasData).map((entry) => entry.date),
  ]);
  return [...dates].map((date) => ({ date, score: dailyScore(date), rank: dailyRank(date) })).filter((entry) => entry.score > 0);
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
const STRENGTH_ROTATION = [
  { region: "upper", equipment: "bodyweight" },
  { region: "lower", equipment: "dumbbell" },
  { region: "upper", equipment: "dumbbell" },
  { region: "lower", equipment: "bodyweight" },
];
const STRENGTH_COUNT_BY_LEVEL = { soft: 4, normal: 5, hard: 6 };
const STRENGTH_SETS = { main: { soft: 3, normal: 3, hard: 4 }, core: { soft: 2, normal: 2, hard: 3 } };

let strengthRegionOverride = null;
let strengthEquipmentOverride = null;
let strengthFocusDate = null;

function strengthFocusLabel(region, equipment) {
  return `${region === "upper" ? "上半身" : "下半身"} × ${equipment === "dumbbell" ? "ダンベル" : "自重"}`;
}

function strengthRotationFor(date) {
  const last = (state.workoutHistory || [])
    .filter((entry) => entry.date < date && entry.region && entry.equipment)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return STRENGTH_ROTATION[0];
  const lastIdx = STRENGTH_ROTATION.findIndex((c) => c.region === last.region && c.equipment === last.equipment);
  return STRENGTH_ROTATION[(Math.max(0, lastIdx) + 1) % STRENGTH_ROTATION.length];
}

function resolveStrengthFocus(date) {
  const auto = strengthRotationFor(date);
  return {
    region: strengthRegionOverride || auto.region,
    equipment: strengthEquipmentOverride || auto.equipment,
    isAuto: !strengthRegionOverride && !strengthEquipmentOverride,
  };
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

function strengthCandidatePool(region, equipment) {
  return STRENGTH_EXERCISES.filter((ex) => {
    if (ex.pattern === "core") return true; // コアは常に候補（自重）
    if (ex.region !== region) return false;
    if (equipment === "bodyweight") return ex.equipment === "bodyweight";
    return true; // ダンベル日は両方候補（自重はスコアで減点しつつ、カーフ等の補完に使う）
  });
}

function pickStrengthExercises(region, equipment, count) {
  const template = STRENGTH_TEMPLATES[region] || STRENGTH_TEMPLATES.upper;
  const slots = [...template.required, ...template.fill].slice(0, count);
  const recent = strengthMuscleLoad(7);
  const prevIds = latestStrengthHistoryIds();
  const pool = strengthCandidatePool(region, equipment);
  const usedIds = new Set();
  const chosen = [];
  const scoreOf = (ex) =>
    -(recent[ex.muscle] || 0) * 2          // 直近で多く使った筋群は減点（手薄を優先）
    - (prevIds.has(ex.id) ? 3 : 0)         // 前日と同一種目は回避
    + (equipment === "dumbbell" && ex.equipment === "bodyweight" && ex.pattern !== "core" ? -10 : 0) // ダンベル日はダンベル優先
    + Math.random();                       // 同点はランダム
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
  }
  return chosen;
}

function formatStrengthStep(ex, level) {
  const sets = (STRENGTH_SETS[ex.kind] || STRENGTH_SETS.main)[level];
  return { id: ex.id, muscle: ex.muscle, url: ex.url || "", text: `${ex.name} ${ex.rep} × ${sets}セット` };
}

function buildStrengthSteps(level, focus) {
  const count = STRENGTH_COUNT_BY_LEVEL[level] || 5;
  return pickStrengthExercises(focus.region, focus.equipment, count).map((ex) => formatStrengthStep(ex, level));
}

function buildWorkoutPlan() {
  const labels = { strength: "筋トレ", bag: "サンドバッグ", running: "ランニング" };
  const strengthFocus = resolveStrengthFocus(selectedDate);
  const strengthMinutes = { soft: "15分", normal: "30分", hard: "1時間" };
  const buildStrengthMenu = (level) => ({
    target: `${strengthMinutes[level]}・休憩60〜75秒`,
    region: strengthFocus.region,
    equipment: strengthFocus.equipment,
    steps: buildStrengthSteps(level, strengthFocus),
  });
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
      equipment: strength.equipment || null,
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
    ? "今週の燃焼目標を達成しました。ここから先の運動は上積みです。"
    : `今週の目標まであと${burn.remaining}kcalです。`;

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
          <strong>残り ${burn.remaining} kcal</strong>
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
      <p>${escapeHtml(burnMessage)} 今週の累計燃焼は${burn.total}kcalです。</p>
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
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function upsertWeight(date, weightKg) {
  const existing = state.weightEntries.find((entry) => entry.date === date);
  if (existing) existing.weightKg = weightKg;
  else state.weightEntries.push({ date, weightKg });
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#view-${tab.dataset.view}`).classList.add("active");
      drawChart();
    });
  });

  document.querySelector("#weightForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveRecord();
  });

  document.querySelector("#saveRecord").addEventListener("click", saveRecord);

  function saveRecord() {
    const weightValue = Number(document.querySelector("#weightInput").value);
    if (weightValue) {
      upsertWeight(selectedDate, weightValue);
    }
    const check = getSelectedCheck();
    check.exerciseDone = document.querySelector("[data-exercise='true']").classList.contains("active");
    document.querySelectorAll("[data-check]").forEach((input) => {
      check[input.dataset.check] = input.checked;
    });
    check.note = document.querySelector("#dailyNote").value.trim();
    saveState();
    render();
    showResultModal();
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
  });

  document.querySelector("#dailyChecks").addEventListener("change", (event) => {
    const input = event.target.closest("[data-check]");
    if (!input) return;
    updateFoodBurner();
    if (input.checked) launchFoodBurn();
  });

  document.querySelector("#weightInput").addEventListener("input", updateFoodBurner);

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

  document.querySelector("#strengthFocus")?.addEventListener("click", (event) => {
    const regionButton = event.target.closest("[data-strength-region]");
    const equipButton = event.target.closest("[data-strength-equipment]");
    if (!regionButton && !equipButton) return;
    if (regionButton) strengthRegionOverride = regionButton.dataset.strengthRegion;
    if (equipButton) strengthEquipmentOverride = equipButton.dataset.strengthEquipment;
    strengthFocusDate = selectedDate; // 手動操作を保持（リセットさせない）
    renderStrengthFocusControls();
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
  const inputs = [...document.querySelectorAll("[data-check]")];
  const checked = inputs.filter((input) => input.checked).length;
  inputs.forEach((input) => input.closest("label")?.classList.toggle("checked", input.checked));
  const exerciseDone = document.querySelector("[data-exercise='true']")?.classList.contains("active") || false;

  const burner = document.querySelector("#fatBurner");
  if (!burner) return;
  const score = currentUiScore();
  const level = score === 0 ? 0 : Math.min(10, Math.ceil(score / 10));
  burner.className = `fat-burner heat-${level}`;
  const text = document.querySelector("#fatBurnText");
  if (!text) return;
  const messages = [
    "0点です。まだ火はついていません。まずはたんぱく質か21時以降の食事なしを記録してください。",
    "1〜10点です。火はつきかけていますが、減量に効く行動としてはまだ弱いです。",
    "11〜20点です。火種はありますが、記録だけで満足せず、食事の軸を整えてください。",
    "21〜30点です。弱火で燃えています。お菓子、ジュース、主食量のどこかを見直してください。",
    "31〜40点です。火力はまだ弱いです。脂肪を落とす日としては、食事の締まりが足りません。",
    "41〜50点です。中火に届きそうです。最低限はできていますが、運動かたんぱく質を足してください。",
    "51〜60点です。中火で燃えています。悪くはありませんが、減量を進めるにはもう一押し必要です。",
    "61〜70点です。しっかり燃えています。食事の土台はできていますが、A評価にはまだ届きません。",
    "71〜80点です。強い火力で燃えています。間食、夜食、運動の詰め方で評価が大きく変わります。",
    "81〜90点です。高火力で燃えています。減量向きの一日ですが、S評価には小さな抜けも許されません。",
    "91〜100点です。最大火力で燃えています。脂肪を落とす条件が高い水準でそろっています。",
  ];
  text.textContent = `${score}点・食事 ${checked}/${inputs.length}・運動 ${exerciseDone ? "実施" : "休養"} / ${messages[level]}`;
}

function launchFoodBurn() {
  const burner = document.querySelector("#fatBurner");
  if (!burner) return;
  burner.classList.remove("burst");
  requestAnimationFrame(() => burner.classList.add("burst"));
  setTimeout(() => burner.classList.remove("burst"), 560);
}

function showResultModal() {
  const rank = dailyRank(selectedDate);
  setRankBadge(document.querySelector("#resultRank"), rank);
  const messages = {
    S: "完璧に近い日です。こういう日を増やせば、体はちゃんと変わります。",
    A: "かなり良い記録です。減量に必要な行動が揃っています。",
    B: "良い積み上げです。無理なく続けるには十分強い一日です。",
    C: "最低限の土台は作れています。次は運動か食事チェックを1つ足しましょう。",
    D: "記録しただけで前進です。次は体重か行動を1つ残せばOKです。",
  };
  setText("#resultTitle", `${rank}ランク`);
  setText("#resultMessage", messages[rank]);
  const modal = document.querySelector("#resultModal");
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  if (rank === "S" || rank === "A") {
    launchConfetti();
  } else if (rank === "D") {
    launchGloom();
  }
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
