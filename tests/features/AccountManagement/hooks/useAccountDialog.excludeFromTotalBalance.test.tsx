import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { server } from "~/tests/msw/server"
import { act, renderHook, waitFor } from "~/tests/test-utils/render"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

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

vi.mock("~/components/ChannelDialog", () => ({
  useChannelDialog: () => ({ openWithAccount: mockOpenWithAccount }),
}))

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog excludeFromTotalBalance", () => {
  beforeEach(async () => {
    server.resetHandlers()
    await accountStorage.clearAllData()
  })

  it("persists the exclusion flag on update", async () => {
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

    const accountId = await accountStorage.addAccount({
      site_name: "Test",
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
      excludeFromTotalBalance: false,
    } as any)

    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const account = { id: accountId } as any

    const { result } = renderHook(() =>
      useAccountDialog({
        mode: DIALOG_MODES.EDIT,
        account,
        isOpen: true,
        onClose,
        onSuccess,
      }),
    )

    await waitFor(() => {
      expect(result.current.state.siteName).toBe("Test")
    })

    await act(async () => {
      result.current.setters.setExcludeFromTotalBalance(true)
    })

    await act(async () => {
      await result.current.handlers.handleSaveAccount()
    })

    const updated = await accountStorage.getAccountById(accountId)
    expect(updated?.excludeFromTotalBalance).toBe(true)
  })
})
