(function () {
  "use strict";

  function fillConfigPlaceholders() {
    const config = window.SITE_CONFIG;
    if (!config) return;

    document.querySelectorAll("[data-config]").forEach(function (element) {
      const value = config[element.dataset.config];
      if (typeof value !== "string" || value === "") return;

      if (window.isPlaceholder(value)) {
        element.innerHTML = window.placeholderHTML(value);
      } else {
        element.textContent = value;
      }
    });
  }

  fillConfigPlaceholders();
})();
