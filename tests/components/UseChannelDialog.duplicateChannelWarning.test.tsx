import { renderHook } from "@testing-library/react"
import { act } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useChannelDialog } from "~/components/ChannelDialog/hooks/useChannelDialog"
import { DIALOG_MODES } from "~/constants/dialogModes"

const {
  mockOpenDialog,
  mockRequestDuplicateChannelWarning,
  mockToastLoading,
  mockToastDismiss,
  mockToastError,
  mockGetManagedSiteService,
  mockConvertToDisplayData,
  mockEnsureAccountApiToken,
} = vi.hoisted(() => ({
  mockOpenDialog: vi.fn(),
  mockRequestDuplicateChannelWarning:
    vi.fn<(options: { existingChannelName: string }) => Promise<boolean>>(),
  mockToastLoading: vi.fn(),
  mockToastDismiss: vi.fn(),
  mockToastError: vi.fn(),
  mockGetManagedSiteService: vi.fn(),
  mockConvertToDisplayData: vi.fn(),
  mockEnsureAccountApiToken: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: mockToastLoading,
    dismiss: mockToastDismiss,
    error: mockToastError,
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("~/components/ChannelDialog/context/ChannelDialogContext", () => ({
  useChannelDialogContext: () => ({
    openDialog: mockOpenDialog,
    requestDuplicateChannelWarning: mockRequestDuplicateChannelWarning,
  }),
}))

vi.mock("~/services/managedSiteService", () => ({
  getManagedSiteService: mockGetManagedSiteService,
}))

vi.mock("~/services/accountStorage", () => ({
  accountStorage: {
    convertToDisplayData: mockConvertToDisplayData,
    getAccountById: vi.fn(),
  },
}))

vi.mock("~/services/accountOperations", () => ({
  ensureAccountApiToken: mockEnsureAccountApiToken,
}))

describe("useChannelDialog duplicate channel warning", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockToastLoading.mockReturnValue("toast-id")
    mockConvertToDisplayData.mockReturnValue({
      id: "account-id",
      name: "Account",
      baseUrl: "https://upstream.example.com",
    })
    mockEnsureAccountApiToken.mockImplementation(() => {
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
    mockGetManagedSiteService.mockResolvedValue(mockService)
    mockRequestDuplicateChannelWarning.mockResolvedValue(false)

    const { result } = renderHook(() => useChannelDialog())

    await act(async () => {
      await result.current.openWithAccount(
        { id: "account-id", created_at: "2020-01-01" } as any,
        { key: "token" } as any,
      )
    })

    expect(mockRequestDuplicateChannelWarning).toHaveBeenCalledWith({
      existingChannelName: "Existing channel",
    })
    expect(mockOpenDialog).not.toHaveBeenCalled()
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
    mockGetManagedSiteService.mockResolvedValue(mockService)
    mockRequestDuplicateChannelWarning.mockResolvedValue(true)

    const { result } = renderHook(() => useChannelDialog())

    await act(async () => {
      await result.current.openWithAccount(
        { id: "account-id", created_at: "2020-01-01" } as any,
        { key: "token" } as any,
      )
    })

    expect(mockRequestDuplicateChannelWarning).toHaveBeenCalledWith({
      existingChannelName: "Existing channel",
    })
    expect(mockOpenDialog).toHaveBeenCalledWith({
      mode: DIALOG_MODES.ADD,
      initialValues: {
        name: "Auto channel",
        models: ["gpt-4"],
        groups: ["default"],
      },
      initialModels: ["gpt-4"],
      initialGroups: ["default"],
      onSuccess: expect.any(Function),
    })
    expect(mockToastError).not.toHaveBeenCalled()
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id")
  })
})
