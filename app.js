const STORE_KEY = "weightTracker:v1";
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
};

let state = loadState();
let selectedDate = todayIso();
let calendarMonth = selectedDate.slice(0, 7);

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
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
        entry.exerciseDone || entry.protein100 || entry.vegetables350 || entry.carbPortion || entry.noFried ||
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
  ["running", "strength", "bag"].forEach((type) => {
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
    check.exerciseDone || check.protein100 || check.vegetables350 || check.carbPortion || check.noFried ||
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
  let score = hasWeight ? 20 : 0;
  if (check?.exerciseDone) score += 20;
  if (check?.protein100) score += 18;
  if (check?.vegetables350) score += 12;
  if (check?.carbPortion) score += 10;
  if (check?.noFried) score += 5;
  if (check?.snackUnder200) score += 5;
  if (check?.noJuiceAlcohol) score += 3;
  if (check?.noLateSnack) score += 2;
  if (check?.noSweets) score += 3;
  if (check?.water1500) score += 2;
  score = Math.max(0, score);
  return Math.min(100, score);
}

function dailyRank(date) {
  return rankFromScore(dailyScore(date));
}

function rankFromScore(score) {
  if (score >= 90) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
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
        entry.exerciseDone || entry.protein100 || entry.vegetables350 || entry.carbPortion || entry.noFried ||
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
  const labels = { running: "ランニング", strength: "筋トレ", bag: "サンドバッグ" };
  const menus = {
    running: {
      soft: { target: "5km", steps: ["5kmイージーラン", "最後に流し20秒 x 3本"] },
      normal: { target: "10km", steps: ["10kmジョグ", "中盤に1分やや速め x 5本"] },
      hard: { target: "20km", steps: ["20kmロング走", "後半は会話できるペースを維持", "5分クールダウン"] },
    },
    strength: {
      soft: { target: "15分目安", steps: ["ダンベルスクワット 10回 x 2", "床プレス 10回 x 2", "ワンハンドロー 10回 x 2"] },
      normal: { target: "30分", steps: ["ゴブレットスクワット 12回 x 4", "床プレス 10回 x 4", "ワンハンドロー 12回 x 4", "プランク45秒 x 3"] },
      hard: { target: "1時間", steps: ["ブルガリアンスクワット 10回 x 4/脚", "床プレス 12回 x 5", "ワンハンドロー 12回 x 5", "スクワットジャンプ 12回 x 3"] },
    },
    bag: {
      soft: { target: "20分", steps: ["2分 x 6R", "フォーム重視、R間休憩60秒"] },
      normal: { target: "40分", steps: ["3分 x 8R", "各R最後30秒だけ手数アップ", "R間休憩60秒"] },
      hard: { target: "1時間", steps: ["3分 x 12R", "偶数R最後30秒ラッシュ", "R間休憩45秒"] },
    },
  };

  const items = Object.keys(labels)
    .filter((type) => document.querySelector(`[data-plan-enabled="${type}"]`)?.checked)
    .map((type) => {
      const level = selectedPlanLevel(type) || "normal";
      return { type, label: labels[type], level, ...menus[type][level] };
    });

  return { date: selectedDate, items };
}

function renderPlanInto(selector) {
  const container = document.querySelector(selector);
  if (!container) return;
  const plan = state.workoutPlan;
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
        <strong>${item.label}<span>${levelLabel(item.level)} / ${escapeHtml(item.target)}</span></strong>
        <ul>${item.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
      </article>
    `).join("")}
  `;
}

function renderWorkoutPlan() {
  renderPlanInto("#exerciseGeneratedMenu");
}

function renderRecordWorkoutPlan() {
  if (state.workoutPlan?.date !== selectedDate) {
    const container = document.querySelector("#recordGeneratedMenu");
    if (container) container.innerHTML = "";
    return;
  }
  renderPlanInto("#recordGeneratedMenu");
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

  document.querySelector("#exercisePlanner").addEventListener("click", (event) => {
    const button = event.target.closest("[data-plan-level]");
    if (!button) return;
    const [type, level] = button.dataset.planLevel.split(":");
    setPlanLevel(type, level);
  });

  document.querySelector("#generateWorkout").addEventListener("click", () => {
    state.workoutPlan = buildWorkoutPlan();
    saveState();
    renderWorkoutPlan();
    renderRecordWorkoutPlan();
  });

  document.querySelector("#exerciseSegment").addEventListener("click", (event) => {
    const button = event.target.closest("[data-exercise]");
    if (!button) return;
    setExerciseSegment(button.dataset.exercise === "true");
  });
  document.querySelector("#resetData").addEventListener("click", () => {
    if (confirm("端末内の体重・運動データをすべて削除しますか？")) {
      state = structuredClone(defaultState);
      saveState();
      render();
    }
  });
  window.addEventListener("resize", drawChart);
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
