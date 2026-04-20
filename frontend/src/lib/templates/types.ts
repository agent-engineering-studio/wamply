export type TemplateCategory = "marketing" | "utility" | "authentication";

export type Language = "it" | "en" | "es" | "de" | "fr";

export interface HeaderComponent {
  type: "HEADER";
  format: "TEXT";
  text: string;
}

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

export interface Template {
  id: string;
  name: string;
  language: Language;
  category: TemplateCategory;
  components: TemplateComponent[];
  status: string;
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

export function componentsToForm(
  components: TemplateComponent[]
): Pick<TemplateFormState, "header" | "body" | "footer" | "buttons"> {
  const header = components.find((c): c is HeaderComponent => c.type === "HEADER") ?? null;
  const body =
    components.find((c): c is BodyComponent => c.type === "BODY") ??
    ({ type: "BODY", text: "" } as BodyComponent);
  const footer = components.find((c): c is FooterComponent => c.type === "FOOTER") ?? null;
  const buttonsBlock = components.find((c): c is ButtonsComponent => c.type === "BUTTONS");
  return {
    header,
    body,
    footer,
    buttons: buttonsBlock?.buttons ?? [],
  };
}

export function formToComponents(form: TemplateFormState): TemplateComponent[] {
  const list: TemplateComponent[] = [];
  if (form.header && form.header.text.trim()) list.push(form.header);
  list.push(form.body);
  if (form.footer && form.footer.text.trim()) list.push(form.footer);
  if (form.buttons.length > 0) list.push({ type: "BUTTONS", buttons: form.buttons });
  return list;
}
