import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AccountActionsProvider,
  useAccountActionsContext,
} from "~/features/AccountManagement/hooks/AccountActionsContext"

// Verifies bulk external check-in behavior (unchecked-only vs open-all) and toast feedback.
const {
  mockLoadAccountData,
  mockMarkCustomCheckIn,
  mockOpenExternalCheckInPages,
  mockToast,
} = vi.hoisted(() => ({
  mockLoadAccountData: vi.fn(),
  mockMarkCustomCheckIn: vi.fn().mockResolvedValue(true),
  mockOpenExternalCheckInPages: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

vi.mock("i18next", () => ({
  default: {
    t: vi.fn((key: string) => key),
  },
}))

vi.mock("~/services/accountStorage", () => ({
  accountStorage: {
    markAccountAsCustomCheckedIn: mockMarkCustomCheckIn,
    refreshAccount: vi.fn(),
  },
}))

vi.mock("~/utils/navigation", () => ({
  openExternalCheckInPages: mockOpenExternalCheckInPages,
}))

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
      await captured!.handleOpenExternalCheckIns(accounts)
    })

    expect(mockMarkCustomCheckIn).toHaveBeenCalledTimes(2)
    expect(mockMarkCustomCheckIn).toHaveBeenCalledWith("a2")
    expect(mockMarkCustomCheckIn).toHaveBeenCalledWith("a3")
    expect(mockOpenExternalCheckInPages).toHaveBeenCalledTimes(2)
    expect(mockOpenExternalCheckInPages).toHaveBeenCalledWith([accounts[1]])
    expect(mockOpenExternalCheckInPages).toHaveBeenCalledWith([accounts[2]])
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
      await captured!.handleOpenExternalCheckIns(accounts, { openAll: true })
    })

    expect(mockMarkCustomCheckIn).toHaveBeenCalledTimes(2)
    expect(mockOpenExternalCheckInPages).toHaveBeenCalledTimes(2)
    expect(mockOpenExternalCheckInPages).toHaveBeenCalledWith([accounts[0]])
    expect(mockOpenExternalCheckInPages).toHaveBeenCalledWith([accounts[1]])
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

    expect(mockMarkCustomCheckIn).not.toHaveBeenCalled()
    expect(mockOpenExternalCheckInPages).not.toHaveBeenCalled()
    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:toast.error.externalCheckInNonePending",
    )
  })
})
