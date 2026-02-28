import { beforeEach, describe, expect, it, vi } from "vitest"

import { useChannelDialogContext } from "~/components/ChannelDialog/context/ChannelDialogContext"
import { useChannelDialog } from "~/components/ChannelDialog/hooks/useChannelDialog"
import { ChannelType } from "~/constants"
import { DIALOG_MODES } from "~/constants/dialogModes"
import * as accountOperations from "~/services/accounts/accountOperations"
import { accountStorage } from "~/services/accounts/accountStorage"
import * as managedSiteService from "~/services/managedSiteService"
import type { ManagedSiteService } from "~/services/managedSiteService"
import { act, renderHook, waitFor } from "~/tests/test-utils/render"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"

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
const getAccountByIdSpy = vi.spyOn(accountStorage, "getAccountById")
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

const buildDisplaySiteData = (
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData => ({
  id: "account-id",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "newapi",
  baseUrl: "https://upstream.example.com",
  token: "access-token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
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
    getAccountByIdSpy.mockResolvedValue(buildSiteAccount())
    ensureAccountApiTokenSpy.mockImplementation(() => {
      throw new Error("ensureAccountApiToken should not be called in this test")
    })
  })

  it("shows warning and cancels when user does not continue", async () => {
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
        async () =>
          ({
            name: "Auto channel",
            type: ChannelType.OpenAI,
            key: "sk-test",
            base_url: "https://upstream.example.com",
            models: ["gpt-4"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: 1,
          }) satisfies ChannelFormData,
      ),
      findMatchingChannel: vi.fn(
        async () => ({ name: "Existing channel" }) as ManagedSiteChannel,
      ),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )

    const { result } = renderHook(() => ({
      dialog: useChannelDialog(),
      context: useChannelDialogContext(),
    }))

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })

    const openPromise = result.current.dialog.openWithAccount(
      buildDisplaySiteData(),
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
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
        async () =>
          ({
            name: "Auto channel",
            type: ChannelType.OpenAI,
            key: "sk-test",
            base_url: "https://upstream.example.com",
            models: ["gpt-4"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: 1,
          }) satisfies ChannelFormData,
      ),
      findMatchingChannel: vi.fn(
        async () => ({ name: "Existing channel" }) as ManagedSiteChannel,
      ),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )

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
