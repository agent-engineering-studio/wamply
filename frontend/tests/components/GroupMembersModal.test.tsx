import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn().mockImplementation((url: string) => {
    if (url.includes("/members")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ members: [{ id: "c1", phone: "+39333000001", name: "Mario" }] }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ contacts: [], total: 0 }),
    });
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { GroupMembersModal } from "@/app/(dashboard)/groups/_components/GroupMembersModal";

describe("GroupMembersModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders modal title", () => {
    render(
      <GroupMembersModal
        open={true}
        groupId="g1"
        groupName="VIP"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText("Membri di VIP")).toBeDefined();
  });

  it("shows member list after load", async () => {
    render(
      <GroupMembersModal
        open={true}
        groupId="g1"
        groupName="VIP"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("Mario")).toBeDefined());
  });
});
