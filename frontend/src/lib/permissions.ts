import { apiFetch } from "@/lib/api-client";

export async function fetchMyPermissions(): Promise<Set<string>> {
  const res = await apiFetch("/admin/me/permissions");
  if (!res.ok) return new Set();
  const body = await res.json();
  return new Set<string>(body.permissions ?? []);
}

export function can(perms: Set<string>, permission: string): boolean {
  return perms.has("*") || perms.has(permission);
}
