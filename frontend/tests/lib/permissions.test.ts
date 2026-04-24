import { describe, expect, it, vi, beforeEach } from "vitest";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { fetchMyPermissions, can } from "@/lib/permissions";

describe("can()", () => {
  it("returns true when wildcard is present", () => {
    expect(can(new Set(["*"]), "admin.users.edit")).toBe(true);
  });
  it("returns true on exact match", () => {
    expect(can(new Set(["admin.users.view"]), "admin.users.view")).toBe(true);
  });
  it("returns false when missing", () => {
    expect(can(new Set(["admin.users.view"]), "admin.users.edit")).toBe(false);
  });
  it("returns false on empty set", () => {
    expect(can(new Set(), "admin.overview.view")).toBe(false);
  });
});

describe("fetchMyPermissions()", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("returns a Set from the API payload", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ role: "sales", permissions: ["admin.users.view", "admin.ai_costs.view"] }),
    });
    const perms = await fetchMyPermissions();
    expect(perms).toEqual(new Set(["admin.users.view", "admin.ai_costs.view"]));
    expect(apiFetchMock).toHaveBeenCalledWith("/admin/me/permissions");
  });

  it("returns empty set on non-ok response", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const perms = await fetchMyPermissions();
    expect(perms).toEqual(new Set());
  });
});
