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

const createTestAccounts = () => {
  const displayAccount = buildSub2ApiAccount()
  const siteAccount = buildSiteAccount({
    id: displayAccount.id,
    site_type: "sub2api",
    site_url: displayAccount.baseUrl,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: displayAccount.userId,
      access_token: displayAccount.token,
      username: displayAccount.username,
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

  return {
    displayAccount,
    siteAccount,
  }
}

describe("accountOperations Sub2API token creation guards", () => {
  let DISPLAY_ACCOUNT: ReturnType<typeof buildSub2ApiAccount>
  let SITE_ACCOUNT: ReturnType<typeof buildSiteAccount>

  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastLoadingMock.mockReset()

    const testAccounts = createTestAccounts()
    DISPLAY_ACCOUNT = testAccounts.displayAccount
    SITE_ACCOUNT = testAccounts.siteAccount
  })

  it("blocks implicit Sub2API default-token creation in background helpers", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
        displaySiteData: DISPLAY_ACCOUNT,
      }),
    ).rejects.toThrow("messages:sub2api.createRequiresGroup")

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("treats existing Sub2API tokens as already satisfying background ensure", async () => {
    const token = buildSub2ApiToken({ id: 5, group: "vip" })
    fetchAccountTokensMock.mockResolvedValueOnce([token])

    await expect(
      ensureDefaultApiTokenForAccount({
        account: SITE_ACCOUNT,
        displaySiteData: DISPLAY_ACCOUNT,
      }),
    ).resolves.toEqual({ token, created: false })

    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
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
