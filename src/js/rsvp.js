(function () {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const isPlaceholder = window.isPlaceholder || function () { return false; };
  const gate = window.DinnerGate;
  const root = document.getElementById("rsvp-root");
  if (!root) return;

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const MINIMUM_PERSONS = 1;
  const MAXIMUM_PERSONS = 10;
  const MINIMUM_ADDRESS_LENGTH = 5;
  const MAXIMUM_NAME_LENGTH = 80;
  const MAXIMUM_EMAIL_LENGTH = 120;
  const MAXIMUM_ADDRESS_LENGTH = 300;
  const REQUEST_TIMEOUT_MILLISECONDS = 20000;

  const isDemoMode = isPlaceholder(config.APPS_SCRIPT_URL) || !config.APPS_SCRIPT_URL;

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

  function createErrorLine(fieldId) {
    return el("p", { className: "form-error", id: fieldId + "-error", role: "alert", hidden: true });
  }

  function showError(errorLine, inputs, message) {
    errorLine.textContent = message;
    errorLine.hidden = false;
    inputs.forEach(function (input) { input.setAttribute("aria-invalid", "true"); });
  }

  function clearError(errorLine, inputs) {
    errorLine.textContent = "";
    errorLine.hidden = true;
    inputs.forEach(function (input) { input.removeAttribute("aria-invalid"); });
  }

  function createTextField(options) {
    const fieldId = "rsvp-" + options.id;
    const inputAttributes = {
      id: fieldId,
      name: options.id,
      type: options.type || "text",
      autocomplete: options.autocomplete || "off",
      "aria-describedby": fieldId + "-error",
      maxlength: options.maxLength,
      min: options.min,
      max: options.max,
      step: options.step,
      inputmode: options.inputMode,
      rows: options.rows,
    };
    const input = el(options.multiline ? "textarea" : "input", inputAttributes);
    if (options.value) input.value = options.value;
    const errorLine = createErrorLine(fieldId);
    const labelText = options.label + (options.optional ? " (facultatif)" : "");
    const wrapper = el("div", { className: "form-field" }, [
      el("label", { className: "form-label", for: fieldId, text: labelText }),
      input,
      errorLine,
    ]);
    input.addEventListener("input", function () { clearError(errorLine, [input]); });
    return {
      root: wrapper,
      input: input,
      error: function (message) { showError(errorLine, [input], message); },
      clear: function () { clearError(errorLine, [input]); },
    };
  }

  function createRadioGroup(options) {
    const groupId = "rsvp-" + options.name;
    const errorLine = createErrorLine(groupId);
    const radios = options.choices.map(function (choice) {
      const radioId = groupId + "-" + choice.value;
      const input = el("input", { type: "radio", id: radioId, name: groupId, value: choice.value });
      return {
        input: input,
        label: el("label", { className: "form-choice", for: radioId }, [
          input,
          el("span", { text: choice.label }),
        ]),
      };
    });
    const inputs = radios.map(function (radio) { return radio.input; });
    const fieldset = el("fieldset", { className: "form-group", "aria-describedby": errorLine.id }, [
      el("legend", { className: "form-label", text: options.legend }),
      el("div", { className: "form-choices" }, radios.map(function (radio) { return radio.label; })),
      errorLine,
    ]);
    inputs.forEach(function (input) {
      input.addEventListener("change", function () { clearError(errorLine, inputs); });
    });
    return {
      root: fieldset,
      inputs: inputs,
      value: function () {
        const checked = inputs.filter(function (input) { return input.checked; })[0];
        return checked ? checked.value : "";
      },
      reset: function () {
        inputs.forEach(function (input) { input.checked = false; });
        clearError(errorLine, inputs);
      },
      error: function (message) { showError(errorLine, inputs, message); },
      onChange: function (callback) {
        inputs.forEach(function (input) { input.addEventListener("change", callback); });
      },
    };
  }

  function parseDeadline(deadlineText) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadlineText || "");
    if (!parts) return null;
    return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 23, 59, 59, 999);
  }

  function isDeadlinePassed() {
    const deadline = parseDeadline(config.RSVP_DEADLINE);
    return Boolean(deadline) && Date.now() > deadline.getTime();
  }

  async function postJson(url, payload) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MILLISECONDS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const demoBanner = el("p", {
    className: "form-banner",
    role: "status",
    text: "Mode démo : l'envoi n'est pas encore configuré",
  });
  const deadlineNotice = el("p", { className: "form-notice" });
  const honeypotInput = el("input", { type: "text", name: "website", id: "rsvp-website", tabindex: "-1", autocomplete: "off" });
  const honeypot = el("div", { className: "form-honeypot", "aria-hidden": "true" }, [
    el("label", { for: "rsvp-website", text: "Ne pas remplir ce champ" }),
    honeypotInput,
  ]);

  const firstNameField = createTextField({ id: "prenom", label: "Prénom", autocomplete: "given-name", maxLength: MAXIMUM_NAME_LENGTH });
  const lastNameField = createTextField({ id: "nom", label: "Nom", autocomplete: "family-name", maxLength: MAXIMUM_NAME_LENGTH });
  const emailField = createTextField({ id: "email", label: "Email", type: "email", autocomplete: "email", inputMode: "email", maxLength: MAXIMUM_EMAIL_LENGTH });
  const personsField = createTextField({
    id: "personnes", label: "Nombre de personnes", type: "number", inputMode: "numeric",
    min: MINIMUM_PERSONS, max: MAXIMUM_PERSONS, step: 1, value: "1",
  });
  const addressField = createTextField({
    id: "adresse", label: "Adresse postale", multiline: true, rows: 3,
    autocomplete: "street-address", maxLength: MAXIMUM_ADDRESS_LENGTH,
  });
  const presenceGroup = createRadioGroup({
    name: "presence",
    legend: "Serez-vous présent(e) ?",
    choices: [{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }],
  });

  const dinnerToggle = el("input", { type: "checkbox", id: "rsvp-diner-toggle", name: "dinerToggle" });
  const dinnerToggleLabel = el("label", { className: "form-choice", for: "rsvp-diner-toggle" }, [
    dinnerToggle,
    el("span", { text: "J'ai un mot de passe pour le dîner" }),
  ]);
  const passwordInput = el("input", {
    type: "password", id: "rsvp-diner-password", name: "dinerPassword",
    autocomplete: "off", "aria-describedby": "rsvp-diner-password-message",
  });
  const passwordVerifyButton = el("button", { type: "button", className: "form-button form-button--ghost", text: "Vérifier" });
  const passwordMessage = el("p", { className: "form-hint", id: "rsvp-diner-password-message", role: "status" });
  const passwordBlock = el("div", { className: "form-field", hidden: true }, [
    el("label", { className: "form-label", for: "rsvp-diner-password", text: "Mot de passe du dîner" }),
    el("div", { className: "form-inline" }, [passwordInput, passwordVerifyButton]),
    passwordMessage,
  ]);
  const dinnerPresenceGroup = createRadioGroup({
    name: "diner-presence",
    legend: "Serez-vous présent(e) au dîner ?",
    choices: [{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }],
  });
  const dinnerPresenceBlock = el("div", { hidden: true }, [dinnerPresenceGroup.root]);
  const dinnerSection = el("div", { className: "form-group" }, [
    el("p", { className: "form-label", text: "Êtes-vous invité(e) au dîner ?" }),
    dinnerToggleLabel,
    passwordBlock,
    dinnerPresenceBlock,
  ]);

  const submitButton = el("button", { type: "submit", className: "form-button", text: "Envoyer ma réponse" });
  const statusLine = el("p", { className: "form-status", role: "status", "aria-live": "polite" });

  const form = el("form", { className: "form", novalidate: true }, [
    honeypot,
    lastNameField.root,
    firstNameField.root,
    emailField.root,
    presenceGroup.root,
    personsField.root,
    addressField.root,
    dinnerSection,
    submitButton,
    statusLine,
  ]);

  const successTitle = el("h3", { className: "form-success-title", text: "Merci !" });
  const successText = el("p", { className: "form-success-text" });
  const successDemoNote = el("p", {
    className: "form-hint",
    hidden: true,
  });
  const restartButton = el("button", { type: "button", className: "form-button form-button--ghost", text: "Envoyer une autre réponse" });
  const successPanel = el("div", { className: "form-success", role: "status", "aria-live": "polite", hidden: true }, [
    successTitle, successText, successDemoNote, restartButton,
  ]);

  let isSending = false;
  let dinnerPasswordIsValid = false;

  function setPasswordMessage(text, tone) {
    passwordMessage.textContent = text;
    passwordMessage.className = "form-hint" + (tone ? " form-hint--" + tone : "");
  }

  function resetDinnerUnlock() {
    dinnerPasswordIsValid = false;
    dinnerPresenceBlock.hidden = true;
    dinnerPresenceGroup.reset();
  }

  async function checkDinnerPassword() {
    resetDinnerUnlock();
    const typedPassword = passwordInput.value.trim();
    if (!typedPassword) {
      setPasswordMessage("Veuillez saisir le mot de passe.", "error");
      return false;
    }
    if (!gate.isConfigured()) {
      setPasswordMessage("Le mot de passe du dîner n'est pas encore configuré.", "error");
      return false;
    }
    if (!gate.hasSubtleCrypto()) {
      setPasswordMessage("La vérification n'est pas disponible sur ce navigateur. Contactez-nous pour confirmer votre présence au dîner.", "error");
      return false;
    }
    const isMatch = await gate.matchesPassword(typedPassword);
    if (typedPassword !== passwordInput.value.trim()) return false;
    if (!isMatch) {
      setPasswordMessage("Mot de passe incorrect.", "error");
      return false;
    }
    dinnerPasswordIsValid = true;
    gate.markUnlocked();
    dinnerPresenceBlock.hidden = false;
    setPasswordMessage("Mot de passe valide ✓", "success");
    return true;
  }

  dinnerToggle.addEventListener("change", function () {
    passwordBlock.hidden = !dinnerToggle.checked;
    passwordInput.value = "";
    setPasswordMessage("");
    resetDinnerUnlock();
  });
  passwordInput.addEventListener("input", function () {
    setPasswordMessage("");
    resetDinnerUnlock();
  });
  passwordInput.addEventListener("change", function () {
    if (passwordInput.value.trim()) checkDinnerPassword();
  });
  passwordVerifyButton.addEventListener("click", function () { checkDinnerPassword(); });

  function isAttending() {
    return presenceGroup.value() === "oui";
  }

  function collectProblems() {
    const problems = [];
    function report(target, message) { problems.push({ target: target, message: message }); }

    if (!lastNameField.input.value.trim()) report(lastNameField, "Veuillez indiquer votre nom.");
    if (!firstNameField.input.value.trim()) report(firstNameField, "Veuillez indiquer votre prénom.");

    const emailText = emailField.input.value.trim();
    if (!emailText) report(emailField, "Veuillez indiquer votre email.");
    else if (!EMAIL_PATTERN.test(emailText)) report(emailField, "Cette adresse email ne semble pas valide.");

    if (!presenceGroup.value()) report(presenceGroup, "Merci de nous dire si vous serez présent(e).");

    const personsText = personsField.input.value.trim();
    const isPersonsFilled = personsText !== "";
    const personsNumber = Number(personsText);
    const isPersonsValid = /^\d+$/.test(personsText) && personsNumber >= MINIMUM_PERSONS && personsNumber <= MAXIMUM_PERSONS;
    if (isAttending() && !isPersonsValid) {
      report(personsField, "Indiquez un nombre de personnes entre " + MINIMUM_PERSONS + " et " + MAXIMUM_PERSONS + ".");
    } else if (isPersonsFilled && !isPersonsValid) {
      report(personsField, "Indiquez un nombre de personnes entre " + MINIMUM_PERSONS + " et " + MAXIMUM_PERSONS + ", ou laissez vide.");
    }

    const addressText = addressField.input.value.trim();
    if (isAttending() && addressText.length < MINIMUM_ADDRESS_LENGTH) {
      report(addressField, "Veuillez indiquer votre adresse postale (rue, NPA, localité, pays).");
    }

    if (dinnerToggle.checked && !dinnerPasswordIsValid) {
      report(
        { error: function (message) { setPasswordMessage(message, "error"); }, input: passwordInput },
        passwordInput.value.trim() ? "Mot de passe incorrect." : "Veuillez saisir le mot de passe du dîner.",
      );
    } else if (dinnerToggle.checked && !dinnerPresenceGroup.value()) {
      report(dinnerPresenceGroup, "Merci de nous dire si vous serez présent(e) au dîner.");
    }
    return problems;
  }

  function buildPayload() {
    const personsText = personsField.input.value.trim();
    const isInvitedToDinner = dinnerToggle.checked && dinnerPasswordIsValid;
    return {
      type: "rsvp",
      nom: lastNameField.input.value.trim(),
      prenom: firstNameField.input.value.trim(),
      email: emailField.input.value.trim(),
      personnes: personsText === "" ? 0 : Number(personsText),
      adresse: addressField.input.value.trim(),
      present: isAttending(),
      dinerInvite: isInvitedToDinner,
      dinerPresent: isInvitedToDinner ? dinnerPresenceGroup.value() === "oui" : null,
      submittedAt: new Date().toISOString(),
    };
  }

  function setSending(sending) {
    isSending = sending;
    submitButton.disabled = sending;
    submitButton.textContent = sending ? "Envoi en cours…" : "Envoyer ma réponse";
  }

  function showSuccess(isPresent) {
    successText.textContent = isPresent
      ? "Votre réponse est bien enregistrée. Nous avons hâte de vous retrouver !"
      : "Votre réponse est bien enregistrée. Merci de nous avoir prévenus, vous nous manquerez.";
    successDemoNote.hidden = !isDemoMode;
    successDemoNote.textContent = isDemoMode ? "Mode démo : rien n'a été envoyé pour le moment." : "";
    form.hidden = true;
    successPanel.hidden = false;
    statusLine.textContent = "";
  }

  function focusFirstProblem(problems) {
    const first = problems[0];
    if (first && first.target.input && typeof first.target.input.focus === "function") {
      first.target.input.focus();
    } else if (first && first.target.inputs) {
      first.target.inputs[0].focus();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSending) return;
    statusLine.textContent = "";
    statusLine.className = "form-status";

    if (honeypotInput.value) {
      showSuccess(true);
      return;
    }

    if (dinnerToggle.checked && !dinnerPasswordIsValid && passwordInput.value.trim()) {
      await checkDinnerPassword();
    }

    const problems = collectProblems();
    problems.forEach(function (problem) { problem.target.error(problem.message); });
    if (problems.length > 0) {
      statusLine.textContent = "Certains champs sont à corriger.";
      statusLine.className = "form-status form-status--error";
      focusFirstProblem(problems);
      return;
    }

    const payload = buildPayload();
    setSending(true);
    try {
      if (isDemoMode) {
        console.info("[rsvp] mode démo, payload non envoyé :", payload);
        showSuccess(payload.present);
        return;
      }
      const result = await postJson(config.APPS_SCRIPT_URL, payload);
      if (result && result.ok) {
        showSuccess(payload.present);
        return;
      }
      throw new Error((result && result.error) || "réponse invalide");
    } catch (error) {
      console.error("[rsvp] échec de l'envoi :", error);
      statusLine.textContent = "L'envoi a échoué. Veuillez réessayer dans un instant, ou contactez-nous directement.";
      statusLine.className = "form-status form-status--error";
    } finally {
      setSending(false);
    }
  }

  form.addEventListener("submit", handleSubmit);
  restartButton.addEventListener("click", function () {
    form.reset();
    personsField.input.value = "1";
    passwordBlock.hidden = true;
    setPasswordMessage("");
    resetDinnerUnlock();
    successPanel.hidden = true;
    form.hidden = false;
    firstNameField.input.focus();
  });

  if (isDeadlinePassed()) {
    deadlineNotice.textContent = "La date limite est dépassée, contactez-nous.";
    if (config.CONTACT && !isPlaceholder(config.CONTACT)) deadlineNotice.textContent += " " + config.CONTACT;
    else if (config.CONTACT) {
      deadlineNotice.textContent += " ";
      deadlineNotice.appendChild(el("span", { className: "placeholder", text: config.CONTACT }));
    }
    deadlineNotice.className = "form-notice form-notice--late";
    root.appendChild(deadlineNotice);
  }

  if (isDemoMode) root.appendChild(demoBanner);
  root.appendChild(form);
  root.appendChild(successPanel);
})();
