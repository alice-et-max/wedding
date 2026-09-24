// Configuration partagée du site. Toute valeur entre crochets [ ... ] est un
// PLACEHOLDER à compléter : il est affiché tel quel (souligné en pointillés) sur le site.
//
// Contrat entre les fichiers :
//  - Points de montage dans index.html : #countdown-root, #rsvp-root, #voeux-root, #photos-root
//  - Variables CSS définies dans css/style.css (:root) : --bg, --ink, --muted, --accent, --line,
//    --sand, --font-serif, --font-sans, --space-*, --radius
//  - Helper global : window.isPlaceholder(value) -> true si la valeur est un placeholder "[...]"
//  - Helper global : window.placeholderHTML(value) -> <span class="placeholder">value</span>
window.SITE_CONFIG = {
  // Date/heure de la cérémonie, ISO 8601 avec fuseau. null => placeholder "[DATE DU MARIAGE]".
  // Le 1er mai 2027 à 13h (heure de Zurich) : début de la cérémonie.
  WEDDING_DATE: "2027-05-01T13:00:00+02:00",
  WEDDING_DATE_LABEL: "1er mai 2027",
  VENUE: "[LIEU DU MARIAGE]",

  // Date limite de réponse (fin de journée, heure de Zurich). Hypothèse : 1er mars 2027.
  RSVP_DEADLINE: "2027-03-01",
  RSVP_DEADLINE_LABEL: "1er mars 2027",

  // URL de déploiement de l'Apps Script (voir README.md). Placeholder => envoi désactivé (mode démo).
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzh7izrWcZksyjCkomxHn4lbWDfeCX-VgTVRiIyrcpTh6dZdHE7oedPQCT7A0q6em-l-A/exec",

  // SHA-256 (hex) du mot de passe du dîner. Valeur de test : "mariage-test"
  DINNER_PASSWORD_SHA256: "7c43b19f142e3abb41f941e881d3aac6fdb87d62856b1e68fc3a0167db3cea09",

  // Cagnotte
  TWINT: "+41767026098",
  IBAN_CH: "[IBAN CH À COMPLÉTER]",
  IBAN_FR: "[IBAN FR À COMPLÉTER]",
  ACCOUNT_HOLDER: "[TITULAIRE DU COMPTE]",

  CONTACT: "maxime.richard1601@gmail.com / aldirle@yahoo.fr / +41767026098",
  SITE_URL: "https://alice-et-max.github.io/wedding/",
};

window.isPlaceholder = function (value) {
  return typeof value === "string" && /^\[.*\]$/.test(value.trim());
};

window.placeholderHTML = function (value) {
  const span = document.createElement("span");
  span.className = "placeholder";
  span.textContent = value;
  return span.outerHTML;
};
