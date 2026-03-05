import { http, HttpResponse } from "msw"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { server } from "~~/tests/msw/server"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { mockOpenWithAccount } = vi.hoisted(() => ({
  mockOpenWithAccount: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({ openWithAccount: mockOpenWithAccount }),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    getAllTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog duplicate account warning", () => {
  beforeEach(async () => {
    server.resetHandlers()
    await accountStorage.clearAllData()
    await userPreferences.resetToDefaults()
  })

  it("warns when entering manual add flow if duplicate site exists (default enabled)", async () => {
    server.use(
      http.get("https://api.example.com/api/log/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
      http.get("https://api.example.com/api/user/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
    )

    await accountStorage.addAccount({
      site_name: "Existing",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "unknown",
      exchange_rate: 7,
      account_info: {
        id: 1,
        access_token: "token",
        username: "user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
      notes: "",
      tagIds: [],
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false } as any,
    } as any)

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
    })

    let manualAddPromise!: Promise<void>
    act(() => {
      manualAddPromise = result.current.handlers.handleShowManualForm()
    })

    await waitFor(() => {
      expect(result.current.state.duplicateAccountWarning.isOpen).toBe(true)
    })

    const beforeAccounts = await accountStorage.getAllAccounts()
    expect(beforeAccounts).toHaveLength(1)

    await act(async () => {
      result.current.handlers.handleDuplicateAccountWarningContinue()
      await manualAddPromise
    })

    await act(async () => {
      result.current.setters.setSiteName("Test")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    const afterAccounts = await accountStorage.getAllAccounts()
    expect(afterAccounts).toHaveLength(2)
  })

  it("skips warning when preference is disabled", async () => {
    server.use(
      http.get("https://api.example.com/api/log/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
      http.get("https://api.example.com/api/user/self", () =>
        HttpResponse.json(
          { success: false, message: "fetch failed" },
          { status: 500 },
        ),
      ),
    )

    await userPreferences.updateWarnOnDuplicateAccountAdd(false)

    await accountStorage.addAccount({
      site_name: "Existing",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: "unknown",
      exchange_rate: 7,
      account_info: {
        id: 1,
        access_token: "token",
        username: "user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
      notes: "",
      tagIds: [],
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false } as any,
    } as any)

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      await result.current.handlers.handleShowManualForm()
    })

    expect(result.current.state.duplicateAccountWarning.isOpen).toBe(false)

    await act(async () => {
      result.current.setters.setSiteName("Test")
      result.current.setters.setUsername("user")
      result.current.setters.setAccessToken("token")
      result.current.setters.setUserId("1")
      result.current.setters.setExchangeRate("7")
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    const afterAccounts = await accountStorage.getAllAccounts()
    expect(afterAccounts).toHaveLength(2)
  })
})
