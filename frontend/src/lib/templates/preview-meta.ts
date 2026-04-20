import type {
  TemplateComponent,
  HeaderComponent,
  BodyComponent,
} from "./types";
import { extractVariables } from "./variables";

export function bodyText(components: TemplateComponent[]): string {
  const body = components.find((c): c is BodyComponent => c.type === "BODY");
  return body?.text ?? "";
}

export function bodyLength(components: TemplateComponent[]): number {
  return bodyText(components).length;
}

export function collectVariables(components: TemplateComponent[]): string[] {
  const header = components.find((c): c is HeaderComponent => c.type === "HEADER");
  const body = components.find((c): c is BodyComponent => c.type === "BODY");
  const headerVars = header ? extractVariables(header.text) : [];
  const bodyVars = body ? extractVariables(body.text) : [];
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
