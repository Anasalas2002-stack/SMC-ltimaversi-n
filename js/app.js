/* ===================== CONSTANTS ===================== */
const STORAGE_KEY = "habitbox_habits_v1";

const ICON_OPTIONS = ["🏃", "🧘", "📖", "💧", "🎸", "🎨", "💪", "🥗", "😴", "📝", "🚭", "💰", "🧹", "✍️", "🚴", "🎯"];

const COLOR_OPTIONS = [
  "#ff6b35", // orange
  "#8e2de2", // purple
  "#2ecc71", // green
  "#2196f3", // blue
  "#f9c74f", // gold
  "#ff2e63", // pink/red
  "#00bcd4", // teal
  "#e63946", // red
];

const DAY_MS = 24 * 60 * 60 * 1000;

/* ===================== STATE ===================== */
let habits = loadHabits();
let currentHabitId = null;
let currentRange = "week"; // week | month | year
let selectedIcon = ICON_OPTIONS[0];
let selectedColor = COLOR_OPTIONS[0];

/* ===================== PERSISTENCE ===================== */
function loadHabits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveHabits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  } catch (e) {
    /* storage unavailable, ignore */
  }
}

/* ===================== DATE HELPERS ===================== */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function daysBetween(a, b) {
  const startOfA = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const startOfB = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((startOfB - startOfA) / DAY_MS);
}

/* ===================== HABIT LOGIC ===================== */
function createHabit(name, description, icon, color) {
  const habit = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    description: description || "",
    icon,
    color,
    createdAt: todayKey(),
    completions: {}, // { "YYYY-MM-DD": true }
  };
  habits.unshift(habit);
  saveHabits();
}

function deleteHabit(id) {
  habits = habits.filter((h) => h.id !== id);
  saveHabits();
}

function toggleCompletion(habit, dateKey) {
  if (habit.completions[dateKey]) {
    delete habit.completions[dateKey];
  } else {
    habit.completions[dateKey] = true;
  }
  saveHabits();
}

function getCurrentStreak(habit) {
  let streak = 0;
  let cursor = new Date();

  // Grace period: if today isn't done yet, start counting from yesterday.
  if (!habit.completions[toDateKey(cursor)]) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  while (habit.completions[toDateKey(cursor)]) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

function getDaysSinceStart(habit) {
  const start = parseDateKey(habit.createdAt);
  return Math.max(daysBetween(start, new Date()), 0) + 1;
}

function getTotalCompletions(habit) {
  return Object.keys(habit.completions).length;
}

function getMissedDays(habit) {
  const total = getDaysSinceStart(habit);
  const completed = getTotalCompletions(habit);
  return Math.max(total - completed, 0);
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/* ===================== RENDER: FEED ===================== */
function renderFeed() {
  const feed = document.getElementById("habitFeed");
  const emptyState = document.getElementById("emptyState");
  feed.innerHTML = "";

  if (habits.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  habits.forEach((habit) => {
    feed.appendChild(buildHabitCard(habit));
  });
}

function buildHabitCard(habit) {
  const card = document.createElement("div");
  card.className = "habit-card";
  card.style.background = habit.color;
  card.style.setProperty("--habit-color", habit.color);

  const doneToday = !!habit.completions[todayKey()];

  card.innerHTML = `
    <div class="habit-card-header">
      <div class="habit-card-title">
        <div class="habit-emoji">${habit.icon}</div>
        <div>
          <h3>${escapeHtml(habit.name)}</h3>
          ${habit.description ? `<p>${escapeHtml(habit.description)}</p>` : ""}
        </div>
      </div>
      <button class="check-circle ${doneToday ? "done" : ""}" data-action="toggle">✓</button>
    </div>
    <div class="mini-grid"></div>
  `;

  const grid = card.querySelector(".mini-grid");
  buildGridCells(grid, habit, 63); // ~9 weeks of squares

  card.querySelector('[data-action="toggle"]').addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCompletion(habit, todayKey());
    renderFeed();
  });

  card.addEventListener("click", () => openDetail(habit.id));

  return card;
}

function buildGridCells(container, habit, numDays) {
  container.innerHTML = "";
  const today = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = toDateKey(date);
    const cell = document.createElement("div");
    cell.className = "cell";
    if (habit.completions[key]) cell.classList.add("filled");
    cell.title = key;
    container.appendChild(cell);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ===================== RENDER: DETAIL ===================== */
function openDetail(id) {
  currentHabitId = id;
  currentRange = "week";
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector('.tab-btn[data-range="week"]').classList.add("active");
  renderDetail();
  showView("detailView");
}

function renderDetail() {
  const habit = habits.find((h) => h.id === currentHabitId);
  if (!habit) {
    showView("feedView");
    return;
  }

  document.getElementById("detailIcon").textContent = habit.icon;
  document.getElementById("detailIcon").style.background = habit.color;
  document.getElementById("detailName").textContent = habit.name;
  document.getElementById("detailDesc").textContent = habit.description || "Sin descripción";

  document.getElementById("statStreak").textContent = getCurrentStreak(habit);
  document.getElementById("statSince").textContent = getDaysSinceStart(habit);
  document.getElementById("statCompletions").textContent = getTotalCompletions(habit);
  document.getElementById("statMissed").textContent = getMissedDays(habit);

  const rangeDays = { week: 7, month: 35, year: 371 }[currentRange];
  const grid = document.getElementById("detailGrid");
  grid.innerHTML = "";
  const today = new Date();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = toDateKey(date);
    const cell = document.createElement("div");
    cell.className = "cell";
    if (habit.completions[key]) {
      cell.classList.add("filled");
      cell.style.background = habit.color;
    }
    cell.title = key;
    cell.addEventListener("click", () => {
      toggleCompletion(habit, key);
      renderDetail();
    });
    grid.appendChild(cell);
  }
  grid.scrollLeft = grid.scrollWidth;

  const toggleBtn = document.getElementById("toggleTodayBtn");
  const doneToday = !!habit.completions[todayKey()];
  toggleBtn.textContent = doneToday ? "✓ Hecho hoy" : "Marcar hoy";
  toggleBtn.style.background = habit.color;
}

/* ===================== VIEW SWITCHING ===================== */
function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(viewId).classList.remove("hidden");
  if (viewId === "feedView") renderFeed();
}

/* ===================== MODAL ===================== */
function openModal() {
  selectedIcon = ICON_OPTIONS[0];
  selectedColor = COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)];
  document.getElementById("habitNameInput").value = "";
  document.getElementById("habitDescInput").value = "";
  buildIconPicker();
  buildColorPicker();
  document.getElementById("habitModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("habitModal").classList.add("hidden");
}

function buildIconPicker() {
  const el = document.getElementById("iconPicker");
  el.innerHTML = "";
  ICON_OPTIONS.forEach((icon) => {
    const btn = document.createElement("button");
    btn.className = "icon-option" + (icon === selectedIcon ? " selected" : "");
    btn.textContent = icon;
    btn.addEventListener("click", () => {
      selectedIcon = icon;
      buildIconPicker();
    });
    el.appendChild(btn);
  });
}

function buildColorPicker() {
  const el = document.getElementById("colorPicker");
  el.innerHTML = "";
  COLOR_OPTIONS.forEach((color) => {
    const btn = document.createElement("button");
    btn.className = "color-option" + (color === selectedColor ? " selected" : "");
    btn.style.background = color;
    btn.addEventListener("click", () => {
      selectedColor = color;
      buildColorPicker();
    });
    el.appendChild(btn);
  });
}

/* ===================== EVENT WIRING ===================== */
document.getElementById("addHabitFab").addEventListener("click", openModal);
document.getElementById("closeModalBtn").addEventListener("click", closeModal);

document.getElementById("saveHabitBtn").addEventListener("click", () => {
  const name = document.getElementById("habitNameInput").value.trim();
  const description = document.getElementById("habitDescInput").value.trim();
  if (!name) {
    document.getElementById("habitNameInput").focus();
    return;
  }
  createHabit(name, description, selectedIcon, selectedColor);
  closeModal();
  renderFeed();
});

document.getElementById("backBtn").addEventListener("click", () => showView("feedView"));

document.getElementById("deleteHabitBtn").addEventListener("click", () => {
  const habit = habits.find((h) => h.id === currentHabitId);
  if (!habit) return;
  if (confirm(`¿Eliminar el hábito "${habit.name}"? Esta acción no se puede deshacer.`)) {
    deleteHabit(currentHabitId);
    showView("feedView");
  }
});

document.getElementById("toggleTodayBtn").addEventListener("click", () => {
  const habit = habits.find((h) => h.id === currentHabitId);
  if (!habit) return;
  toggleCompletion(habit, todayKey());
  renderDetail();
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    renderDetail();
  });
});

document.getElementById("habitModal").addEventListener("click", (e) => {
  if (e.target.id === "habitModal") closeModal();
});

/* ===================== INIT ===================== */
renderFeed();
