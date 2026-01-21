import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accountStorage"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const { mockT, mockOpenWithAccount } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => key),
  mockOpenWithAccount: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
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

describe("useAccountDialog manual balance", () => {
  beforeEach(async () => {
    await accountStorage.clearAllData()
  })

  it("prefills manual balance when editing an account", async () => {
    const manualBalanceUsd = "123.45"
    const accountId = await accountStorage.addAccount({
      site_name: "Test",
      site_url: "https://example.com",
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
      manualBalanceUsd,
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
      expect(result.current.state.manualBalanceUsd).toBe(manualBalanceUsd)
    })
  })
})
