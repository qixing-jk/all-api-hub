import { beforeEach, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountAuthenticatedSession } from "~/services/apiAdapters/contracts/accountLogin"
import { createNewApiAuthenticatedSessionRequest } from "~/services/apiAdapters/newApi/account/authenticatedSession"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: vi.fn() },
}))
beforeEach(() => vi.resetAllMocks())
const account = buildSiteAccount({ site_url: "https://site.example" })
const bundle = () => ({
  success: true,
  data: {
    access_token: "session-token",
    token_type: "Bearer",
    access_expires_at: Date.now() / 1000 + 300,
    session: { sid: "test", current: true },
    user: { id: account.account_info.id },
  },
})
const session = (sendSiteAction = vi.fn()): AccountAuthenticatedSession => ({
  tabId: 12,
  assertOrigin: vi.fn(),
  sendSiteAction,
  navigate: vi.fn(),
  waitForReadyPage: vi.fn(),
  setVerificationReason: vi.fn(),
})

it.each([401, 404, 405])(
  "uses a verified legacy cookie session after refresh HTTP %s",
  async (status) => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status, data: {} })
    vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
      success: true,
      data: { id: account.account_info.id },
    })
    const result = await createNewApiAuthenticatedSessionRequest(
      session(send),
      account,
    )
    expect(result.auth.authType).toBe("cookie")
    expect(result.currentTabFallback).toBe("forbid")
    expect(send).toHaveBeenLastCalledWith(
      RuntimeActionIds.ContentPerformTempWindowFetch,
      expect.objectContaining({
        fetchOptions: { method: "POST", credentials: "include" },
      }),
    )
  },
)

it("refreshes an absent cached session and binds the verified bearer to its tab", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ status: 200, data: bundle() })
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue({
    success: true,
    data: { id: account.account_info.id },
  })
  const result = await createNewApiAuthenticatedSessionRequest(
    session(send),
    account,
  )
  expect(result.auth).toMatchObject({
    authType: "access_token",
    accessToken: "session-token",
  })
  expect(result.fetchContext).toMatchObject({
    tabId: 12,
    origin: "https://site.example",
  })
})

it.each([
  undefined,
  { status: 500, data: {} },
  { status: 200, data: { success: true, data: {} } },
])(
  "rejects an unusable refresh without reading or mutating account data: %j",
  async (refresh) => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(refresh)
    await expect(
      createNewApiAuthenticatedSessionRequest(session(send), account),
    ).rejects.toThrow("session is unavailable")
    expect(newApiFamilyRequests.envelope).not.toHaveBeenCalled()
  },
)

it.each([
  { success: false, data: { id: account.account_info.id } },
  { success: true, data: null },
])("rejects unconfirmed server identity: %j", async (self) => {
  vi.mocked(newApiFamilyRequests.envelope).mockResolvedValue(self)
  await expect(
    createNewApiAuthenticatedSessionRequest(
      session(vi.fn().mockResolvedValue(bundle())),
      account,
    ),
  ).rejects.toThrow("identity is unconfirmed")
})
