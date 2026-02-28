import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { SUB2API } from "~/constants/siteType"
import { validateAndSaveAccount } from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accountStorage"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import { AuthTypeEnum, type CheckInConfig } from "~/types"

const {
  fetchAccountDataMock,
  ensureDefaultApiTokenForAccountMock,
  toastSuccessMock,
  toastErrorMock,
  toastLoadingMock,
  toastDismissMock,
} = vi.hoisted(() => ({
  fetchAccountDataMock: vi.fn(),
  ensureDefaultApiTokenForAccountMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastLoadingMock: vi.fn(),
  toastDismissMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
    loading: toastLoadingMock,
    dismiss: toastDismissMock,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountData: fetchAccountDataMock,
  }),
}))

vi.mock("~/services/accountKeyAutoProvisioning/ensureDefaultToken", () => ({
  ensureDefaultApiTokenForAccount: ensureDefaultApiTokenForAccountMock,
  generateDefaultTokenRequest: () => ({
    name: "user group (auto)",
    unlimited_quota: true,
    expired_time: -1,
    remain_quota: 0,
    allow_ips: "",
    model_limits_enabled: false,
    model_limits: "",
    group: "",
  }),
}))

const CHECK_IN_DISABLED: CheckInConfig = {
  enableDetection: false,
  autoCheckInEnabled: true,
  siteStatus: { isCheckedInToday: false },
  customCheckIn: {
    url: "",
    redeemUrl: "",
    openRedeemWithCheckIn: true,
    isCheckedInToday: false,
  },
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("accountOperations auto-provision key on add", () => {
  beforeEach(async () => {
    fetchAccountDataMock.mockReset()
    ensureDefaultApiTokenForAccountMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    toastLoadingMock.mockReset()
    toastDismissMock.mockReset()

    fetchAccountDataMock.mockResolvedValue({
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })

    ensureDefaultApiTokenForAccountMock.mockResolvedValue({
      token: { id: 1, name: "t", key: "k" },
      created: false,
    })

    await accountStorage.clearAllData()

    const storage = new Storage({ area: "local" })
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
    })
  })

  it("runs auto-provision after saving when enabled and eligible", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)
    expect(result.accountId).toBeTruthy()

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("does not run auto-provision when the preference is disabled", async () => {
    const storage = new Storage({ area: "local" })
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: false,
    })

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("defaults to disabling auto-provision when preferences read fails", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockRejectedValueOnce(
      new Error("prefs-fail"),
    )

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
  })

  it("skips auto-provision for sub2api accounts", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SUB2API,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("skips auto-provision for none-auth accounts", async () => {
    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.None,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("does not fail account add when provisioning throws", async () => {
    ensureDefaultApiTokenForAccountMock.mockRejectedValueOnce(new Error("boom"))

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })
})
