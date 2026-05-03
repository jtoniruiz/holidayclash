/* ==========================================================================
   HolidayClash — main script
   - fetches public holidays from Nager.Date
   - renders a multi-country, year-at-a-glance calendar
   - flags clashes (multiple countries off same day) and long weekends
   ========================================================================== */

(function () {
  "use strict";

  const API_BASE = "https://date.nager.at/api/v3";
  const COUNTRIES_ENDPOINT = `${API_BASE}/AvailableCountries`;
  const HOLIDAYS_ENDPOINT  = (year, code) => `${API_BASE}/PublicHolidays/${year}/${code}`;

  // simple in-memory cache so we don't re-fetch the same country/year
  const cache = new Map();

  // app state
  const state = {
    countries: [],          // [{code, name}]
    selected: [],           // [{code, name}]
    year: new Date().getFullYear(),
    holidaysByCountry: {},  // { CC: [holiday, ...] }
  };

  // --- DOM refs ---
  const $countrySelect = document.getElementById("country-select");
  const $yearSelect    = document.getElementById("year-select");
  const $addBtn        = document.getElementById("add-country");
  const $selected      = document.getElementById("selected-countries");
  const $results       = document.getElementById("results");
  const $year          = document.getElementById("year");

  // --- INIT ---
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
    $countrySelect.addEventListener("change", () => {
      // pressing Enter in some browsers triggers add via change — ignore here, button handles it.
    });
    $yearSelect.addEventListener("change", onYearChange);

    // preset country combos
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
    // shape: [{ countryCode: "AT", name: "Austria" }, ...]
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

    // Compute summary
    const allDates = Object.keys(byDate);
    const clashDates = allDates.filter(d => byDate[d].length >= 2);
    const longWeekendDates = computeLongWeekendDates(allDates);

    // Compute "clean weeks" (ISO weeks with no holiday in any selected country)
    const cleanWeekCount = computeCleanWeekCount(state.year, byDate);

    // Build month cards
    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthCards = months.map(monthIndex =>
      buildMonthCard(monthIndex, byDate, clashDates, longWeekendDates)
    ).join("");

    $results.innerHTML = `
      <div class="results-summary">
        <div class="summary-pill">
          <strong>${allDates.length}</strong>
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

      <div class="year-grid">${monthCards}</div>

      <div class="legend">
        <span class="legend-item"><span class="legend-dot clash"></span> Clash — 2+ countries off the same day</span>
        <span class="legend-item"><span class="legend-dot long-weekend"></span> Long weekend trigger (★)</span>
        <span class="legend-item"><span class="legend-dot clean"></span> Clean week — no holiday in any selected country</span>
      </div>
    `;
  }

  function buildMonthCard(monthIndex, byDate, clashDates, longWeekendDates) {
    const monthName = new Date(state.year, monthIndex, 1).toLocaleString("en-US", { month: "long" });

    // Filter holidays in this month
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
        const isClash = list.length >= 2;
        const isLongWeekend = longWeekendDates.includes(date);

        let cls = "holiday-item";
        if (isClash) cls += " clash";
        else if (isLongWeekend) cls += " long-weekend";

        // Show first holiday name; if multiple countries, indicate count
        const first = list[0].holiday;
        const flagBadges = list.map(({ country }) =>
          `<span class="flag-badge">${escape(country.code)}</span>`
        ).join("");

        return `
          <li class="${cls}">
            <span class="holiday-date">${day}</span>
            <span class="holiday-name">${escape(first.name)}${list.length > 1 ? ` <em class="muted small">+ ${list.length - 1} more</em>` : ""}</span>
            <span class="holiday-flags">${flagBadges}</span>
          </li>
        `;
      }).join("");

      body = `<ul class="holiday-list">${items}</ul>`;
      tag = entries.length >= 3
        ? `<span class="month-tag busy">BUSY</span>`
        : "";
    }

    return `
      <article class="month-card">
        <h3 class="month-name">${escape(monthName)} ${tag}</h3>
        ${body}
      </article>
    `;
  }

  // --- HELPERS ---

  /**
   * A "long weekend trigger" is a public holiday that falls on
   * Friday or Monday (extending the weekend to 3 days),
   * or on Thursday/Tuesday (creating a potential bridge).
   */
  function computeLongWeekendDates(dateStrings) {
    return dateStrings.filter(d => {
      const day = new Date(d + "T00:00:00Z").getUTCDay(); // 0=Sun ... 6=Sat
      // Mon (1), Tue (2), Thu (4), Fri (5)
      return [1, 2, 4, 5].includes(day);
    });
  }

  /**
   * Count ISO weeks of the year that have ZERO holidays
   * in any selected country.
   */
  function computeCleanWeekCount(year, byDate) {
    // Build set of week numbers that DO have a holiday
    const dirtyWeeks = new Set();
    for (const dateStr of Object.keys(byDate)) {
      const wk = isoWeek(new Date(dateStr + "T00:00:00Z"));
      dirtyWeeks.add(wk);
    }
    const totalWeeks = isoWeeksInYear(year);
    return Math.max(0, totalWeeks - dirtyWeeks.size);
  }

  function isoWeek(d) {
    // Copy date so we don't mutate
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    // Get first day of year
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function isoWeeksInYear(year) {
    // ISO week year has 53 weeks if year starts on Thursday or is a leap year that starts on Wednesday
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
