/**
 * Backend du site de mariage Alice & Maxime (Google Apps Script lié à un Google Sheet).
 * Voir README.md pour l'installation pas à pas.
 *
 * - doPost : reçoit les réponses (type "rsvp") et les participations (type "voeu").
 * - doGet  : ?action=totals renvoie { "<id du voeu>": montant_total_promis }.
 *
 * Toutes les données envoyées par le navigateur sont traitées comme non fiables.
 */

// ---- À COMPLÉTER ------------------------------------------------------------
const NOTIFY_EMAILS = ["[EMAIL ALICE]", "[EMAIL MAX]"];
const SITE_BASE_URL = "https://alice-et-max.github.io/wedding/";
// -----------------------------------------------------------------------------

const SHEET_RSVP = "Réponses";
const SHEET_VOEUX = "Voeux";
const HEADERS_RSVP = ["date", "nom", "prénom", "email", "personnes", "adresse", "présent", "invité dîner", "présent dîner"];
const HEADERS_VOEUX = ["date", "item_id", "item_titre", "montant", "nom", "Reçu"];
const COLUMN_VOEUX_ITEM_ID = 2;
const COLUMN_VOEUX_AMOUNT = 4;
const COLUMN_VOEUX_RECEIVED = 6;

const TIME_ZONE = "Europe/Zurich";
const CURRENCY = "CHF";
const LOCK_WAIT_MILLISECONDS = 10000;
const TOTALS_CACHE_KEY = "totals";
const TOTALS_CACHE_SECONDS = 30;
const PRICES_PROPERTY_KEY = "ITEM_PRICES";
const PRICES_SYNCED_AT_PROPERTY_KEY = "ITEM_PRICES_SYNCED_AT";
const PRICES_MAXIMUM_AGE_MILLISECONDS = 60 * 60 * 1000;

const MAXIMUM_BODY_LENGTH = 10000;
const MAXIMUM_NAME_LENGTH = 80;
const MAXIMUM_EMAIL_LENGTH = 120;
const MAXIMUM_ADDRESS_LENGTH = 300;
const MAXIMUM_ITEM_ID_LENGTH = 100;
const MAXIMUM_ITEM_TITLE_LENGTH = 200;
const MAXIMUM_PERSONS = 10;
const MAXIMUM_AMOUNT = 100000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * ITEM_PRICES : prix des cadeaux, pour refuser un montant supérieur au reste à financer.
 * Source de vérité : src/data/voeux.json, récupéré depuis le site par syncPricesFromSite()
 * puis mémorisé dans les propriétés du script (rafraîchi automatiquement toutes les heures
 * lors d'une participation). Si la synchronisation est impossible, le prix envoyé par le
 * navigateur est utilisé en dernier recours (moins sûr : voir README).
 */

// ---- Points d'entrée web -----------------------------------------------------

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body || body.length > MAXIMUM_BODY_LENGTH) return jsonResponse({ ok: false, error: "requete_invalide" });

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      return jsonResponse({ ok: false, error: "json_invalide" });
    }
    if (!payload || typeof payload !== "object") return jsonResponse({ ok: false, error: "requete_invalide" });

    if (payload.type === "rsvp") return jsonResponse(handleRsvp(payload));
    if (payload.type === "voeu") return jsonResponse(handleVoeu(payload));
    return jsonResponse({ ok: false, error: "type_inconnu" });
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return jsonResponse({ ok: false, error: "serveur" });
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "totals") return jsonResponse(getTotalsCached());
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return jsonResponse({ ok: false, error: "serveur" });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Validation --------------------------------------------------------------

function cleanSingleLine(value, maximumLength) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maximumLength ? text : null;
}

function cleanMultiLine(value, maximumLength) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n/g, "\n").trim();
  return text.length <= maximumLength ? text : null;
}

function isValidEmail(email) {
  return typeof email === "string" && email.length <= MAXIMUM_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

/** Empêche l'interprétation d'une cellule comme formule par Google Sheets. */
function safeCell(value) {
  if (typeof value !== "string") return value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function nowText() {
  return Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
}

function validateRsvp(payload) {
  const nom = cleanSingleLine(payload.nom, MAXIMUM_NAME_LENGTH);
  const prenom = cleanSingleLine(payload.prenom, MAXIMUM_NAME_LENGTH);
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const adresse = cleanMultiLine(payload.adresse, MAXIMUM_ADDRESS_LENGTH);
  const personnes = payload.personnes;

  if (!nom || !prenom) return { error: "nom_requis" };
  if (!isValidEmail(email)) return { error: "email_invalide" };
  if (typeof payload.present !== "boolean") return { error: "present_invalide" };
  if (typeof payload.dinerInvite !== "boolean") return { error: "diner_invalide" };
  if (payload.dinerPresent !== null && typeof payload.dinerPresent !== "boolean") return { error: "diner_invalide" };
  if (adresse === null) return { error: "texte_trop_long" };
  if (typeof personnes !== "number" || Math.floor(personnes) !== personnes || personnes < 0 || personnes > MAXIMUM_PERSONS) {
    return { error: "personnes_invalide" };
  }
  if (payload.present && (personnes < 1 || adresse.length === 0)) return { error: "champs_requis" };

  return {
    value: {
      nom: nom,
      prenom: prenom,
      email: email,
      personnes: personnes,
      adresse: adresse,
      present: payload.present,
      dinerInvite: payload.dinerInvite,
      dinerPresent: payload.dinerInvite ? payload.dinerPresent : null,
    },
  };
}

function validateVoeu(payload) {
  const itemId = cleanSingleLine(payload.itemId, MAXIMUM_ITEM_ID_LENGTH);
  const itemTitle = cleanSingleLine(payload.itemTitle, MAXIMUM_ITEM_TITLE_LENGTH);
  const nom = cleanSingleLine(payload.nom, MAXIMUM_NAME_LENGTH);
  const amount = payload.amount;

  if (!itemId || !itemTitle) return { error: "item_invalide" };
  if (!nom) return { error: "nom_requis" };
  if (typeof amount !== "number" || Math.floor(amount) !== amount || amount < 1 || amount > MAXIMUM_AMOUNT) {
    return { error: "montant_invalide" };
  }
  const claimedPrice = typeof payload.price === "number" && isFinite(payload.price) && payload.price > 0 ? payload.price : null;

  return {
    value: {
      itemId: itemId,
      itemTitle: itemTitle,
      amount: amount,
      nom: nom,
      claimedPrice: claimedPrice,
    },
  };
}

// ---- Feuilles ----------------------------------------------------------------

function getSheet(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function computeTotals() {
  const sheet = getSheet(SHEET_VOEUX, HEADERS_VOEUX);
  const rowCount = sheet.getLastRow() - 1;
  const totals = {};
  if (rowCount < 1) return totals;
  const values = sheet.getRange(2, 1, rowCount, HEADERS_VOEUX.length).getValues();
  values.forEach(function (row) {
    const itemId = String(row[COLUMN_VOEUX_ITEM_ID - 1]).trim();
    const amount = Number(row[COLUMN_VOEUX_AMOUNT - 1]);
    if (!itemId || !isFinite(amount) || amount <= 0) return;
    totals[itemId] = (totals[itemId] || 0) + amount;
  });
  return totals;
}

function getTotalsCached() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(TOTALS_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const totals = computeTotals();
  cache.put(TOTALS_CACHE_KEY, JSON.stringify(totals), TOTALS_CACHE_SECONDS);
  return totals;
}

function invalidateTotalsCache() {
  CacheService.getScriptCache().remove(TOTALS_CACHE_KEY);
}

// ---- Prix des cadeaux --------------------------------------------------------

function isSiteBaseUrlConfigured() {
  return typeof SITE_BASE_URL === "string" && /^https?:\/\//.test(SITE_BASE_URL);
}

/**
 * Récupère data/voeux.json sur le site publié et mémorise { id: prix }.
 * À lancer à la main après avoir modifié voeux.json (facultatif : rafraîchi aussi
 * automatiquement toutes les heures). Renvoie true si la synchronisation a réussi.
 */
function syncPricesFromSite() {
  if (!isSiteBaseUrlConfigured()) return false;
  try {
    const baseUrl = SITE_BASE_URL.replace(/\/?$/, "/");
    const response = UrlFetchApp.fetch(baseUrl + "data/voeux.json", { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return false;
    const items = JSON.parse(response.getContentText());
    if (!Array.isArray(items)) return false;
    const prices = {};
    items.forEach(function (item) {
      if (item && typeof item.id === "string" && typeof item.price === "number" && item.price > 0) {
        prices[item.id] = item.price;
      }
    });
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(PRICES_PROPERTY_KEY, JSON.stringify(prices));
    properties.setProperty(PRICES_SYNCED_AT_PROPERTY_KEY, String(Date.now()));
    return true;
  } catch (error) {
    console.error("syncPricesFromSite : " + error);
    return false;
  }
}

function readStoredPrices() {
  const properties = PropertiesService.getScriptProperties();
  const rawPrices = properties.getProperty(PRICES_PROPERTY_KEY);
  const syncedAt = Number(properties.getProperty(PRICES_SYNCED_AT_PROPERTY_KEY)) || 0;
  return { prices: rawPrices ? JSON.parse(rawPrices) : {}, syncedAt: syncedAt };
}

/**
 * Prix de référence d'un cadeau : synchronisé depuis le site si possible
 * (rafraîchi si absent ou de plus d'une heure), sinon prix annoncé par le navigateur.
 */
function resolveItemPrice(itemId, claimedPrice) {
  let stored = readStoredPrices();
  const isStale = Date.now() - stored.syncedAt > PRICES_MAXIMUM_AGE_MILLISECONDS;
  const isKnown = Object.prototype.hasOwnProperty.call(stored.prices, itemId);
  let didSync = false;
  if (isStale || !isKnown) {
    didSync = syncPricesFromSite();
    if (didSync) stored = readStoredPrices();
  }
  if (Object.prototype.hasOwnProperty.call(stored.prices, itemId)) return stored.prices[itemId];
  return didSync ? null : claimedPrice;
}

// ---- RSVP --------------------------------------------------------------------

function yesNo(value) {
  return value ? "oui" : "non";
}

function sendNotification(subject, body, replyTo) {
  const recipients = NOTIFY_EMAILS.filter(function (address) { return isValidEmail(address); });
  if (recipients.length === 0) {
    console.warn("NOTIFY_EMAILS non configuré : aucun email envoyé.");
    return;
  }
  try {
    const options = { to: recipients.join(","), subject: subject, body: body, name: "Site de mariage" };
    if (isValidEmail(replyTo)) options.replyTo = replyTo;
    MailApp.sendEmail(options);
  } catch (error) {
    console.error("Envoi email impossible : " + error);
  }
}

function handleRsvp(payload) {
  const checked = validateRsvp(payload);
  if (checked.error) return { ok: false, error: checked.error };
  const reply = checked.value;

  const sheet = getSheet(SHEET_RSVP, HEADERS_RSVP);
  sheet.appendRow([
    nowText(),
    safeCell(reply.nom),
    safeCell(reply.prenom),
    safeCell(reply.email),
    reply.personnes,
    safeCell(reply.adresse),
    yesNo(reply.present),
    yesNo(reply.dinerInvite),
    reply.dinerInvite ? yesNo(reply.dinerPresent) : "",
  ]);

  const lines = [
    "Nouvelle réponse au faire-part",
    "",
    "Nom : " + reply.prenom + " " + reply.nom,
    "Email : " + reply.email,
    "Présent(e) : " + yesNo(reply.present),
    "Nombre de personnes : " + reply.personnes,
    "Adresse : " + (reply.adresse || "(non renseignée)"),
    "Invité(e) au dîner : " + yesNo(reply.dinerInvite),
    "Présent(e) au dîner : " + (reply.dinerInvite ? yesNo(reply.dinerPresent) : "(sans objet)"),
  ];
  sendNotification("Nouvelle réponse : " + reply.prenom + " " + reply.nom + " — " + yesNo(reply.present), lines.join("\n"), reply.email);
  return { ok: true };
}

// ---- Voeux -------------------------------------------------------------------

function handleVoeu(payload) {
  const checked = validateVoeu(payload);
  if (checked.error) return { ok: false, error: checked.error };
  const pledge = checked.value;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MILLISECONDS);
  } catch (lockError) {
    return { ok: false, error: "occupe" };
  }

  try {
    const price = resolveItemPrice(pledge.itemId, pledge.claimedPrice);
    if (typeof price !== "number" || !isFinite(price) || price <= 0) return { ok: false, error: "item_inconnu" };

    const alreadyPledged = computeTotals()[pledge.itemId] || 0;
    const remaining = Math.max(0, price - alreadyPledged);
    if (pledge.amount > remaining) return { ok: false, error: "depasse", remaining: remaining };

    const sheet = getSheet(SHEET_VOEUX, HEADERS_VOEUX);
    sheet.appendRow([
      nowText(),
      safeCell(pledge.itemId),
      safeCell(pledge.itemTitle),
      pledge.amount,
      safeCell(pledge.nom),
      false,
    ]);
    sheet.getRange(sheet.getLastRow(), COLUMN_VOEUX_RECEIVED).insertCheckboxes();
    SpreadsheetApp.flush();
    invalidateTotalsCache();

    const pledged = alreadyPledged + pledge.amount;
    const newRemaining = Math.max(0, price - pledged);
    const lines = [
      "Nouvelle participation à la liste de voeux",
      "",
      "Cadeau : " + pledge.itemTitle + " (" + pledge.itemId + ")",
      "Montant promis : " + pledge.amount + " " + CURRENCY,
      "Total promis pour ce cadeau : " + pledged + " sur " + price + " " + CURRENCY + " (reste " + newRemaining + " " + CURRENCY + ")",
      "De la part de : " + pledge.nom,
      "",
      "Rappel : il s'agit d'une promesse. Cochez la colonne « Reçu » du Sheet quand le paiement est arrivé.",
    ];
    sendNotification("Nouvelle participation : " + pledge.amount + " " + CURRENCY + " pour " + pledge.itemTitle, lines.join("\n"));
    return { ok: true, pledged: pledged, remaining: newRemaining };
  } finally {
    lock.releaseLock();
  }
}

// ---- Tests manuels (à lancer depuis l'éditeur Apps Script) -------------------

function testRsvp() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        type: "rsvp", nom: "Test", prenom: "Essai", email: "essai@example.com", personnes: 2,
        adresse: "Rue du Test 1, 1000 Lausanne, Suisse", present: true, dinerInvite: true,
        dinerPresent: true, submittedAt: new Date().toISOString(),
      }),
    },
  };
  console.log(doPost(fakeEvent).getContent());
}

function testVoeu() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        type: "voeu", itemId: "test-item", itemTitle: "Cadeau de test", price: 100, amount: 10,
        nom: "Essai Test",
        submittedAt: new Date().toISOString(),
      }),
    },
  };
  console.log(doPost(fakeEvent).getContent());
  console.log(JSON.stringify(getTotalsCached()));
}
