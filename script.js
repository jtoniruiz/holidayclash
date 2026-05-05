/* ==========================================================================
   HolidayClash — main script (v2)
   - fetches public holidays from Nager.Date
   - renders a multi-country, year-at-a-glance calendar
   - flags TRUE clashes (different countries off same day)
   - distinguishes national vs regional holidays
   - shows ALL holidays per day (no truncation)
   ========================================================================== */

(function () {
  "use strict";

  const API_BASE = "https://date.nager.at/api/v3";
  const COUNTRIES_ENDPOINT = `${API_BASE}/AvailableCountries`;
  const HOLIDAYS_ENDPOINT  = (year, code) => `${API_BASE}/PublicHolidays/${year}/${code}`;

  const cache = new Map();

  const state = {
    countries: [],
    selected: [],
    year: new Date().getFullYear(),
    holidaysByCountry: {},
  };

  // --- DOM refs ---
  const $countrySelect = document.getElementById("country-select");
  const $yearSelect    = document.getElementById("year-select");
  const $addBtn        = document.getElementById("add-country");
  const $selected      = document.getElementById("selected-countries");
  const $results       = document.getElementById("results");
  const $year          = document.getElementById("year");

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if ($year) $year.textContent = new Date().getFullYear();

    populateYearSelect();
    bindEvents();

    try {
      await loadCountries();
    } catch (err) {
      console.error("Failed to load countries:", err);
      $countrySelect.innerHTML =
        `<option value="">Error loading country list — please refresh</option>`;
    }
  }

  function populateYearSelect() {
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
    $yearSelect.innerHTML = years
      .map(y => `<option value="${y}" ${y === thisYear ? "selected" : ""}>${y}</option>`)
      .join("");
  }

  function bindEvents() {
    $addBtn.addEventListener("click", onAddCountry);
    $yearSelect.addEventListener("change", onYearChange);

    document.querySelectorAll(".link-btn[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        const codes = btn.dataset.preset.split(",");
        applyPreset(codes);
      });
    });
  }

  // --- DATA LOADERS ---
  async function loadCountries() {
    const res = await fetch(COUNTRIES_ENDPOINT);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.countries = data
      .map(c => ({ code: c.countryCode, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    $countrySelect.innerHTML =
      `<option value="">— Pick a country —</option>` +
      state.countries
        .map(c => `<option value="${c.code}">${escape(c.name)}</option>`)
        .join("");
  }

  async function loadHolidaysFor(code, year) {
    const key = `${year}_${code}`;
    if (cache.has(key)) return cache.get(key);

    const res = await fetch(HOLIDAYS_ENDPOINT(year, code));
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${code} ${year}`);
    const data = await res.json();
    cache.set(key, data);
    return data;
  }

  async function refreshAllHolidays() {
    state.holidaysByCountry = {};
    const year = state.year;
    await Promise.all(
      state.selected.map(async (c) => {
        try {
          state.holidaysByCountry[c.code] = await loadHolidaysFor(c.code, year);
        } catch (err) {
          console.error(`Failed for ${c.code}:`, err);
          state.holidaysByCountry[c.code] = [];
        }
      })
    );
  }

  // --- EVENT HANDLERS ---
  function onAddCountry() {
    const code = $countrySelect.value;
    if (!code) return;
    if (state.selected.some(c => c.code === code)) return;

    const country = state.countries.find(c => c.code === code);
    if (!country) return;

    state.selected.push(country);
    $countrySelect.value = "";
    renderChips();
    refreshAndRender();
  }

  function onRemoveCountry(code) {
    state.selected = state.selected.filter(c => c.code !== code);
    renderChips();
    refreshAndRender();
  }

  function onYearChange() {
    const y = parseInt($yearSelect.value, 10);
    if (!Number.isFinite(y)) return;
    state.year = y;
    refreshAndRender();
  }

  function applyPreset(codes) {
    state.selected = codes
      .map(code => state.countries.find(c => c.code === code))
      .filter(Boolean);
    renderChips();
    refreshAndRender();
  }

  async function refreshAndRender() {
    if (state.selected.length === 0) {
      renderEmpty();
      return;
    }
    renderLoading();
    await refreshAllHolidays();
    render();
  }

  // --- RENDERERS ---
  function renderChips() {
    if (state.selected.length === 0) {
      $selected.innerHTML = "";
      return;
    }
    $selected.innerHTML = state.selected.map(c => `
      <span class="country-chip">
        ${escape(c.name)}
        <button type="button" aria-label="Remove ${escape(c.name)}" data-code="${c.code}">×</button>
      </span>
    `).join("");

    $selected.querySelectorAll("button[data-code]").forEach(btn => {
      btn.addEventListener("click", () => onRemoveCountry(btn.dataset.code));
    });
  }

  function renderEmpty() {
    $results.innerHTML = `
      <div class="results-empty">
        <div class="results-empty-icon">⚡</div>
        <p>Add at least one country above to see the holiday calendar.</p>
        <p class="muted">Try popular combinations:
          <button class="link-btn" data-preset="US,GB,DE">US · UK · Germany</button> ·
          <button class="link-btn" data-preset="US,IN,BR">US · India · Brazil</button>
        </p>
      </div>
    `;
    document.querySelectorAll(".link-btn[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        applyPreset(btn.dataset.preset.split(","));
      });
    });
  }

  function renderLoading() {
    $results.innerHTML = `
      <div class="results-empty">
        <div class="results-empty-icon">⏳</div>
        <p>Loading holidays for ${state.selected.length} ${state.selected.length === 1 ? "country" : "countries"}…</p>
      </div>
    `;
  }

  function render() {
    // Build a map: dateString -> [{country, holiday}, ...]
    const byDate = {};
    for (const c of state.selected) {
      const list = state.holidaysByCountry[c.code] || [];
      for (const h of list) {
        if (!byDate[h.date]) byDate[h.date] = [];
        byDate[h.date].push({ country: c, holiday: h });
      }
    }

    // FIX: a "clash" is when DIFFERENT countries share a date,
    // not just multiple holidays on the same day from one country.
    const clashDates = Object.keys(byDate).filter(d => {
      const uniqueCountries = new Set(byDate[d].map(e => e.country.code));
      return uniqueCountries.size >= 2;
    });

    const longWeekendDates = computeLongWeekendDates(Object.keys(byDate));
    const cleanWeekCount   = computeCleanWeekCount(state.year, byDate);
    const totalHolidayDays = Object.keys(byDate).length;

    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthCards = months.map(monthIndex =>
      buildMonthCard(monthIndex, byDate, clashDates, longWeekendDates)
    ).join("");

    $results.innerHTML = `
      <div class="results-summary">
        <div class="summary-pill">
          <strong>${totalHolidayDays}</strong>
          <span>holiday days mapped</span>
        </div>
        <div class="summary-pill clash">
          <strong>${clashDates.length}</strong>
          <span>clash days (2+ countries off)</span>
        </div>
        <div class="summary-pill gold">
          <strong>${longWeekendDates.length}</strong>
          <span>long-weekend triggers</span>
        </div>
        <div class="summary-pill teal">
          <strong>${cleanWeekCount}</strong>
          <span>clean weeks (everyone working)</span>
        </div>
      </div>

      <div class="legend legend-top">
        <span class="legend-item">
          <span class="legend-icon">🔥</span>
          <span><strong>Clash</strong> — 2+ countries off the same day</span>
        </span>
        <span class="legend-item">
          <span class="legend-icon">🌉</span>
          <span><strong>Long weekend</strong> — holiday adjacent to weekend</span>
        </span>
        <span class="legend-item">
          <span class="legend-icon">🌍</span>
          <span><strong>National</strong> holiday</span>
        </span>
        <span class="legend-item">
          <span class="legend-icon">📍</span>
          <span><strong>Regional</strong> only</span>
        </span>
      </div>

      <div class="year-grid">${monthCards}</div>
    `;
  }

  function buildMonthCard(monthIndex, byDate, clashDates, longWeekendDates) {
    const monthName = new Date(state.year, monthIndex, 1).toLocaleString("en-US", { month: "long" });

    const entries = Object.entries(byDate)
      .filter(([date]) => parseInt(date.split("-")[1], 10) === monthIndex + 1)
      .sort(([a], [b]) => a.localeCompare(b));

    let body;
    let tag;
    if (entries.length === 0) {
      body = `<p class="month-empty">No holidays</p>`;
      tag = `<span class="month-tag clean">CLEAN</span>`;
    } else {
      const items = entries.map(([date, list]) => {
        const day = parseInt(date.split("-")[2], 10);
        const isClash = clashDates.includes(date);
        const isLongWeekend = longWeekendDates.includes(date);

        let cls = "holiday-item";
        if (isClash) cls += " clash";
        else if (isLongWeekend) cls += " long-weekend";

        const rows = list.map(({ country, holiday }) => {
          const isNational = holiday.global === true ||
            !holiday.counties || holiday.counties.length === 0;
          const scopeIcon = isNational ? "🌍" : "📍";
          const scopeTitle = isNational
            ? `National holiday in ${country.name}`
            : `Regional holiday in ${country.name}${holiday.counties ? ` (${holiday.counties.join(", ")})` : ""}`;

          return `
            <div class="holiday-row">
              <span class="flag-badge" title="${escape(country.name)}">${escape(country.code)}</span>
              <span class="holiday-name" title="${escape(holiday.name)}">${escape(holiday.name)}</span>
              <span class="scope-icon" title="${escape(scopeTitle)}" aria-label="${escape(scopeTitle)}">${scopeIcon}</span>
            </div>
          `;
        }).join("");

        const statusIcons = [];
        if (isClash) statusIcons.push(`<span class="status-icon clash-icon" title="Clash — multiple countries off">🔥</span>`);
        if (isLongWeekend) statusIcons.push(`<span class="status-icon lw-icon" title="Long weekend trigger">🌉</span>`);

        return `
          <li class="${cls}">
            <div class="holiday-head">
              <span class="holiday-date">${day}</span>
              ${statusIcons.length ? `<span class="holiday-status">${statusIcons.join("")}</span>` : ""}
            </div>
            <div class="holiday-rows">${rows}</div>
          </li>
        `;
      }).join("");

      body = `<ul class="holiday-list">${items}</ul>`;

      const monthClashCount = entries.filter(([d]) => clashDates.includes(d)).length;
      if (monthClashCount >= 2 || entries.length >= 4) {
        tag = `<span class="month-tag busy">BUSY</span>`;
      } else {
        tag = "";
      }
    }

    return `
      <article class="month-card">
        <h3 class="month-name">${escape(monthName)} ${tag}</h3>
        ${body}
      </article>
    `;
  }

  // --- HELPERS ---

  function computeLongWeekendDates(dateStrings) {
    return dateStrings.filter(d => {
      const day = new Date(d + "T00:00:00Z").getUTCDay();
      return [1, 2, 4, 5].includes(day);
    });
  }

  function computeCleanWeekCount(year, byDate) {
    const dirtyWeeks = new Set();
    for (const dateStr of Object.keys(byDate)) {
      const wk = isoWeek(new Date(dateStr + "T00:00:00Z"));
      dirtyWeeks.add(wk);
    }
    const totalWeeks = isoWeeksInYear(year);
    return Math.max(0, totalWeeks - dirtyWeeks.size);
  }

  function isoWeek(d) {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function isoWeeksInYear(year) {
    const dec28 = new Date(Date.UTC(year, 11, 28));
    return isoWeek(dec28);
  }

  function escape(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

})();
