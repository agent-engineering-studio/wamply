import { invalidVariables } from "./variables";
import type { TemplateFormState, TemplateButton } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

const URL_RE = /^https?:\/\/\S+$/i;
const E164_RE = /^\+?[1-9]\d{7,14}$/;

function validateButton(b: TemplateButton, idx: number): Record<string, string> {
  const errs: Record<string, string> = {};
  const prefix = `buttons.${idx}`;
  if (!b.text || b.text.length > 25) {
    errs[`${prefix}.text`] = "Testo richiesto, max 25 caratteri.";
  }
  if (b.type === "URL") {
    if (!b.url || !URL_RE.test(b.url)) {
      errs[`${prefix}.url`] = "URL non valido (deve iniziare con http:// o https://).";
    }
  } else if (b.type === "PHONE_NUMBER") {
    if (!b.phone_number || !E164_RE.test(b.phone_number.replace(/\s+/g, ""))) {
      errs[`${prefix}.phone_number`] = "Numero non valido (formato E.164, es. +39333...).";
    }
  }
  return errs;
}

export function validateTemplate(form: TemplateFormState): ValidationResult {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = "Il nome del template è obbligatorio.";
  } else if (form.name.length > 80) {
    errors.name = "Il nome può avere al massimo 80 caratteri.";
  }

  if (!form.body.text.trim()) {
    errors["body.text"] = "Il corpo del messaggio è obbligatorio.";
  } else if (form.body.text.length > 1024) {
    errors["body.text"] = "Il corpo può avere al massimo 1024 caratteri.";
  }

  if (form.header) {
    if (form.header.format === "TEXT") {
      if (!form.header.text.trim()) {
        errors["header.text"] = "Se abilitato, l'header deve contenere del testo.";
      } else if (form.header.text.length > 60) {
        errors["header.text"] = "L'header può avere al massimo 60 caratteri.";
      }
    } else {
      if (!form.header.media_url) {
        errors["header.media"] = "Carica un file per l'header.";
      }
    }
  }

  if (form.footer) {
    if (!form.footer.text.trim()) {
      errors["footer.text"] = "Se abilitato, il footer deve contenere del testo.";
    } else if (form.footer.text.length > 60) {
      errors["footer.text"] = "Il footer può avere al massimo 60 caratteri.";
    } else if (/\{\{/.test(form.footer.text)) {
      errors["footer.text"] = "Il footer non può contenere variabili.";
    }
  }

  if (form.buttons.length > 3) {
    errors.buttons = "Massimo 3 bottoni.";
  }
  form.buttons.forEach((b, i) => Object.assign(errors, validateButton(b, i)));

  const textFields: [string, string][] = [
    ["body.text", form.body.text],
    ...(form.header && form.header.format === "TEXT"
      ? ([["header.text", form.header.text]] as [string, string][])
      : []),
  ];
  for (const [field, value] of textFields) {
    const bad = invalidVariables(value);
    if (bad.length > 0 && !errors[field]) {
      errors[field] = `Variabili non valide: ${bad.map((v) => `{{${v}}}`).join(", ")}`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
