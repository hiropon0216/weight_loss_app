const STORE_KEY = "weightTracker:v1";
const BACKUP_STORE_KEY = "weightTracker:v1:backup";
const ALPHA = 0.25;
const MS_PER_DAY = 86400000;

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
    goalWeightKg: 70,
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
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved?.settings || {}) },
    weightEntries: Array.isArray(saved?.weightEntries) ? saved.weightEntries : [],
    exerciseLogs: Array.isArray(saved?.exerciseLogs) ? saved.exerciseLogs : [],
    dailyChecks: Array.isArray(saved?.dailyChecks) ? saved.dailyChecks : [],
    workoutPlans: Array.isArray(saved?.workoutPlans) ? saved.workoutPlans : [],
    workoutHistory: Array.isArray(saved?.workoutHistory) ? saved.workoutHistory : [],
    workoutPlan: saved?.workoutPlan || null,
  };
}

function saveState() {
  const current = localStorage.getItem(STORE_KEY);
  if (current) localStorage.setItem(BACKUP_STORE_KEY, current);
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  const status = document.querySelector("#saveStatus");
  status.textContent = "保存済み";
  setTimeout(() => { status.textContent = "端末内保存"; }, 1200);
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
  const mondayIso = monday.toISOString().slice(0, 10);
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
  return d.toISOString().slice(0, 10);
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

function renderWeeklySummary() {
  const entries = sortedWeights();
  const latestDate = entries.at(-1)?.date || todayIso();
  const end = new Date(`${latestDate}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const startIso = toIsoDate(start);
  const rangeEntries = entries.filter((entry) => entry.date >= startIso && entry.date <= latestDate);
  const scores = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = toIsoDate(cursor);
    const hasRecord = state.weightEntries.some((entry) => entry.date === date);
    const hasCheck = state.dailyChecks.some((entry) =>
        entry.date === date && (
        entry.exerciseDone || entry.meal80 || entry.protein100 || entry.vegetables350 || entry.carbPortion || entry.noFried ||
        entry.snackUnder200 || entry.noJuiceAlcohol || entry.noLateSnack || entry.noSweets || entry.water1500 || entry.note
      )
    );
    if (hasRecord || hasCheck) scores.push(dailyScore(date));
  }

  const avgScore = scores.length ? average(scores) : 0;
  const rank = rankFromScore(avgScore);
  setText("#weeklyRange", `${startIso.replaceAll("-", "/")} - ${latestDate.replaceAll("-", "/")}`);
  setRankBadge(document.querySelector("#weeklyRank"), scores.length ? rank : "D");

  const comment = document.querySelector("#weeklyComment");
  if (!scores.length) {
    comment.textContent = "この期間にはまだ評価対象の記録がありません。";
  } else {
    comment.textContent = `${scores.length}日分の記録から算出。平均${Math.round(avgScore)}点相当の${rank}評価です。`;
  }
}

function renderExercise() {
  ["strength", "bag", "running"].forEach((type) => {
    if (!selectedPlanLevel(type)) setPlanLevel(type, "normal");
  });
  renderWorkoutPlan();
  renderRecordWorkoutPlan();
}

function renderSettings() {
  document.querySelector("#heightCm").value = state.settings.heightCm;
  document.querySelector("#startWeight").value = state.settings.startWeightKg;
  document.querySelector("#goalWeight").value = state.settings.goalWeightKg;
  document.querySelector("#goalDate").value = state.settings.goalDate;
  setText("#bmi25Weight", `${round1(weightForBmi(25)).toFixed(1)} kg`);
  setText("#bmi22Weight", `${round1(weightForBmi(22)).toFixed(1)} kg`);
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
      meal80: false,
      protein100: false,
      vegetables350: false,
      carbPortion: false,
      noFried: false,
      snackUnder200: false,
      noJuiceAlcohol: false,
      noLateSnack: false,
      noSweets: false,
      water1500: false,
      note: "",
    };
    state.dailyChecks.push(check);
  }
  return check;
}

function hasSelectedCheckData() {
  const check = state.dailyChecks.find((entry) => entry.date === selectedDate);
  return Boolean(check && (
    check.exerciseDone || check.meal80 || check.protein100 || check.vegetables350 || check.carbPortion || check.noFried ||
    check.snackUnder200 || check.noJuiceAlcohol || check.noLateSnack || check.noSweets || check.water1500 || check.note
  ));
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
  let count = 0;
  while (recorded.has(toIsoDate(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function dailyScore(date) {
  const hasWeight = state.weightEntries.some((entry) => entry.date === date);
  const check = state.dailyChecks.find((entry) => entry.date === date);
  let score = scoreFromCheck(check, hasWeight);
  score += exerciseScore(date, check);
  score = Math.max(0, score);
  return Math.min(100, score);
}

function scoreFromCheck(check, hasWeight) {
  let score = hasWeight ? 3 : 0;
  if (check?.meal80) score += 14;
  if (check?.protein100) score += 12;
  if (check?.vegetables350) score += 8;
  if (check?.carbPortion) score += 10;
  if (check?.noFried) score += 7;
  if (check?.snackUnder200) score += 5;
  if (check?.noJuiceAlcohol) score += 7;
  if (check?.noLateSnack) score += 4;
  if (check?.noSweets) score += 8;
  if (check?.water1500) score += 4;
  return score;
}

function currentUiScore() {
  const check = {
    exerciseDone: document.querySelector("[data-exercise='true']")?.classList.contains("active") || false,
  };
  document.querySelectorAll("[data-check]").forEach((input) => {
    check[input.dataset.check] = input.checked;
  });
  const hasWeight = Boolean(Number(document.querySelector("#weightInput")?.value)) ||
    state.weightEntries.some((entry) => entry.date === selectedDate);
  const score = scoreFromCheck(check, hasWeight) + exerciseScore(selectedDate, check);
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
    ...state.dailyChecks
      .filter((entry) =>
        entry.exerciseDone || entry.meal80 || entry.protein100 || entry.vegetables350 || entry.carbPortion || entry.noFried ||
        entry.snackUnder200 || entry.noJuiceAlcohol || entry.noLateSnack || entry.noSweets || entry.water1500 || entry.note
      )
      .map((entry) => entry.date),
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

function buildWorkoutPlan() {
  const labels = { strength: "筋トレ", bag: "サンドバッグ", running: "ランニング" };
  const strengthPools = {
    core: [
      { id: "plank", text: "自重・腹筋: プランク 45秒", url: "https://melos.media/training/46433/" },
      { id: "side-plank", text: "自重・腹筋: サイドプランク 30秒/側", url: "https://melos.media/training/64419/2/" },
      { id: "crunch", text: "自重・腹筋: クランチ 15回", url: "https://melos.media/training/210369/" },
      { id: "leg-raise", text: "自重・腹筋: レッグレイズ 12回", url: "https://www.shopjapan.co.jp/diet_labo/training/article_023/" },
      { id: "dead-bug", text: "自重・腹筋: デッドバグ 10回/側", url: "https://fily.jp/articles/2000" },
      { id: "mountain-climber", text: "自重・腹筋: マウンテンクライマー 30秒", url: "https://ufit.co.jp/blogs/training/mountain-climber" },
      { id: "reverse-crunch", text: "自重・腹筋: リバースクランチ 12回", url: "https://melos.media/training/151743/" },
      { id: "bicycle-crunch", text: "自重・腹筋: バイシクルクランチ 20回", url: "https://melos.media/training/151743/" },
      { id: "hollow-hold", text: "自重・腹筋: ホローホールド 30秒", url: "https://melos.media/training/151743/" },
      { id: "plank-shoulder-tap", text: "自重・腹筋: プランクショルダータップ 20回", url: "https://note.com/guest_iwasawa/n/n3157d31073b2" },
      { id: "heel-touch", text: "自重・腹筋: ヒールタッチ 20回", url: "https://melos.media/training/151743/" },
      { id: "russian-twist", text: "自重・腹筋: ロシアンツイスト 20回", url: "https://ufit.co.jp/blogs/training/russian-twist" },
    ],
    bodyweight: [
      { id: "squat", text: "自重: スクワット 15回", url: "https://fily.jp/articles/1345" },
      { id: "push-up", text: "自重: 腕立て伏せ 10回", url: "https://melos.media/training/29627/" },
      { id: "knee-push-up", text: "自重: 膝つき腕立て伏せ 12回", url: "https://melos.media/training/156017/" },
      { id: "hip-lift", text: "自重: ヒップリフト 15回", url: "https://melos.media/training/60969/" },
      { id: "back-lunge", text: "自重: バックランジ 10回/脚", url: "https://melos.media/training/272277/2/" },
      { id: "bird-dog", text: "自重: バードドッグ 10回/側", url: "https://www.nike.com/jp/a/bird-dog-exercise/" },
      { id: "split-squat", text: "自重: スプリットスクワット 10回/脚", url: "https://qitano.com/split-squat" },
      { id: "burpee", text: "自重: バーピー 8回", url: "https://melos.media/training/32012/" },
      { id: "calf-raise", text: "自重: カーフレイズ 20回", url: "https://fily.jp/articles/4835" },
      { id: "pike-push-up", text: "自重: パイクプッシュアップ 8回", url: "https://melos.media/training/184478/" },
    ],
    dumbbell: [
      { id: "goblet-squat", text: "ダンベル: ゴブレットスクワット 12回", url: "https://www.kintore-hack.com/how-to-goblet-squat/" },
      { id: "db-rdl", text: "ダンベル: ルーマニアンデッドリフト 10回", url: "https://fibe.jp/faq/romanian-deadlift-dumbbell/" },
      { id: "floor-press", text: "ダンベル: フロアプレス 10回", url: "https://vokka.jp/17340/" },
      { id: "one-arm-row", text: "ダンベル: ワンハンドロー 12回/側", url: "https://sports.yahoo.co.jp/column/detail/2024071200022-spnavido" },
      { id: "shoulder-press", text: "ダンベル: ショルダープレス 10回", url: "https://belegend.jp/article/communication/9594/" },
      { id: "db-curl", text: "ダンベル: ダンベルカール 12回", url: "https://fily.jp/articles/2285" },
      { id: "db-side-bend", text: "ダンベル: サイドベント 12回/側", url: "https://melos.media/training/151743/" },
      { id: "db-hip-lift", text: "ダンベル: ヒップリフト 15回", url: "https://melos.media/training/60969/" },
      { id: "db-lunge", text: "ダンベル: ランジ 10回/脚", url: "https://qitano.com/dumbbell-lunge" },
      { id: "db-deadlift", text: "ダンベル: デッドリフト 10回", url: "https://power-hacks.com/dumbbell-deadlift/" },
      { id: "db-thruster", text: "ダンベル: スラスター 10回", url: "https://fitwill.app/ja/exercise/2968/dumbbell-thruster/" },
      { id: "db-reverse-fly", text: "ダンベル: リバースフライ 12回", url: "https://fily.jp/articles/3555" },
    ],
  };
  const strengthCounts = {
    soft: { core: 2, bodyweight: 1, dumbbell: 2, rounds: 2 },
    normal: { core: 3, bodyweight: 2, dumbbell: 3, rounds: 3 },
    hard: { core: 4, bodyweight: 2, dumbbell: 4, rounds: 4 },
  };
  const menus = {
    strength: {
      soft: { target: "15分", steps: buildStrengthSteps("soft", strengthPools, strengthCounts) },
      normal: { target: "30分", steps: buildStrengthSteps("normal", strengthPools, strengthCounts) },
      hard: { target: "1時間", steps: buildStrengthSteps("hard", strengthPools, strengthCounts) },
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

function buildStrengthSteps(level, pools, countsByLevel) {
  const config = countsByLevel[level];
  const previousIds = latestStrengthHistoryIds();
  const steps = [
    ...pickWorkoutSteps(pools.core, config.core, previousIds),
    ...pickWorkoutSteps(pools.bodyweight, config.bodyweight, previousIds),
    ...pickWorkoutSteps(pools.dumbbell, config.dumbbell, previousIds),
  ];
  return steps.map((step) => ({ ...step, text: `${step.text} x ${config.rounds}` }));
}

function latestStrengthHistoryIds() {
  return new Set(
    [...(state.workoutHistory || [])]
      .filter((entry) => entry.date < selectedDate && entry.strengthStepIds?.length)
      .sort((a, b) => b.date.localeCompare(a.date))
      .at(0)?.strengthStepIds || []
  );
}

function pickWorkoutSteps(pool, count, previousIds) {
  const fresh = shuffle(pool.filter((step) => !previousIds.has(step.id)));
  const fallback = shuffle(pool.filter((step) => previousIds.has(step.id)));
  return [...fresh, ...fallback].slice(0, count);
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function rememberWorkoutPlan(plan) {
  const strength = plan.items.find((item) => item.type === "strength");
  if (!strength) return;
  state.workoutHistory = [
    ...(state.workoutHistory || []).filter((entry) => entry.date !== plan.date),
    { date: plan.date, strengthStepIds: strength.steps.map((step) => step.id).filter(Boolean) },
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
}

function renderPlanInto(selector, plan = state.workoutPlan) {
  const container = document.querySelector(selector);
  if (!container) return;
  if (!plan) {
    container.innerHTML = "";
    return;
  }
  if (!plan.items.length) {
    container.innerHTML = `<p>実施する種目をONにすると、ここにメニューが出ます。</p>`;
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
  return `<li>${escapeHtml(step.text)} <a href="${escapeHtml(step.url)}" target="_blank" rel="noopener">参考</a></li>`;
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
    saveState();
    render();
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

  document.querySelector("#generateWorkout").addEventListener("click", () => {
    const plan = buildWorkoutPlan();
    upsertWorkoutPlan(plan);
    rememberWorkoutPlan(plan);
    saveState();
    renderWorkoutPlan();
    renderRecordWorkoutPlan();
    updateFoodBurner();
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
    "0点です。まだ火はついていません。まずは腹八分か水分補給を記録してください。",
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
