import { beforeEach, describe, expect, it, vi } from "vitest"

import { ensureDefaultApiTokenForAccount } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  ensureAccountApiToken,
  resolveSub2ApiQuickCreateResolution,
} from "~/services/accounts/accountOperations"
import { AuthTypeEnum } from "~/types"
import {
  buildSiteAccount,
  buildSub2ApiAccount,
  buildSub2ApiToken,
} from "~~/tests/test-utils/factories"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  fetchUserGroupsMock,
  toastLoadingMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  toastLoadingMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: toastLoadingMock,
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchAccountTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createApiToken: (...args: any[]) => createApiTokenMock(...args),
      fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
    })),
  }
})

const DISPLAY_ACCOUNT = buildSub2ApiAccount()
const SITE_ACCOUNT = buildSiteAccount({
  id: DISPLAY_ACCOUNT.id,
  site_type: "sub2api",
  site_url: DISPLAY_ACCOUNT.baseUrl,
  authType: AuthTypeEnum.AccessToken,
  account_info: {
    id: DISPLAY_ACCOUNT.userId,
    access_token: DISPLAY_ACCOUNT.token,
    username: DISPLAY_ACCOUNT.username,
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
})

describe("accountOperations Sub2API token creation guards", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastLoadingMock.mockReset()
  })

  it("blocks implicit Sub2API default-token creation in background helpers", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
        displaySiteData: DISPLAY_ACCOUNT,
      }),
    ).rejects.toThrow("messages:sub2api.createRequiresGroup")

    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("blocks shared token ensure when no Sub2API group has been resolved", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT),
    ).rejects.toThrow("messages:sub2api.createRequiresGroup")

    expect(toastLoadingMock).toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("creates a Sub2API token when an explicit valid group is provided", async () => {
    const token = buildSub2ApiToken({ id: 9, group: "vip" })
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureAccountApiToken(SITE_ACCOUNT, DISPLAY_ACCOUNT, {
        sub2apiGroup: "vip",
      }),
    ).resolves.toEqual(token)

    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ group: "vip" }),
    )
  })

  it("reports when Sub2API quick-create has no valid current groups", async () => {
    fetchUserGroupsMock.mockResolvedValueOnce({})

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: "blocked",
      message: "messages:sub2api.createRequiresAvailableGroup",
    })
  })

  it("requires explicit selection when Sub2API quick-create has multiple groups", async () => {
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    await expect(
      resolveSub2ApiQuickCreateResolution(DISPLAY_ACCOUNT),
    ).resolves.toEqual({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
    })
  })
})
