export const KNOWN_VARIABLES = ["nome", "email", "phone", "azienda"] as const;
export type KnownVariable = (typeof KNOWN_VARIABLES)[number];

const tokenRe = () => /\{\{([a-z0-9_:-]+)\}\}/gi;
const VALID_TOKEN_RE = /^(nome|email|phone|azienda|tag:[a-z0-9_-]+)$/i;

export interface VariableOption {
  label: string;
  token: string;
}

export const BUILTIN_VARIABLE_OPTIONS: VariableOption[] = [
  { label: "Nome", token: "{{nome}}" },
  { label: "Email", token: "{{email}}" },
  { label: "Telefono", token: "{{phone}}" },
  { label: "Azienda", token: "{{azienda}}" },
];

export function tagToken(tag: string): string {
  const sanitized = tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return sanitized ? `{{tag:${sanitized}}}` : "";
}

export function extractVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(tokenRe())) {
    found.add(match[1]);
  }
  return [...found];
}

export function invalidVariables(text: string): string[] {
  return extractVariables(text).filter((v) => !VALID_TOKEN_RE.test(v));
}

export function insertAtCursor(
  textarea: HTMLTextAreaElement | HTMLInputElement,
  token: string
): string {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const next = before + token + after;
  queueMicrotask(() => {
    textarea.focus();
    const pos = start + token.length;
    textarea.setSelectionRange(pos, pos);
  });
  return next;
}

const SAMPLE_VALUES: Record<string, string> = {
  nome: "Marco",
  email: "marco@rossi.it",
  phone: "+39 333 1234567",
  azienda: "Rossi SRL",
};

export function renderWithSamples(text: string): string {
  return text.replace(tokenRe(), (_, name: string) => {
    if (SAMPLE_VALUES[name]) return SAMPLE_VALUES[name];
    if (name.startsWith("tag:")) return `[${name.slice(4)}]`;
    return _;
  });
}
