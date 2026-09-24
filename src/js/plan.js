// Section « Plan de table » : verrouillée tant que le mot de passe du dîner n'a pas été saisi.
// Le contenu n'est construit qu'après déverrouillage (il n'est donc pas dans le HTML de départ).
(function () {
  "use strict";

  const root = document.getElementById("plan-root");
  const gate = window.DinnerGate;
  if (!root || !gate) return;

  const INPUT_ID = "plan-password";

  function el(tag, props, children) {
    const element = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      const value = props[key];
      if (key === "className") element.className = value;
      else if (key === "text") element.textContent = value;
      else if (key === "hidden") element.hidden = Boolean(value);
      else element.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      if (child) element.appendChild(child);
    });
    return element;
  }

  function renderUnlocked() {
    root.replaceChildren(
      el("p", { className: "coming-soon" }, [el("span", { className: "placeholder", text: "Bientôt disponible" })]),
      el("p", { className: "section-intro", text: "Vous pourrez bientôt choisir votre place pour le dîner." })
    );
  }

  function renderLocked() {
    const input = el("input", {
      type: "password", id: INPUT_ID, name: "mot-de-passe", autocomplete: "off",
      autocapitalize: "none", spellcheck: "false", "aria-describedby": "plan-password-message",
    });
    const message = el("p", { className: "form-hint", id: "plan-password-message", role: "status", "aria-live": "polite" });
    const button = el("button", { type: "submit", className: "form-button", text: "Accéder au plan de table" });
    const form = el("form", { className: "form plan-form", novalidate: "" }, [
      el("div", { className: "form-field" }, [
        el("label", { className: "form-label", for: INPUT_ID, text: "Mot de passe du dîner" }),
        input,
      ]),
      message,
      button,
    ]);

    function setMessage(text, tone) {
      message.textContent = text;
      message.className = "form-hint" + (tone ? " form-hint--" + tone : "");
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const typed = input.value.trim();
      if (!typed) return setMessage("Veuillez saisir le mot de passe.", "error");
      if (!gate.isConfigured()) return setMessage("Le mot de passe du dîner n'est pas encore configuré.", "error");
      if (!gate.hasSubtleCrypto()) {
        return setMessage("La vérification n'est pas disponible sur ce navigateur. Contactez-nous.", "error");
      }
      button.disabled = true;
      try {
        if (await gate.matchesPassword(typed)) gate.markUnlocked();
        else setMessage("Mot de passe incorrect.", "error");
      } finally {
        button.disabled = false;
      }
    });

    root.replaceChildren(
      el("p", { className: "section-intro", text: "Cette section est réservée aux invités du dîner. Saisissez le mot de passe indiqué sur votre invitation." }),
      form
    );
  }

  window.addEventListener(gate.UNLOCK_EVENT, renderUnlocked);
  if (gate.isUnlocked()) renderUnlocked();
  else renderLocked();
})();
