/* ============================================================
   app.js — CalTrack · Gains-style PWA
   Data constants live in data.js (loaded first).
   ============================================================ */

// ── USDA FoodData Central API ─────────────────────────────────
// Free public API — get your own key at https://fdc.nal.usda.gov/api-key-signup
// DEMO_KEY works for personal/low-volume use (30 req/hr, 50/day)
const USDA_KEY      = "DEMO_KEY";
const USDA_BASE     = "https://api.nal.usda.gov/fdc/v1";
const NUTRIENT_CAL  = 1008;   // Energy (kcal)
const NUTRIENT_PRO  = 1003;   // Protein (g)

// ── State ────────────────────────────────────────────────────
let currentDate      = todayStr();
let editingId        = null;
let selectedCat      = "Breakfast";
let weeklyChart      = null;
let usdaDebounceTimer = null;
let pendingUsdaFood  = null;   // food being confirmed in serving sheet

// ── Utility ──────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function fmtDate(str) {
  const [y, m, d] = str.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric"
  });
}

function shortDate(str) {
  const [y, m, d] = str.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Storage ───────────────────────────────────────────────────
function getLog(date) {
  return JSON.parse(localStorage.getItem("ct_" + date) || "[]");
}
function saveLog(date, arr) {
  localStorage.setItem("ct_" + date, JSON.stringify(arr));
}
function addEntry(date, entry)        { const l = getLog(date); l.push(entry); saveLog(date, l); }
function removeEntry(date, id)        { saveLog(date, getLog(date).filter(e => e.id !== id)); }
function updateEntry(date, id, patch) {
  const l = getLog(date);
  const i = l.findIndex(e => e.id === id);
  if (i !== -1) l[i] = { ...l[i], ...patch };
  saveLog(date, l);
}
function totals(entries) {
  return entries.reduce((a, e) => ({ cal: a.cal + e.calories, pro: a.pro + e.protein }), { cal: 0, pro: 0 });
}

// ── Arc ring animation ────────────────────────────────────────
// r=42, circumference = 2π×42 ≈ 263.89
const CIRC = 263.89;

function setArc(id, value, goal) {
  const el  = document.getElementById(id);
  const pct = Math.min(value / goal, 1);
  requestAnimationFrame(() => {
    el.style.strokeDashoffset = CIRC - pct * CIRC;
  });
}

// ── Category dot colour ───────────────────────────────────────
function dotColor(cat) {
  return CATEGORY_COLORS[cat] || "#888";
}

// ── Build entry card ──────────────────────────────────────────
function buildEntryCard(entry) {
  const div = document.createElement("div");
  div.className = "entry-card";
  div.dataset.id = entry.id;

  div.innerHTML = `
    <div class="entry-dot" style="background:${dotColor(entry.category)}"></div>
    <span class="entry-name">${entry.name}</span>
    <div class="entry-macros">
      <span class="entry-cal">${entry.calories} kcal</span>
      <span class="entry-pro">${entry.protein}g protein</span>
    </div>
    <div class="entry-actions">
      <button class="icon-btn-sm edit-btn" title="Edit">✏️</button>
      <button class="icon-btn-sm del del-btn" title="Delete">🗑</button>
    </div>
  `;

  div.querySelector(".edit-btn").addEventListener("click", () => beginEdit(entry));
  div.querySelector(".del-btn").addEventListener("click",  () => deleteEntry(entry.id));
  return div;
}

// ── Render home screen ────────────────────────────────────────
function renderHome() {
  const entries = getLog(currentDate);
  const t       = totals(entries);

  // Top bar
  document.getElementById("greeting").textContent = greeting();
  document.getElementById("topDate").textContent  =
    currentDate === todayStr() ? "Today" : shortDate(currentDate);

  // Arcs
  setArc("calArc", t.cal, GOALS.calories);
  setArc("proArc", t.pro, GOALS.protein);

  // Ring center values
  document.getElementById("calVal").textContent = Math.round(t.cal);
  document.getElementById("proVal").textContent = Math.round(t.pro);

  // Pill row
  const calLeft = Math.max(0, GOALS.calories - Math.round(t.cal));
  const proLeft = Math.max(0, GOALS.protein  - Math.round(t.pro));
  document.getElementById("calRemain").textContent   = calLeft.toLocaleString();
  document.getElementById("proRemain").textContent   = Math.round(proLeft) + "g";
  document.getElementById("mealCountHome").textContent = entries.length;

  // Colour remaining vals based on deficit
  const calEl = document.getElementById("calRemain");
  calEl.style.color = calLeft === 0 ? "var(--green)" : "var(--orange)";

  // Entry list
  const list  = document.getElementById("homeEntryList");
  const empty = document.getElementById("homeEmpty");
  list.innerHTML = "";

  if (entries.length === 0) {
    list.appendChild(empty);
  } else {
    entries.forEach(e => list.appendChild(buildEntryCard(e)));
  }
}

// ── Render log screen ─────────────────────────────────────────
function renderLogScreen() {
  document.getElementById("logDateChip").textContent = fmtDate(currentDate);
  renderLogList();
  renderPresets("");
}

function renderLogList() {
  const entries = getLog(currentDate);
  const list    = document.getElementById("logEntryList");
  const empty   = document.getElementById("logEmpty");
  list.innerHTML = "";

  if (entries.length === 0) {
    list.appendChild(empty);
  } else {
    entries.forEach(e => list.appendChild(buildEntryCard(e)));
  }
}

// ── USDA API ─────────────────────────────────────────────────
async function searchUSDA(query) {
  if (!query.trim()) {
    document.getElementById("usdaResults").innerHTML = "";
    document.getElementById("usdaHint").textContent = "Powered by USDA FoodData Central";
    return;
  }

  // Show spinner
  const spinner = document.getElementById("usdaSpinner");
  const hint    = document.getElementById("usdaHint");
  const results = document.getElementById("usdaResults");
  spinner.style.display = "block";
  hint.textContent = "Searching…";
  results.innerHTML = "";

  try {
    const url = `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}&pageSize=20&dataType=SR%20Legacy,Survey%20(FNDDS),Branded&api_key=${USDA_KEY}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    spinner.style.display = "none";

    const foods = (data.foods || []).filter(f => {
      // Only include foods that have calorie data
      return f.foodNutrients && f.foodNutrients.some(n => n.nutrientId === NUTRIENT_CAL && n.value > 0);
    });

    if (foods.length === 0) {
      hint.textContent = "No results — try a different search term";
      return;
    }

    hint.textContent = `${data.totalHits?.toLocaleString() ?? foods.length} foods found · showing top ${foods.length}`;
    renderUSDAResults(foods);

  } catch (err) {
    spinner.style.display = "none";
    if (err.message.includes("429") || err.message.includes("403")) {
      hint.textContent = "⚠️ Rate limit hit — wait a moment and try again";
    } else {
      hint.textContent = "⚠️ Search failed — check your connection";
    }
    console.error("USDA search error:", err);
  }
}

function getNutrientValue(foodNutrients, nutrientId) {
  const n = foodNutrients?.find(n => n.nutrientId === nutrientId);
  return n ? Math.round(n.value * 10) / 10 : 0;
}

function renderUSDAResults(foods) {
  const container = document.getElementById("usdaResults");
  container.innerHTML = "";

  foods.forEach(food => {
    const cal100 = getNutrientValue(food.foodNutrients, NUTRIENT_CAL);
    const pro100 = getNutrientValue(food.foodNutrients, NUTRIENT_PRO);

    // Clean up the description (USDA names can be long/uppercase)
    const name = toTitleCase(food.description.split(",").slice(0, 2).join(", "));

    const row = document.createElement("div");
    row.className = "preset-row";
    row.innerHTML = `
      <div class="entry-dot" style="background:var(--cyan)"></div>
      <span class="preset-row-name">${name}<span class="usda-badge">USDA</span></span>
      <span class="preset-row-meta">${cal100} kcal · ${pro100}g <span style="font-size:.65rem;color:var(--muted2)">per 100g</span></span>
      <span class="preset-add-icon">＋</span>
    `;

    row.addEventListener("click", () => openServingSheet({ name, cal100, pro100 }));
    container.appendChild(row);
  });
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Serving size sheet ────────────────────────────────────────
function openServingSheet(food) {
  pendingUsdaFood = food;
  document.getElementById("servingFoodName").textContent = food.name;
  document.getElementById("servingPer100").innerHTML =
    `Per 100 g: <strong>${food.cal100} kcal · ${food.pro100}g protein</strong>`;
  document.getElementById("servingGrams").value = 100;
  updateServingPreview();
  document.getElementById("servingSheetBackdrop").classList.add("open");
  document.getElementById("servingGrams").focus();
}

function closeServingSheet() {
  document.getElementById("servingSheetBackdrop").classList.remove("open");
  pendingUsdaFood = null;
}

function updateServingPreview() {
  if (!pendingUsdaFood) return;
  const g   = parseFloat(document.getElementById("servingGrams").value) || 0;
  const cal = Math.round((pendingUsdaFood.cal100 / 100) * g);
  const pro = Math.round((pendingUsdaFood.pro100 / 100) * g * 10) / 10;
  document.getElementById("servingCalPreview").textContent = `${cal} kcal`;
  document.getElementById("servingProPreview").textContent = `${pro}g protein`;
}

function confirmServing() {
  if (!pendingUsdaFood) return;
  const g   = parseFloat(document.getElementById("servingGrams").value) || 100;
  const cal = Math.round((pendingUsdaFood.cal100 / 100) * g);
  const pro = Math.round((pendingUsdaFood.pro100 / 100) * g * 10) / 10;

  // Fill the entry form
  document.getElementById("foodName").value = `${pendingUsdaFood.name} (${g}g)`;
  document.getElementById("foodCal").value  = cal;
  document.getElementById("foodPro").value  = pro;

  closeServingSheet();
  document.getElementById("entryForm").scrollIntoView({ behavior: "smooth" });
}

// ── Log screen tabs ───────────────────────────────────────────
function switchDbTab(tabName) {
  document.querySelectorAll(".db-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === tabName)
  );
  document.querySelectorAll(".db-panel").forEach(p =>
    p.classList.toggle("active", p.id === "panel-" + tabName)
  );
}

// ── Render presets ────────────────────────────────────────────
function renderPresets(query) {
  const container = document.getElementById("presetList");
  container.innerHTML = "";
  const q = query.toLowerCase().trim();
  const items = q ? FOOD_PRESETS.filter(p => p.name.toLowerCase().includes(q)) : FOOD_PRESETS;

  if (items.length === 0) {
    container.innerHTML = `<p style="color:var(--muted);font-size:.85rem;padding:.5rem 0">No matches.</p>`;
    return;
  }

  items.forEach(preset => {
    const row = document.createElement("div");
    row.className = "preset-row";
    row.innerHTML = `
      <div class="entry-dot" style="background:${dotColor(preset.category)}"></div>
      <span class="preset-row-name">${preset.name}</span>
      <span class="preset-row-meta">${preset.calories} kcal · ${preset.protein}g</span>
      <span class="preset-add-icon">＋</span>
    `;
    row.addEventListener("click", () => {
      // Fill form with preset values
      document.getElementById("foodName").value = preset.name;
      document.getElementById("foodCal").value  = preset.calories;
      document.getElementById("foodPro").value  = preset.protein;
      selectCat(preset.category);
      document.getElementById("fieldError").textContent = "";
      document.getElementById("foodName").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    container.appendChild(row);
  });
}

// ── Category pill selection ───────────────────────────────────
function selectCat(cat) {
  selectedCat = cat;
  document.querySelectorAll(".cat-pill").forEach(p => {
    p.classList.toggle("active", p.dataset.cat === cat);
  });
}

// ── Form submit ───────────────────────────────────────────────
function handleSubmit() {
  const name     = document.getElementById("foodName").value.trim();
  const calories = parseFloat(document.getElementById("foodCal").value);
  const protein  = parseFloat(document.getElementById("foodPro").value);
  const errEl    = document.getElementById("fieldError");

  if (!name)                       { errEl.textContent = "Food name is required."; return; }
  if (isNaN(calories) || calories < 0) { errEl.textContent = "Enter valid calories."; return; }
  if (isNaN(protein)  || protein  < 0) { errEl.textContent = "Enter valid protein."; return; }
  errEl.textContent = "";

  if (editingId) {
    updateEntry(currentDate, editingId, { name, calories, protein, category: selectedCat });
    endEdit();
  } else {
    addEntry(currentDate, { id: uid(), name, calories, protein, category: selectedCat, date: currentDate });
    resetForm();
  }

  renderLogList();
  renderHome();
}

function resetForm() {
  document.getElementById("foodName").value = "";
  document.getElementById("foodCal").value  = "";
  document.getElementById("foodPro").value  = "";
  document.getElementById("fieldError").textContent = "";
  document.getElementById("formCardLabel").textContent = "New Entry";
  document.getElementById("submitBtn").textContent    = "Add Meal";
  document.getElementById("cancelEditBtn").style.display = "none";
  selectCat("Breakfast");
  editingId = null;
}

// ── Edit ──────────────────────────────────────────────────────
function beginEdit(entry) {
  editingId = entry.id;
  document.getElementById("foodName").value = entry.name;
  document.getElementById("foodCal").value  = entry.calories;
  document.getElementById("foodPro").value  = entry.protein;
  selectCat(entry.category);
  document.getElementById("formCardLabel").textContent    = "Edit Entry";
  document.getElementById("submitBtn").textContent        = "Save Changes";
  document.getElementById("cancelEditBtn").style.display  = "block";
  // Switch to log screen and scroll to form
  showScreen("log");
  document.getElementById("entryForm").scrollIntoView({ behavior: "smooth" });
}

function endEdit() {
  editingId = null;
  resetForm();
}

// ── Delete ────────────────────────────────────────────────────
function deleteEntry(id) {
  // Animate both copies of the card (home + log lists)
  document.querySelectorAll(`.entry-card[data-id="${id}"]`).forEach(card => {
    card.classList.add("out");
  });
  setTimeout(() => {
    removeEntry(currentDate, id);
    renderHome();
    renderLogList();
  }, 220);
}

// ── Weekly screen ─────────────────────────────────────────────
function renderWeekly() {
  const today = todayStr();
  const days  = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Day strip
  const strip = document.getElementById("dayStrip");
  strip.innerHTML = "";
  const labels = [], calData = [], proData = [];

  let totalCal = 0, totalPro = 0, activeDays = 0;

  days.forEach(ds => {
    const entries = getLog(ds);
    const t = totals(entries);
    const [y, m, d] = ds.split("-");
    const dt = new Date(y, m - 1, d);
    const dayNames = ["Su","Mo","Tu","We","Th","Fr","Sa"];

    if (t.cal > 0) { totalCal += t.cal; totalPro += t.pro; activeDays++; }

    const tile = document.createElement("div");
    tile.className = "day-tile" + (ds === today ? " today" : "");
    tile.innerHTML = `
      <span class="day-tile-name">${dayNames[dt.getDay()]}</span>
      <span class="day-tile-date">${dt.getDate()}</span>
      <span class="day-tile-cal">${t.cal > 0 ? Math.round(t.cal) : "—"}</span>
      <span class="day-tile-pro">${t.pro > 0 ? Math.round(t.pro)+"g" : ""}</span>
    `;
    strip.appendChild(tile);

    labels.push(dayNames[dt.getDay()]);
    calData.push(Math.round(t.cal));
    proData.push(Math.round(t.pro));
  });

  // Averages
  document.getElementById("avgCal").textContent = activeDays ? Math.round(totalCal / activeDays).toLocaleString() : "—";
  document.getElementById("avgPro").textContent = activeDays ? Math.round(totalPro / activeDays) + "g" : "—";

  // Chart
  if (weeklyChart) { weeklyChart.destroy(); weeklyChart = null; }

  const ctx = document.getElementById("weekChart").getContext("2d");
  weeklyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Calories",
          data: calData,
          backgroundColor: "rgba(249,115,22,0.65)",
          borderColor: "#f97316",
          borderWidth: 0,
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          label: "Protein (g)",
          data: proData,
          type: "line",
          tension: 0.4,
          borderColor: "#818cf8",
          backgroundColor: "rgba(129,140,248,0.12)",
          pointBackgroundColor: "#818cf8",
          pointRadius: 4,
          borderWidth: 2,
          fill: true,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: "#6b6b80", font: { family: "Inter", size: 11 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: "#1c1c26",
          titleColor: "#f0f0f8",
          bodyColor: "#6b6b80",
          borderColor: "rgba(255,255,255,0.07)",
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: {
        x: { ticks: { color: "#6b6b80", font: { family: "Inter", size: 10 } }, grid: { color: "rgba(255,255,255,0.03)" } },
        y: {
          position: "left",
          ticks: { color: "#6b6b80", font: { family: "Inter", size: 10 } },
          grid:  { color: "rgba(255,255,255,0.03)" },
          title: { display: true, text: "kcal", color: "#f97316", font: { size: 10 } },
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: "#6b6b80", font: { family: "Inter", size: 10 } },
          title: { display: true, text: "protein", color: "#818cf8", font: { size: 10 } },
        },
      },
    },
  });
}

// ── Screen routing ────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

  document.getElementById("screen-" + name).classList.add("active");
  document.querySelector(`.tab[data-screen="${name}"]`).classList.add("active");

  // Re-render on switch
  if (name === "home")   renderHome();
  if (name === "log")    renderLogScreen();
  if (name === "weekly") renderWeekly();
}

// ── Date sheet ────────────────────────────────────────────────
function openDateSheet() {
  document.getElementById("datePicker").value = currentDate;
  document.getElementById("dateSheetBackdrop").classList.add("open");
}

function closeDateSheet() {
  document.getElementById("dateSheetBackdrop").classList.remove("open");
}

function applyDate() {
  const val = document.getElementById("datePicker").value;
  if (val) currentDate = val;
  closeDateSheet();
  // Re-render active screen
  const active = document.querySelector(".screen.active");
  if (active) showScreen(active.id.replace("screen-", ""));
}

// ── PWA service worker registration ──────────────────────────
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

// ── Boot ──────────────────────────────────────────────────────
function init() {
  // Tab bar navigation
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.screen));
  });

  // Category pills
  document.querySelectorAll(".cat-pill").forEach(p => {
    p.addEventListener("click", () => selectCat(p.dataset.cat));
  });

  // Form submit button
  document.getElementById("submitBtn").addEventListener("click", handleSubmit);

  // Cancel edit
  document.getElementById("cancelEditBtn").addEventListener("click", endEdit);

  // Home quick-add → jump to log tab
  document.getElementById("homeAddBtn").addEventListener("click", () => showScreen("log"));

  // Preset search
  document.getElementById("presetSearch").addEventListener("input", e => renderPresets(e.target.value));

  // USDA live search with 400ms debounce
  document.getElementById("usdaSearch").addEventListener("input", e => {
    clearTimeout(usdaDebounceTimer);
    const q = e.target.value.trim();
    if (!q) {
      document.getElementById("usdaResults").innerHTML = "";
      document.getElementById("usdaHint").textContent = "Powered by USDA FoodData Central";
      document.getElementById("usdaSpinner").style.display = "none";
      return;
    }
    document.getElementById("usdaSpinner").style.display = "block";
    usdaDebounceTimer = setTimeout(() => searchUSDA(q), 400);
  });

  // Database tab switching
  document.querySelectorAll(".db-tab").forEach(btn => {
    btn.addEventListener("click", () => switchDbTab(btn.dataset.tab));
  });

  // Serving sheet
  document.getElementById("servingGrams").addEventListener("input", updateServingPreview);
  document.getElementById("servingConfirm").addEventListener("click", confirmServing);
  document.getElementById("servingSheetBackdrop").addEventListener("click", e => {
    if (e.target === document.getElementById("servingSheetBackdrop")) closeServingSheet();
  });

  // Date picker sheet
  document.getElementById("dateTrigger").addEventListener("click", openDateSheet);
  document.getElementById("dateConfirm").addEventListener("click", applyDate);
  document.getElementById("dateSheetBackdrop").addEventListener("click", e => {
    if (e.target === document.getElementById("dateSheetBackdrop")) closeDateSheet();
  });

  // Keyboard shortcuts for desktop
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeDateSheet(); closeServingSheet(); }
    if (e.key === "Enter" && document.activeElement.closest("#entryForm")) handleSubmit();
    if (e.key === "Enter" && document.activeElement.id === "servingGrams") confirmServing();
  });

  registerSW();
  showScreen("home");
}

document.addEventListener("DOMContentLoaded", init);
