(function () {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const isPlaceholder = window.isPlaceholder || function () { return false; };
  const root = document.getElementById("voeux-root");
  if (!root) return;

  const CURRENCY = "CHF";
  const MAXIMUM_NAME_LENGTH = 80;
  const REQUEST_TIMEOUT_MILLISECONDS = 20000;
  const COPY_FEEDBACK_MILLISECONDS = 2000;
  const ITEMS_URL = "data/voeux.json";
  const PAYMENT_BLOCK_ID = "voeux-paiement";

  const isDemoMode = isPlaceholder(config.APPS_SCRIPT_URL) || !config.APPS_SCRIPT_URL;
  const pledgedByItemId = new Map();
  const cardControllers = [];
  let areTotalsLoading = true;

  function el(tagName, properties, children) {
    const element = document.createElement(tagName);
    const props = properties || {};
    Object.keys(props).forEach(function (key) {
      if (key === "className") element.className = props[key];
      else if (key === "text") element.textContent = props[key];
      else if (props[key] === true) element.setAttribute(key, "");
      else if (props[key] !== false && props[key] != null) element.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) {
      if (child) element.appendChild(child);
    });
    return element;
  }

  function formatAmount(amount) {
    return String(Math.round(amount * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + CURRENCY;
  }

  function remainingFor(item) {
    if (!pledgedByItemId.has(item.id)) return null;
    return Math.max(0, item.price - pledgedByItemId.get(item.id));
  }

  function describeRemaining(item) {
    const remaining = remainingFor(item);
    if (remaining === null) return areTotalsLoading ? "Chargement du montant restant…" : "Montant restant indisponible";
    if (remaining <= 0) return "Complet ✓";
    if (remaining >= item.price) return "Reste " + formatAmount(remaining);
    return "Reste " + formatAmount(remaining) + " sur " + formatAmount(item.price);
  }

  function isValidItem(item) {
    return Boolean(item) && typeof item.id === "string" && item.id !== ""
      && typeof item.title === "string" && typeof item.price === "number"
      && Number.isFinite(item.price) && item.price > 0;
  }

  function isTotalsObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MILLISECONDS);
    try {
      const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function postJson(payload) {
    return fetchWithTimeout(config.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
  }

  function simulateDemoPledge(item, amount) {
    const pledged = pledgedByItemId.get(item.id) || 0;
    const remaining = Math.max(0, item.price - pledged);
    if (amount > remaining) return { ok: false, error: "depasse", remaining: remaining };
    return { ok: true, pledged: pledged + amount, remaining: remaining - amount };
  }

  async function loadTotals(items) {
    if (isDemoMode) {
      items.forEach(function (item) {
        if (!pledgedByItemId.has(item.id)) pledgedByItemId.set(item.id, 0);
      });
      return true;
    }
    try {
      const separator = config.APPS_SCRIPT_URL.indexOf("?") === -1 ? "?" : "&";
      const totals = await fetchWithTimeout(config.APPS_SCRIPT_URL + separator + "action=totals", { method: "GET" });
      if (!isTotalsObject(totals)) throw new Error("totaux invalides");
      items.forEach(function (item) {
        const pledged = Number(totals[item.id]);
        pledgedByItemId.set(item.id, Number.isFinite(pledged) && pledged > 0 ? pledged : 0);
      });
      return true;
    } catch (error) {
      console.warn("[voeux] totaux indisponibles :", error);
      return false;
    }
  }

  function createInput(cardId, options) {
    const inputId = cardId + "-" + options.name;
    const input = el(options.multiline ? "textarea" : "input", {
      id: inputId,
      name: options.name,
      type: options.type || "text",
      autocomplete: options.autocomplete || "off",
      inputmode: options.inputMode,
      maxlength: options.maxLength,
      rows: options.rows,
      "aria-describedby": inputId + "-error",
    });
    const errorLine = el("p", { className: "form-error", id: inputId + "-error", role: "alert", hidden: true });
    input.addEventListener("input", function () {
      errorLine.hidden = true;
      errorLine.textContent = "";
      input.removeAttribute("aria-invalid");
    });
    const labelText = options.label + (options.optional ? " (facultatif)" : "");
    return {
      input: input,
      root: el("div", { className: "form-field" }, [
        el("label", { className: "form-label", for: inputId, text: labelText }),
        input,
        errorLine,
      ]),
      error: function (message) {
        errorLine.textContent = message;
        errorLine.hidden = false;
        input.setAttribute("aria-invalid", "true");
      },
    };
  }

  function createCard(item, index) {
    const cardId = "voeu-" + index;
    const remainingText = el("p", { className: "voeu-remaining", id: cardId + "-remaining" });
    const progressFill = el("div", { className: "voeu-progress-fill" });
    const progressBar = el("div", { className: "voeu-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-labelledby": cardId + "-remaining" }, [progressFill]);
    const statusLine = el("p", { className: "form-status", role: "status", "aria-live": "polite" });

    const amountField = createInput(cardId, { name: "montant", label: "Montant (CHF)", type: "number", inputMode: "numeric" });
    amountField.input.min = "1";
    amountField.input.step = "1";
    const nameField = createInput(cardId, { name: "nom", label: "Votre nom", autocomplete: "name", maxLength: MAXIMUM_NAME_LENGTH });
    const honeypotInput = el("input", { type: "text", name: "website", id: cardId + "-website", tabindex: "-1", autocomplete: "off" });
    const honeypot = el("div", { className: "form-honeypot", "aria-hidden": "true" }, [
      el("label", { for: cardId + "-website", text: "Ne pas remplir ce champ" }),
      honeypotInput,
    ]);
    const amountHint = el("p", { className: "form-hint" });
    const submitButton = el("button", { type: "submit", className: "form-button", text: "Participer" });

    const form = el("form", { className: "form voeu-form", novalidate: true }, [
      honeypot, amountField.root, amountHint, nameField.root, submitButton,
    ]);
    const details = el("details", { className: "voeu-details" }, [
      el("summary", { className: "voeu-summary", text: "Participer à ce cadeau" }),
      form,
    ]);
    const priceText = el("p", { className: "voeu-price", text: formatAmount(item.price) });
    const card = el("article", { className: "voeu-card", "data-item-id": item.id }, [
      el("div", { className: "voeu-body" }, [
        el("h3", { className: "voeu-title", text: item.title }),
        item.description ? el("p", { className: "voeu-description", text: item.description }) : null,
        priceText,
        progressBar,
        remainingText,
      ]),
      details,
      statusLine,
    ]);

    let isSending = false;

    function refresh() {
      const remaining = remainingFor(item);
      const ratio = remaining === null ? 0 : Math.min(1, Math.max(0, 1 - remaining / item.price));
      const isComplete = remaining !== null && remaining <= 0;
      remainingText.textContent = describeRemaining(item);
      remainingText.classList.toggle("voeu-remaining--complete", isComplete);
      progressFill.style.width = Math.round(ratio * 100) + "%";
      progressBar.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      progressBar.hidden = remaining === null;
      card.classList.toggle("voeu-card--complete", isComplete);
      details.hidden = isComplete;
      if (remaining === null) {
        amountField.input.removeAttribute("max");
        amountField.input.placeholder = "Ex. " + Math.max(1, Math.round(item.price / 2));
        amountHint.textContent = "Montant libre en francs suisses (entier).";
        return;
      }
      const maximumAmount = Math.floor(remaining);
      amountField.input.max = String(maximumAmount);
      amountField.input.placeholder = String(maximumAmount);
      amountHint.textContent = "Entre 1 et " + maximumAmount + " CHF (reste à financer : " + formatAmount(remaining) + ").";
    }

    function setStatus(text, tone) {
      statusLine.textContent = "";
      statusLine.className = "form-status" + (tone ? " form-status--" + tone : "");
      if (text) statusLine.appendChild(document.createTextNode(text));
    }

    function showThanks() {
      statusLine.className = "form-status form-status--success";
      statusLine.textContent = "";
      statusLine.appendChild(document.createTextNode(
        "Merci ! Pour finaliser, effectuez votre don par Twint ou virement en indiquant « " + item.title + " » en référence. ",
      ));
      statusLine.appendChild(el("a", { href: "#" + PAYMENT_BLOCK_ID, text: "Voir les coordonnées" }));
    }

    function validate() {
      let firstInvalidInput = null;
      function fail(field, message) {
        field.error(message);
        if (!firstInvalidInput) firstInvalidInput = field.input;
      }
      const amountText = amountField.input.value.trim();
      const amount = Number(amountText);
      const remaining = remainingFor(item);
      if (!/^\d+$/.test(amountText) || amount < 1) {
        fail(amountField, "Indiquez un montant entier d'au moins 1 CHF.");
      } else if (remaining !== null && amount > Math.floor(remaining)) {
        fail(amountField, "Ce montant dépasse le reste à financer (" + formatAmount(remaining) + ").");
      }
      if (!nameField.input.value.trim()) fail(nameField, "Veuillez indiquer votre nom.");
      if (firstInvalidInput) firstInvalidInput.focus();
      return firstInvalidInput === null;
    }

    function buildPayload() {
      return {
        type: "voeu",
        itemId: item.id,
        itemTitle: item.title,
        price: item.price,
        amount: Number(amountField.input.value.trim()),
        nom: nameField.input.value.trim(),
        submittedAt: new Date().toISOString(),
      };
    }

    function applyRemainingFromServer(result) {
      if (typeof result.pledged === "number") {
        pledgedByItemId.set(item.id, result.pledged);
      } else if (typeof result.remaining === "number") {
        pledgedByItemId.set(item.id, Math.max(0, item.price - result.remaining));
      }
    }

    async function handleSubmit(event) {
      event.preventDefault();
      if (isSending) return;
      setStatus("");
      if (honeypotInput.value) return;
      if (!validate()) return;

      const payload = buildPayload();
      isSending = true;
      submitButton.disabled = true;
      submitButton.textContent = "Envoi en cours…";
      try {
        let result;
        if (isDemoMode) {
          console.info("[voeux] mode démo, payload non envoyé :", payload);
          result = simulateDemoPledge(item, payload.amount);
        } else {
          result = await postJson(payload);
        }
        if (result && result.ok) {
          applyRemainingFromServer(result);
          form.reset();
          refresh();
          showThanks();
          if (!isDemoMode) refreshTotals();
        } else if (result && result.error === "depasse") {
          applyRemainingFromServer({ remaining: Number(result.remaining) || 0 });
          refresh();
          setStatus("Ce montant dépasse désormais le reste à financer (" + formatAmount(Number(result.remaining) || 0) + "). Merci d'ajuster votre participation.", "error");
        } else {
          throw new Error((result && result.error) || "réponse invalide");
        }
      } catch (error) {
        console.error("[voeux] échec de l'envoi :", error);
        setStatus("L'envoi a échoué. Veuillez réessayer dans un instant, ou contactez-nous directement.", "error");
      } finally {
        isSending = false;
        submitButton.disabled = false;
        submitButton.textContent = "Participer";
      }
    }

    form.addEventListener("submit", handleSubmit);
    refresh();
    return { element: card, refresh: refresh };
  }

  async function refreshTotals() {
    const items = cardControllers.map(function (controller) { return controller.item; });
    const hasTotals = await loadTotals(items);
    if (hasTotals) cardControllers.forEach(function (controller) { controller.refresh(); });
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.warn("[voeux] clipboard indisponible, repli :", error);
      }
    }
    const scratch = el("textarea", { readonly: true, "aria-hidden": "true", tabindex: "-1" });
    scratch.value = text;
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    let isCopied = false;
    try {
      isCopied = document.execCommand("copy");
    } catch (error) {
      isCopied = false;
    }
    document.body.removeChild(scratch);
    return isCopied;
  }

  function createPaymentRow(label, value) {
    const isMissing = !value || isPlaceholder(value);
    const valueElement = isMissing
      ? el("span", { className: "placeholder", text: value || "[À COMPLÉTER]" })
      : el("span", { className: "payment-value", text: value });
    const copyButton = el("button", {
      type: "button", className: "form-button form-button--ghost form-button--small",
      text: "Copier", disabled: isMissing,
      "aria-label": "Copier : " + label,
    });
    copyButton.addEventListener("click", async function () {
      const isCopied = await copyText(value);
      copyButton.textContent = isCopied ? "Copié ✓" : "Copie impossible";
      setTimeout(function () { copyButton.textContent = "Copier"; }, COPY_FEEDBACK_MILLISECONDS);
    });
    return el("div", { className: "payment-row" }, [
      el("div", { className: "payment-text" }, [
        el("span", { className: "form-label", text: label }),
        valueElement,
      ]),
      copyButton,
    ]);
  }

  function createPaymentBlock() {
    return el("section", { className: "payment", id: PAYMENT_BLOCK_ID }, [
      el("h3", { className: "payment-title", text: "Comment régler ?" }),
      el("p", {
        className: "payment-intro",
        text: "Votre participation ci-dessus est une déclaration : le don effectif se fait ensuite par Twint ou par virement, en indiquant le titre du cadeau en référence.",
      }),
      createPaymentRow("Twint", config.TWINT),
      createPaymentRow("IBAN Suisse", config.IBAN_CH),
      createPaymentRow("IBAN France", config.IBAN_FR),
      createPaymentRow("Titulaire du compte", config.ACCOUNT_HOLDER),
    ]);
  }

  async function loadItems() {
    const response = await fetch(ITEMS_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("format invalide");
    return items.filter(function (item) {
      if (isValidItem(item)) return true;
      console.warn("[voeux] élément ignoré (id, titre ou prix invalide) :", item);
      return false;
    });
  }

  async function init() {
    const list = el("div", { className: "voeux-list" });
    root.appendChild(el("p", { className: "form-hint", role: "status", text: "Chargement de la liste…" }));
    let items;
    try {
      items = await loadItems();
    } catch (error) {
      console.error("[voeux] liste indisponible :", error);
      root.textContent = "";
      root.appendChild(el("p", { className: "form-notice", role: "status", text: "La liste de voeux est momentanément indisponible. Merci de revenir un peu plus tard." }));
      return;
    }

    root.textContent = "";
    if (isDemoMode) {
      root.appendChild(el("p", { className: "form-banner", role: "status", text: "Mode démo : les participations ne sont pas enregistrées (mémoire de cette page uniquement)." }));
    }
    items.forEach(function (item, index) {
      const controller = createCard(item, index);
      controller.item = item;
      cardControllers.push(controller);
      list.appendChild(controller.element);
    });
    root.appendChild(list);
    root.appendChild(createPaymentBlock());

    await loadTotals(items);
    areTotalsLoading = false;
    cardControllers.forEach(function (controller) { controller.refresh(); });
  }

  init();
})();
