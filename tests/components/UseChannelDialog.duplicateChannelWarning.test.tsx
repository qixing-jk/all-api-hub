import { beforeEach, describe, expect, it, vi } from "vitest"

import { useChannelDialogContext } from "~/components/ChannelDialog/context/ChannelDialogContext"
import { useChannelDialog } from "~/components/ChannelDialog/hooks/useChannelDialog"
import { DIALOG_MODES } from "~/constants/dialogModes"
import * as accountOperations from "~/services/accountOperations"
import { accountStorage } from "~/services/accountStorage"
import * as managedSiteService from "~/services/managedSiteService"
import { act, renderHook, waitFor } from "~/tests/test-utils/render"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type SiteAccount,
} from "~/types"

const { mockToastLoading, mockToastDismiss, mockToastError } = vi.hoisted(
  () => ({
    mockToastLoading: vi.fn(),
    mockToastDismiss: vi.fn(),
    mockToastError: vi.fn(),
  }),
)

const getManagedSiteServiceSpy = vi.spyOn(
  managedSiteService,
  "getManagedSiteService",
)
const convertToDisplayDataSpy = vi.spyOn(accountStorage, "convertToDisplayData")
const ensureAccountApiTokenSpy = vi.spyOn(
  accountOperations,
  "ensureAccountApiToken",
)

const buildSiteAccount = (
  overrides: Partial<SiteAccount> = {},
): SiteAccount => ({
  id: "account-id",
  site_name: "Account",
  site_url: "https://upstream.example.com",
  health: {
    status: SiteHealthStatus.Healthy,
  },
  site_type: "newapi",
  exchange_rate: 7,
  account_info: {
    id: 1,
    access_token: "access-token",
    username: "user",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: 0,
  updated_at: 0,
  created_at: 1577836800,
  tagIds: [],
  authType: AuthTypeEnum.AccessToken,
  checkIn: {
    enableDetection: false,
  },
  ...overrides,
})

const buildApiToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: 1,
  user_id: 1,
  key: "token",
  status: 1,
  name: "Token",
  created_time: 0,
  accessed_time: 0,
  expired_time: 0,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  ...overrides,
})

vi.mock("react-hot-toast", () => ({
  default: {
    loading: mockToastLoading,
    dismiss: mockToastDismiss,
    error: mockToastError,
  },
}))

describe("useChannelDialog duplicate channel warning", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockToastLoading.mockReturnValue("toast-id")
    convertToDisplayDataSpy.mockReturnValue({
      id: "account-id",
      name: "Account",
      baseUrl: "https://upstream.example.com",
    })
    ensureAccountApiTokenSpy.mockImplementation(() => {
      throw new Error("ensureAccountApiToken should not be called in this test")
    })
  })

  it("shows warning and cancels when user does not continue", async () => {
    const mockService = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(async () => ({
        name: "Auto channel",
        models: ["gpt-4"],
        groups: ["default"],
      })),
      findMatchingChannel: vi.fn(async () => ({ name: "Existing channel" })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(mockService as any)

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    const openPromise = result.current.dialog.openWithAccount(
      buildSiteAccount(),
      buildApiToken(),
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing channel",
      })
    })

    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(false)
      await openPromise
    })

    expect(result.current.context.state.isOpen).toBe(false)
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })

  it("opens ChannelDialog when user continues despite duplicate", async () => {
    const mockService = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(async () => ({
        name: "Auto channel",
        models: ["gpt-4"],
        groups: ["default"],
      })),
      findMatchingChannel: vi.fn(async () => ({ name: "Existing channel" })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(mockService as any)

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    const openPromise = result.current.dialog.openWithAccount(
      buildSiteAccount(),
      buildApiToken(),
    )

    await waitFor(() => {
      expect(result.current.context.duplicateChannelWarning).toEqual({
        isOpen: true,
        existingChannelName: "Existing channel",
      })
    })

    await act(async () => {
      result.current.context.resolveDuplicateChannelWarning(true)
      await openPromise
    })

    expect(result.current.context.state).toMatchObject({
      isOpen: true,
      mode: DIALOG_MODES.ADD,
      initialValues: {
        name: "Auto channel",
        models: ["gpt-4"],
        groups: ["default"],
      },
      initialModels: ["gpt-4"],
      initialGroups: ["default"],
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })
})
