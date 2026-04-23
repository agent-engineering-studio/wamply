import { useEffect, useState } from "react";
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

// Module-level cache so multiple components share a single in-flight fetch
// during the same page load. Cleared only by a full reload.
let _cache: Promise<Set<string>> | null = null;

export function usePermissions(): { perms: Set<string>; loading: boolean } {
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!_cache) _cache = fetchMyPermissions();
    _cache.then((p) => {
      setPerms(p);
      setLoading(false);
    });
  }, []);
  return { perms, loading };
}
