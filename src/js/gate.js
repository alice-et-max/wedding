// Verrou « dîner » partagé par le formulaire de présence (rsvp.js) et le plan de table (plan.js).
// Le mot de passe est comparé à son empreinte SHA-256 (SITE_CONFIG.DINNER_PASSWORD_SHA256) dans le
// navigateur : c'est un simple filtre de confort, pas une vraie protection (voir README.md).
(function () {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const STORAGE_KEY = "alice-maxime-diner-unlock";
  const UNLOCK_EVENT = "diner-unlocked";

  function expectedHash() {
    return String(config.DINNER_PASSWORD_SHA256 || "").trim().toLowerCase();
  }

  function isConfigured() {
    const isPlaceholder = window.isPlaceholder || function () { return false; };
    return Boolean(expectedHash()) && !isPlaceholder(config.DINNER_PASSWORD_SHA256);
  }

  function hasSubtleCrypto() {
    return Boolean(window.crypto && window.crypto.subtle && window.TextEncoder);
  }

  async function sha256Hex(text) {
    const bytes = new window.TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  async function matchesPassword(typedPassword) {
    return (await sha256Hex(typedPassword)) === expectedHash();
  }

  // On mémorise l'empreinte attendue : si le mot de passe change, l'ancien déverrouillage devient caduc.
  function isUnlocked() {
    if (!isConfigured()) return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === expectedHash();
    } catch (error) {
      return false;
    }
  }

  function markUnlocked() {
    try {
      window.localStorage.setItem(STORAGE_KEY, expectedHash());
    } catch (error) {
      // Stockage indisponible (navigation privée...) : le déverrouillage dure seulement le temps de la page.
    }
    window.DinnerGate.unlockedThisPage = true;
    window.dispatchEvent(new CustomEvent(UNLOCK_EVENT));
  }

  window.DinnerGate = {
    UNLOCK_EVENT: UNLOCK_EVENT,
    unlockedThisPage: false,
    isConfigured: isConfigured,
    hasSubtleCrypto: hasSubtleCrypto,
    sha256Hex: sha256Hex,
    matchesPassword: matchesPassword,
    isUnlocked: function () { return window.DinnerGate.unlockedThisPage || isUnlocked(); },
    markUnlocked: markUnlocked,
  };
})();
