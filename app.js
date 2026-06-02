/* ============================================================
   app.js — CalTrack UI logic
   All data constants live in data.js (loaded before this file).
   ============================================================ */

// ── State ────────────────────────────────────────────────────
let currentDate = todayStr();           // "YYYY-MM-DD"
let editingId   = null;                 // ID of the entry being edited
let weeklyChart = null;                 // Chart.js instance

// ── Helpers ──────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(str) {
  // str = "YYYY-MM-DD"
  const [y, m, d] = str.split("-");
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── LocalStorage helpers ─────────────────────────────────────
function getLog(dateStr) {
  // Returns array of meal entry objects for a given date
  return JSON.parse(localStorage.getItem("ct_log_" + dateStr) || "[]");
}

function saveLog(dateStr, entries) {
  localStorage.setItem("ct_log_" + dateStr, JSON.stringify(entries));
}

function addEntry(dateStr, entry) {
  const log = getLog(dateStr);
  log.push(entry);
  saveLog(dateStr, log);
}

function updateEntry(dateStr, id, updates) {
  const log = getLog(dateStr);
  const idx = log.findIndex(e => e.id === id);
  if (idx !== -1) log[idx] = { ...log[idx], ...updates };
  saveLog(dateStr, log);
}

function removeEntry(dateStr, id) {
  const log = getLog(dateStr).filter(e => e.id !== id);
  saveLog(dateStr, log);
}

// ── Totals ───────────────────────────────────────────────────
function totals(entries) {
  return entries.reduce(
    (acc, e) => ({ cal: acc.cal + e.calories, pro: acc.pro + e.protein }),
    { cal: 0, pro: 0 }
  );
}

// ── Category badge ───────────────────────────────────────────
function catBadge(cat) {
  const color = CATEGORY_COLORS[cat] || "#888";
  return `<span class="cat-badge" style="background:${color}">${cat}</span>`;
}

// ── Build a meal card element ─────────────────────────────────
function buildMealCard(entry, showActions = true) {
  const div = document.createElement("div");
  div.className = "meal-card";
  div.dataset.id = entry.id;

  div.innerHTML = `
    ${catBadge(entry.category)}
    <span class="meal-name">${entry.name}</span>
    <div class="meal-macros">
      <div class="macro-item">
        <strong>${entry.calories}</strong>
        <span>kcal</span>
      </div>
      <div class="macro-item">
        <strong>${entry.protein}g</strong>
        <span>protein</span>
      </div>
    </div>
    ${showActions ? `
    <div class="meal-actions">
      <button class="btn-icon edit-btn" title="Edit">✏️</button>
      <button class="btn-icon danger delete-btn" title="Remove">🗑</button>
    </div>` : ""}
  `;

  if (showActions) {
    div.querySelector(".edit-btn").addEventListener("click", () => startEdit(entry));
    div.querySelector(".delete-btn").addEventListener("click", () => deleteEntry(entry.id));
  }

  return div;
}

// ── Render dashboard ─────────────────────────────────────────
function renderDashboard() {
  const entries = getLog(currentDate);
  const t = totals(entries);

  // Subtitle
  document.getElementById("dashSubtitle").textContent = formatDate(currentDate);

  // Rings
  animateRing("calRing", t.cal, GOALS.calories);
  animateRing("proRing", t.pro, GOALS.protein);

  // Ring labels
  document.getElementById("calConsumed").textContent      = Math.round(t.cal);
  document.getElementById("calConsumedLabel").textContent = Math.round(t.cal);
  document.getElementById("calRemaining").textContent     = Math.max(0, GOALS.calories - Math.round(t.cal)).toLocaleString();

  document.getElementById("proConsumed").textContent      = Math.round(t.pro);
  document.getElementById("proConsumedLabel").textContent = Math.round(t.pro) + "g";
  document.getElementById("proRemaining").textContent     = Math.max(0, GOALS.protein - Math.round(t.pro)) + "g";

  // Meal list
  const list      = document.getElementById("dashMealList");
  const emptyState = document.getElementById("dashEmptyState");
  list.innerHTML  = "";

  document.getElementById("mealCount").textContent = `${entries.length} item${entries.length !== 1 ? "s" : ""}`;

  if (entries.length === 0) {
    list.appendChild(emptyState);
    return;
  }

  entries.forEach(e => list.appendChild(buildMealCard(e)));
}

// ── Animate circular progress ring ───────────────────────────
function animateRing(ringId, value, goal) {
  const ring        = document.getElementById(ringId);
  const circumference = 314.16; // 2π × 50
  const pct         = Math.min(value / goal, 1);
  const offset      = circumference - pct * circumference;

  // Trigger after a tiny delay so CSS transition fires
  requestAnimationFrame(() => {
    ring.style.strokeDashoffset = offset;
  });
}

// ── Render log view ──────────────────────────────────────────
function renderLog() {
  document.getElementById("logDateLabel").textContent = formatDate(currentDate);
  document.getElementById("logSubtitle").textContent  = "Pick a preset or enter custom food";

  const entries    = getLog(currentDate);
  const list       = document.getElementById("logMealList");
  const emptyState = document.getElementById("logEmptyState");
  list.innerHTML   = "";

  if (entries.length === 0) {
    list.appendChild(emptyState);
  } else {
    entries.forEach(e => list.appendChild(buildMealCard(e)));
  }
}

// ── Render preset list ───────────────────────────────────────
function renderPresets(query, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const q = (query || "").toLowerCase().trim();

  const filtered = q
    ? FOOD_PRESETS.filter(p => p.name.toLowerCase().includes(q))
    : FOOD_PRESETS;

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color:var(--muted);font-size:.85rem;padding:.5rem">No matches found.</p>`;
    return;
  }

  filtered.forEach(preset => {
    const item = document.createElement("div");
    item.className = "preset-item";
    item.innerHTML = `
      <span class="preset-name">${preset.name}</span>
      <span class="preset-meta">${preset.calories} kcal · ${preset.protein}g protein</span>
    `;
    item.addEventListener("click", () => fillFormFromPreset(preset, containerId));
    container.appendChild(item);
  });
}

// ── Fill form from a preset click ───────────────────────────
function fillFormFromPreset(preset, sourceId) {
  document.getElementById("foodName").value = preset.name;
  document.getElementById("foodCal").value  = preset.calories;
  document.getElementById("foodPro").value  = preset.protein;
  document.getElementById("foodCat").value  = preset.category;
  document.getElementById("formError").textContent = "";

  // If triggered from modal, close it and switch to log view
  if (sourceId === "modalPresetList") {
    closeModal();
  }

  showView("log");
  document.getElementById("foodName").focus();
}

// ── Form submit (add / update) ────────────────────────────────
function handleFormSubmit(e) {
  e.preventDefault();
  clearFormError();

  const name     = document.getElementById("foodName").value.trim();
  const calories = parseFloat(document.getElementById("foodCal").value);
  const protein  = parseFloat(document.getElementById("foodPro").value);
  const category = document.getElementById("foodCat").value;

  if (!name) return setFormError("Food name is required.");
  if (isNaN(calories) || calories < 0) return setFormError("Enter a valid calorie amount.");
  if (isNaN(protein)  || protein  < 0) return setFormError("Enter a valid protein amount.");

  if (editingId) {
    // Update existing entry
    updateEntry(currentDate, editingId, { name, calories, protein, category });
    cancelEdit();
  } else {
    addEntry(currentDate, { id: uid(), name, calories, protein, category, date: currentDate });
  }

  resetForm();
  renderLog();
  renderDashboard();
}

function setFormError(msg)   { document.getElementById("formError").textContent = msg; }
function clearFormError()    { document.getElementById("formError").textContent = ""; }

function resetForm() {
  document.getElementById("foodForm").reset();
  document.getElementById("foodName").value = "";
  document.getElementById("foodCal").value  = "";
  document.getElementById("foodPro").value  = "";
  document.getElementById("formTitle").textContent = "✏️ Custom Entry";
  document.getElementById("submitBtn").textContent = "Add Meal";
  document.getElementById("cancelEditBtn").style.display = "none";
  editingId = null;
}

// ── Edit ─────────────────────────────────────────────────────
function startEdit(entry) {
  editingId = entry.id;
  document.getElementById("foodName").value = entry.name;
  document.getElementById("foodCal").value  = entry.calories;
  document.getElementById("foodPro").value  = entry.protein;
  document.getElementById("foodCat").value  = entry.category;
  document.getElementById("formTitle").textContent    = "✏️ Edit Entry";
  document.getElementById("submitBtn").textContent    = "Save Changes";
  document.getElementById("cancelEditBtn").style.display = "inline-flex";
  showView("log");
  document.getElementById("foodName").scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("foodName").focus();
}

function cancelEdit() {
  editingId = null;
  resetForm();
}

// ── Delete ────────────────────────────────────────────────────
function deleteEntry(id) {
  const card = document.querySelector(`.meal-card[data-id="${id}"]`);
  if (card) {
    card.classList.add("removing");
    card.addEventListener("animationend", () => {
      removeEntry(currentDate, id);
      renderLog();
      renderDashboard();
    }, { once: true });
  } else {
    removeEntry(currentDate, id);
    renderLog();
    renderDashboard();
  }
}

// ── Weekly history ────────────────────────────────────────────
function renderWeekly() {
  // Build last 7 days array ending with currentDate
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d  = new Date(currentDate);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Cards
  const container = document.getElementById("weeklyCards");
  container.innerHTML = "";

  const labels = [], calData = [], proData = [];

  days.forEach(ds => {
    const entries = getLog(ds);
    const t       = totals(entries);
    const [y, m, d] = ds.split("-");
    const dt      = new Date(y, m - 1, d);
    const dayName = WEEK_DAYS[dt.getDay()];
    const isToday = ds === todayStr();

    const card = document.createElement("div");
    card.className = "week-day-card" + (isToday ? " today" : "");
    card.innerHTML = `
      <div class="wdc-day">${dayName}</div>
      <div class="wdc-date">${dt.getDate()}/${dt.getMonth() + 1}</div>
      <div class="wdc-cal">${Math.round(t.cal)}</div>
      <div class="wdc-label">kcal</div>
      <div class="wdc-pro">${Math.round(t.pro)}g</div>
      <div class="wdc-label">protein</div>
    `;
    container.appendChild(card);

    labels.push(dayName + " " + dt.getDate());
    calData.push(Math.round(t.cal));
    proData.push(Math.round(t.pro));
  });

  // Destroy old chart before recreating
  if (weeklyChart) { weeklyChart.destroy(); weeklyChart = null; }

  const ctx = document.getElementById("weeklyChart").getContext("2d");

  weeklyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Calories",
          data: calData,
          backgroundColor: "rgba(245,158,11,0.7)",
          borderColor: "#f59e0b",
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          label: "Protein (g)",
          data: proData,
          backgroundColor: "rgba(99,102,241,0.7)",
          borderColor: "#6366f1",
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: "y1",
          type: "line",
          tension: 0.4,
          pointBackgroundColor: "#6366f1",
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: "easeOutQuart" },
      plugins: {
        legend: {
          labels: { color: "#9ca3af", font: { family: "Inter", size: 12 } },
        },
        tooltip: {
          backgroundColor: "#1c2030",
          titleColor: "#e8eaf0",
          bodyColor: "#9ca3af",
          borderColor: "#252a3a",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "#6b7280", font: { family: "Inter", size: 11 } },
          grid:  { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          position: "left",
          ticks: { color: "#6b7280", font: { family: "Inter", size: 11 } },
          grid:  { color: "rgba(255,255,255,0.04)" },
          title: { display: true, text: "Calories", color: "#f59e0b", font: { size: 11 } },
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: "#6b7280", font: { family: "Inter", size: 11 } },
          title: { display: true, text: "Protein (g)", color: "#6366f1", font: { size: 11 } },
        },
      },
    },
  });
}

// ── View switching ────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  document.getElementById("view-" + name).classList.add("active");
  document.querySelector(`[data-view="${name}"]`).classList.add("active");

  if (name === "dashboard") renderDashboard();
  if (name === "log")       { renderLog(); renderPresets("", "presetList"); }
  if (name === "history")   renderWeekly();

  // Close mobile sidebar on nav
  closeSidebar();
}

// ── Date picker ───────────────────────────────────────────────
function setDate(str) {
  currentDate = str;
  document.getElementById("mobileDate").textContent = str;

  // Re-render whichever view is active
  const active = document.querySelector(".view.active");
  if (active) {
    const name = active.id.replace("view-", "");
    if (name === "dashboard") renderDashboard();
    if (name === "log")       renderLog();
    if (name === "history")   renderWeekly();
  }
}

// ── Modal ─────────────────────────────────────────────────────
function openModal() {
  document.getElementById("modalBackdrop").classList.add("open");
  renderPresets("", "modalPresetList");
  document.getElementById("modalSearch").focus();
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("open");
  document.getElementById("modalSearch").value = "";
}

// ── Sidebar (mobile) ──────────────────────────────────────────
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.add("open");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("open");
}

// ── Boot ──────────────────────────────────────────────────────
function init() {
  // Set date picker to today
  const picker = document.getElementById("datePicker");
  picker.value = currentDate;
  document.getElementById("mobileDate").textContent = currentDate;

  // Date picker change
  picker.addEventListener("change", e => setDate(e.target.value));

  // Nav buttons
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  // Form submit
  document.getElementById("foodForm").addEventListener("submit", handleFormSubmit);

  // Cancel edit
  document.getElementById("cancelEditBtn").addEventListener("click", cancelEdit);

  // Preset search on log view
  document.getElementById("presetSearch").addEventListener("input", e => {
    renderPresets(e.target.value, "presetList");
  });

  // Quick-add modal
  document.getElementById("quickAddBtn").addEventListener("click", openModal);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", e => {
    if (e.target === document.getElementById("modalBackdrop")) closeModal();
  });

  // Modal search
  document.getElementById("modalSearch").addEventListener("input", e => {
    renderPresets(e.target.value, "modalPresetList");
  });

  // Mobile hamburger
  document.getElementById("hamburger").addEventListener("click", openSidebar);
  document.getElementById("sidebarOverlay").addEventListener("click", closeSidebar);

  // Keyboard: Escape closes modal / sidebar
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeModal(); closeSidebar(); }
  });

  // Render default view
  showView("dashboard");
}

document.addEventListener("DOMContentLoaded", init);
