export type TemplateCategory = "marketing" | "utility" | "authentication";

export type Language = "it" | "en" | "es" | "de" | "fr";

export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export interface HeaderTextComponent {
  type: "HEADER";
  format: "TEXT";
  text: string;
}

export interface HeaderMediaComponent {
  type: "HEADER";
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  media_url: string;
}

export type HeaderComponent = HeaderTextComponent | HeaderMediaComponent;

export interface BodyComponent {
  type: "BODY";
  text: string;
}

export interface FooterComponent {
  type: "FOOTER";
  text: string;
}

export type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ButtonsComponent {
  type: "BUTTONS";
  buttons: TemplateButton[];
}

export type TemplateComponent =
  | HeaderComponent
  | BodyComponent
  | FooterComponent
  | ButtonsComponent;

export interface ComplianceIssue {
  text: string;
  reason: string;
  suggestion: string;
}

export type RiskLevel = "low" | "medium" | "high";

export interface ComplianceReport {
  risk_level: RiskLevel;
  score: number;
  issues: ComplianceIssue[];
  checked_at: string;
}

export interface Template {
  id: string;
  name: string;
  language: Language;
  category: TemplateCategory;
  components: TemplateComponent[];
  status: string;
  twilio_content_sid: string | null;
  compliance_report?: ComplianceReport | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateFormState {
  name: string;
  language: Language;
  category: TemplateCategory;
  header: HeaderComponent | null;
  body: BodyComponent;
  footer: FooterComponent | null;
  buttons: TemplateButton[];
}

export function emptyForm(): TemplateFormState {
  return {
    name: "",
    language: "it",
    category: "marketing",
    header: null,
    body: { type: "BODY", text: "" },
    footer: null,
    buttons: [],
  };
}

export function isMediaHeader(h: HeaderComponent | null): h is HeaderMediaComponent {
  return !!h && h.format !== "TEXT";
}

export function componentsToForm(
  components: TemplateComponent[]
): Pick<TemplateFormState, "header" | "body" | "footer" | "buttons"> {
  const typeOf = (c: TemplateComponent): string =>
    String((c as { type?: string }).type ?? "").toUpperCase();
  const headerRaw = components.find((c) => typeOf(c) === "HEADER") as
    | HeaderComponent
    | undefined;
  const bodyRaw = components.find((c) => typeOf(c) === "BODY");
  const footerRaw = components.find((c) => typeOf(c) === "FOOTER");
  const buttonsBlock = components.find((c) => typeOf(c) === "BUTTONS") as
    | ButtonsComponent
    | undefined;

  let header: HeaderComponent | null = null;
  if (headerRaw) {
    const fmt = (headerRaw.format ?? "TEXT") as HeaderFormat;
    if (fmt === "TEXT") {
      header = { type: "HEADER", format: "TEXT", text: (headerRaw as HeaderTextComponent).text ?? "" };
    } else {
      header = {
        type: "HEADER",
        format: fmt,
        media_url: (headerRaw as HeaderMediaComponent).media_url ?? "",
      };
    }
  }
  const body: BodyComponent = bodyRaw
    ? { type: "BODY", text: (bodyRaw as BodyComponent).text ?? "" }
    : { type: "BODY", text: "" };
  const footer: FooterComponent | null = footerRaw
    ? { type: "FOOTER", text: (footerRaw as FooterComponent).text ?? "" }
    : null;
  return {
    header,
    body,
    footer,
    buttons: buttonsBlock?.buttons ?? [],
  };
}

export function formToComponents(form: TemplateFormState): TemplateComponent[] {
  const list: TemplateComponent[] = [];
  if (form.header) {
    if (form.header.format === "TEXT") {
      if (form.header.text.trim()) list.push(form.header);
    } else if (form.header.media_url) {
      list.push(form.header);
    }
  }
  list.push(form.body);
  if (form.footer && form.footer.text.trim()) list.push(form.footer);
  if (form.buttons.length > 0) list.push({ type: "BUTTONS", buttons: form.buttons });
  return list;
}
