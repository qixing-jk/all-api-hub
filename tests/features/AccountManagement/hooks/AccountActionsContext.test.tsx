import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AccountActionsProvider,
  useAccountActionsContext,
} from "~/features/AccountManagement/hooks/AccountActionsContext"

// Verifies bulk external check-in behavior (unchecked-only vs open-all) and toast feedback.
const { mockLoadAccountData, mockSendRuntimeMessage, mockToast } = vi.hoisted(
  () => ({
    mockLoadAccountData: vi.fn(),
    mockSendRuntimeMessage: vi.fn(),
    mockToast: {
      success: vi.fn(),
      error: vi.fn(),
    },
  }),
)

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

vi.mock("~/services/accountStorage", () => ({
  accountStorage: {
    refreshAccount: vi.fn(),
  },
}))

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return { ...actual, sendRuntimeMessage: mockSendRuntimeMessage }
})

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    loadAccountData: mockLoadAccountData,
  }),
}))

/**
 * Helper component to capture and expose the AccountActionsContext value.
 */
function ContextProbe({
  onReady,
}: {
  onReady: (ctx: ReturnType<typeof useAccountActionsContext>) => void
}) {
  const ctx = useAccountActionsContext()
  useEffect(() => {
    onReady(ctx)
  }, [ctx, onReady])
  return null
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("AccountActionsContext", () => {
  it("opens only unchecked external check-ins by default", async () => {
    let captured: ReturnType<typeof useAccountActionsContext> | undefined
    render(
      <AccountActionsProvider>
        <ContextProbe onReady={(ctx) => (captured = ctx)} />
      </AccountActionsProvider>,
    )

    await waitFor(() => {
      expect(captured).toBeDefined()
    })

    const accounts = [
      {
        id: "a1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "a2",
        checkIn: { customCheckIn: { isCheckedInToday: false } },
      },
      {
        id: "a3",
        checkIn: { customCheckIn: {} },
      },
    ] as any

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          results: [],
          openedCount: 2,
          markedCount: 2,
          failedCount: 0,
          totalCount: 2,
        },
      })
      await captured!.handleOpenExternalCheckIns(accounts)
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["a2", "a3"],
      openInNewWindow: false,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("opens all external check-ins when openAll is true", async () => {
    let captured: ReturnType<typeof useAccountActionsContext> | undefined
    render(
      <AccountActionsProvider>
        <ContextProbe onReady={(ctx) => (captured = ctx)} />
      </AccountActionsProvider>,
    )

    await waitFor(() => {
      expect(captured).toBeDefined()
    })

    const accounts = [
      {
        id: "b1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "b2",
        checkIn: { customCheckIn: { isCheckedInToday: false } },
      },
    ] as any

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          results: [],
          openedCount: 2,
          markedCount: 2,
          failedCount: 0,
          totalCount: 2,
        },
      })
      await captured!.handleOpenExternalCheckIns(accounts, { openAll: true })
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["b1", "b2"],
      openInNewWindow: false,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("forwards openInNewWindow to background handler", async () => {
    let captured: ReturnType<typeof useAccountActionsContext> | undefined
    render(
      <AccountActionsProvider>
        <ContextProbe onReady={(ctx) => (captured = ctx)} />
      </AccountActionsProvider>,
    )

    await waitFor(() => {
      expect(captured).toBeDefined()
    })

    const accounts = [
      {
        id: "w1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "w2",
        checkIn: { customCheckIn: { isCheckedInToday: false } },
      },
    ] as any

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          results: [],
          openedCount: 1,
          markedCount: 1,
          failedCount: 0,
          totalCount: 1,
        },
      })
      await captured!.handleOpenExternalCheckIns(accounts, {
        openInNewWindow: true,
      })
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["w2"],
      openInNewWindow: true,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("shows a toast when no unchecked external check-ins remain", async () => {
    let captured: ReturnType<typeof useAccountActionsContext> | undefined
    render(
      <AccountActionsProvider>
        <ContextProbe onReady={(ctx) => (captured = ctx)} />
      </AccountActionsProvider>,
    )

    await waitFor(() => {
      expect(captured).toBeDefined()
    })

    const accounts = [
      {
        id: "c1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "c2",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
    ] as any

    await act(async () => {
      await captured!.handleOpenExternalCheckIns(accounts)
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:toast.error.externalCheckInNonePending",
    )
  })
})
