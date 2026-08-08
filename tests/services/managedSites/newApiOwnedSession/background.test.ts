import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchApiResponse } from "~/services/apiTransport/request"
import { revokeNewApiOwnedSession } from "~/services/managedSites/newApiOwnedSession/background"
import type { NewApiOwnedSessionReceipt } from "~/services/managedSites/newApiOwnedSession/lifecycle"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiResponse: vi.fn(),
}))

const receipt: NewApiOwnedSessionReceipt = {
  version: 1,
  origin: "https://managed.example",
  sessionId: "owned/session-placeholder",
  accessToken: "owned-token-placeholder",
  accessExpiresAt: 1_900_000_000,
  lastUsedAt: 1_800_000_000_000,
  cleanupAt: 1_800_000_600_000,
}

describe("revokeNewApiOwnedSession", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("deletes only the captured SID without broad session revocation", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {},
      body: "",
    })

    await expect(revokeNewApiOwnedSession(receipt)).resolves.toEqual({
      status: "cleaned",
    })
    expect(fetchApiResponse).toHaveBeenCalledWith(
      {
        baseUrl: receipt.origin,
        accountId: `managed-site:new-api-owned-session:${receipt.origin}`,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: receipt.accessToken,
        },
      },
      expect.objectContaining({
        endpoint: "/api/user/sessions/owned%2Fsession-placeholder",
        options: expect.objectContaining({ method: "DELETE" }),
      }),
    )
    expect(
      JSON.stringify(vi.mocked(fetchApiResponse).mock.calls),
    ).not.toContain("revoke-others")
  })

  it.each([
    [404, "cleaned"],
    [401, "unavailable"],
    [500, "retry"],
  ] as const)("maps HTTP %s to %s", async (status, expected) => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ok: false,
      status,
      headers: {},
      body: "",
    })

    await expect(revokeNewApiOwnedSession(receipt)).resolves.toEqual({
      status: expected,
    })
  })
})
