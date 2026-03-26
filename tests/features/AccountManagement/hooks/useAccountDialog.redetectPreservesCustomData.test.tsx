import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  mockAutoDetectAccount,
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
} = vi.hoisted(() => ({
  mockAutoDetectAccount: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
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
  useChannelDialog: () => ({
    openWithAccount: mockOpenWithAccount,
    openSub2ApiTokenCreationDialog: mockOpenSub2ApiTokenCreationDialog,
  }),
}))

vi.mock("~/services/accounts/accountOperations", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountOperations")
    >()
  return {
    ...actual,
    autoDetectAccount: mockAutoDetectAccount,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
})

describe("useAccountDialog re-detect preservation", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await accountStorage.clearAllData()
  })

  it("preserves notes and custom check-in fields when re-detecting an existing account", async () => {
    const turnstilePreTrigger: TurnstilePreTrigger = {
      kind: "clickSelector",
      selector: "#check-in",
    }

    const existingCheckIn: CheckInConfig = {
      enableDetection: true,
      autoCheckInEnabled: false,
      siteStatus: {
        isCheckedInToday: true,
        lastCheckInDate: "2026-03-05",
        lastDetectedAt: 123,
      },
      customCheckIn: {
        url: "https://checkin.example.com",
        redeemUrl: "https://redeem.example.com",
        openRedeemWithCheckIn: false,
        isCheckedInToday: true,
        lastCheckInDate: "2026-03-05",
        turnstilePreTrigger,
      },
    }

    const existingNotes = "Keep this note"

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
      notes: existingNotes,
      tagIds: [],
      authType: AuthTypeEnum.AccessToken,
      checkIn: existingCheckIn,
    } as any)

    mockAutoDetectAccount.mockResolvedValueOnce({
      success: true,
      message: "ok",
      data: {
        username: "new-user",
        accessToken: "new-token",
        userId: "1",
        exchangeRate: 7,
        siteName: "Detected",
        siteType: "unknown",
        checkIn: {
          enableDetection: true,
          autoCheckInEnabled: true,
          siteStatus: { isCheckedInToday: false },
          customCheckIn: {
            url: "",
            redeemUrl: "",
            openRedeemWithCheckIn: true,
            isCheckedInToday: false,
          },
        } as CheckInConfig,
      },
    })

    const account = { id: accountId } as any
    const onClose = vi.fn()
    const onSuccess = vi.fn()

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
      expect(result.current.state.notes).toBe(existingNotes)
      expect(result.current.state.checkIn.customCheckIn?.url).toBe(
        existingCheckIn.customCheckIn?.url,
      )
      expect(result.current.state.checkIn.customCheckIn?.redeemUrl).toBe(
        existingCheckIn.customCheckIn?.redeemUrl,
      )
    })

    await act(async () => {
      await result.current.handlers.handleAutoDetect()
    })

    await waitFor(() => {
      expect(result.current.state.isDetected).toBe(true)
    })

    expect(result.current.state.notes).toBe(existingNotes)
    expect(result.current.state.checkIn.customCheckIn?.url).toBe(
      existingCheckIn.customCheckIn?.url,
    )
    expect(result.current.state.checkIn.customCheckIn?.redeemUrl).toBe(
      existingCheckIn.customCheckIn?.redeemUrl,
    )
    expect(
      result.current.state.checkIn.customCheckIn?.openRedeemWithCheckIn,
    ).toBe(existingCheckIn.customCheckIn?.openRedeemWithCheckIn)
    expect(
      result.current.state.checkIn.customCheckIn?.turnstilePreTrigger,
    ).toEqual(turnstilePreTrigger)
    expect(result.current.state.checkIn.autoCheckInEnabled).toBe(
      existingCheckIn.autoCheckInEnabled,
    )
  })
})
