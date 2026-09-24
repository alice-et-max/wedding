(function () {
  "use strict";

  const MILLISECONDS_PER_SECOND = 1000;
  const SECONDS_PER_MINUTE = 60;
  const SECONDS_PER_HOUR = 3600;
  const SECONDS_PER_DAY = 86400;
  const TICK_INTERVAL_MS = 1000;
  const COUNTDOWN_LABEL = "Compte à rebours avant le mariage";

  const UNITS = [
    { key: "days", singular: "jour", plural: "jours" },
    { key: "hours", singular: "heure", plural: "heures" },
    { key: "minutes", singular: "minute", plural: "minutes" },
    { key: "seconds", singular: "seconde", plural: "secondes" },
  ];

  function splitRemaining(remainingMs) {
    const totalSeconds = Math.floor(remainingMs / MILLISECONDS_PER_SECOND);
    return {
      days: Math.floor(totalSeconds / SECONDS_PER_DAY),
      hours: Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR),
      minutes: Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
      seconds: totalSeconds % SECONDS_PER_MINUTE,
    };
  }

  function formatValue(unit, value) {
    return unit.key === "days" ? String(value) : String(value).padStart(2, "0");
  }

  function buildMessage(text, note) {
    const wrapper = document.createElement("div");
    wrapper.className = "countdown-message";

    const message = document.createElement("p");
    message.className = "countdown-headline";
    message.textContent = text;
    wrapper.appendChild(message);

    if (note) {
      const noteElement = document.createElement("p");
      noteElement.className = "countdown-note";
      noteElement.innerHTML = note;
      wrapper.appendChild(noteElement);
    }
    return wrapper;
  }

  function buildGrid() {
    const grid = document.createElement("div");
    grid.className = "countdown-grid";
    grid.setAttribute("role", "timer");
    grid.setAttribute("aria-live", "off");
    grid.setAttribute("aria-label", COUNTDOWN_LABEL);

    const valueElements = {};
    const labelElements = {};

    UNITS.forEach(function (unit) {
      const cell = document.createElement("div");
      cell.className = "countdown-cell";

      const value = document.createElement("span");
      value.className = "countdown-value";
      value.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "countdown-unit";
      label.setAttribute("aria-hidden", "true");

      cell.appendChild(value);
      cell.appendChild(label);
      grid.appendChild(cell);
      valueElements[unit.key] = value;
      labelElements[unit.key] = label;
    });

    return { grid: grid, valueElements: valueElements, labelElements: labelElements };
  }

  function describeForScreenReader(parts) {
    return UNITS.map(function (unit) {
      const value = parts[unit.key];
      return value + " " + (value === 1 ? unit.singular : unit.plural);
    }).join(", ");
  }

  function startCountdown(root, targetTimestamp) {
    const built = buildGrid();
    root.replaceChildren(built.grid);

    function render() {
      const remainingMs = targetTimestamp - Date.now();
      if (remainingMs <= 0) {
        window.clearInterval(intervalId);
        root.replaceChildren(buildMessage("C’est le grand jour !"));
        return;
      }

      const parts = splitRemaining(remainingMs);
      UNITS.forEach(function (unit) {
        const value = parts[unit.key];
        built.valueElements[unit.key].textContent = formatValue(unit, value);
        built.labelElements[unit.key].textContent = value === 1 ? unit.singular : unit.plural;
      });
      built.grid.setAttribute("aria-label", COUNTDOWN_LABEL + " : " + describeForScreenReader(parts));
    }

    const intervalId = window.setInterval(render, TICK_INTERVAL_MS);
    render();
  }

  function initialise() {
    const root = document.getElementById("countdown-root");
    if (!root) return;

    const config = window.SITE_CONFIG || {};
    const targetTimestamp = config.WEDDING_DATE ? Date.parse(config.WEDDING_DATE) : NaN;

    if (Number.isNaN(targetTimestamp)) {
      const placeholderLabel = window.placeholderHTML("[DATE DU MARIAGE]");
      root.replaceChildren(buildMessage("Bientôt…", "Date à confirmer : " + placeholderLabel));
      return;
    }

    startCountdown(root, targetTimestamp);
  }

  initialise();
})();
