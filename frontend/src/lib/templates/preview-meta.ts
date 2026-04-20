import type { TemplateComponent } from "./types";
import { extractVariables } from "./variables";

function typeOf(c: TemplateComponent): string {
  return String((c as { type?: string }).type ?? "").toUpperCase();
}

function textOf(c: TemplateComponent | undefined): string {
  return (c as { text?: string } | undefined)?.text ?? "";
}

export function bodyText(components: TemplateComponent[]): string {
  return textOf(components.find((c) => typeOf(c) === "BODY"));
}

export function bodyLength(components: TemplateComponent[]): number {
  return bodyText(components).length;
}

export function collectVariables(components: TemplateComponent[]): string[] {
  const headerText = textOf(components.find((c) => typeOf(c) === "HEADER"));
  const bodyT = bodyText(components);
  const headerVars = headerText ? extractVariables(headerText) : [];
  const bodyVars = bodyT ? extractVariables(bodyT) : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of [...headerVars, ...bodyVars]) {
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
    }
  }
  return result;
}
