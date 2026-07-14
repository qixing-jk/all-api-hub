import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function createStatusResponse(accountId: string, accountName: string) {
  return {
    success: true as const,
    data: {
      perAccount: {
        [accountId]: {
          accountId,
          accountName,
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1700000000000,
          message: "ok",
        },
      },
    },
  }
}

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/checkin/autoCheckin/messaging", () => ({
  sendAutoCheckinMessage: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AutoCheckin status view refresh", () => {
  it("reloads status when autoCheckin:runCompleted is received", async () => {
    const browserApi = await import("~/utils/browser/browserApi")

    const sendAutoCheckinMessageSpy = vi
      .mocked(sendAutoCheckinMessage)
      .mockImplementation(async (type: string) => {
        if (type === "autoCheckin:getStatus") {
          return { success: true, data: { perAccount: {} } }
        }
        return { success: true }
      })

    let runtimeListener: ((message: any) => void) | null = null
    vi.spyOn(browserApi, "onRuntimeMessage").mockImplementation((listener) => {
      runtimeListener = listener as any
      return () => {}
    })

    render(<AutoCheckin routeParams={{}} />)

    await screen.findByRole("button", { name: /execution\.runNow/i })
    await waitFor(() => {
      expect(sendAutoCheckinMessageSpy).toHaveBeenCalledWith(
        "autoCheckin:getStatus",
      )
    })

    sendAutoCheckinMessageSpy.mockClear()
    expect(runtimeListener).toBeTypeOf("function")

    await act(async () => {
      runtimeListener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "daily",
        updatedAccountIds: [],
        timestamp: Date.now(),
      })
    })

    await waitFor(() => {
      expect(sendAutoCheckinMessageSpy).toHaveBeenCalledWith(
        "autoCheckin:getStatus",
      )
    })
  })

  it("keeps overlapping loads locked, clears manual attribution independently, and ignores stale status", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")
    const manualStatus =
      createDeferred<ReturnType<typeof createStatusResponse>>()
    const staleRuntimeStatus =
      createDeferred<ReturnType<typeof createStatusResponse>>()
    const latestRuntimeStatus =
      createDeferred<ReturnType<typeof createStatusResponse>>()
    let getStatusCalls = 0

    vi.mocked(sendAutoCheckinMessage).mockImplementation(
      async (type: string) => {
        if (type !== "autoCheckin:getStatus") {
          return { success: true }
        }

        getStatusCalls += 1
        if (getStatusCalls === 1) {
          return createStatusResponse("initial", "Initial account")
        }
        if (getStatusCalls === 2) {
          return await manualStatus.promise
        }
        if (getStatusCalls === 3) {
          return await staleRuntimeStatus.promise
        }
        return await latestRuntimeStatus.promise
      },
    )

    let runtimeListener: ((message: any) => void) | null = null
    vi.spyOn(browserApi, "onRuntimeMessage").mockImplementation((listener) => {
      runtimeListener = listener as any
      return () => {}
    })

    render(<AutoCheckin routeParams={{}} />)

    await screen.findByText("Initial account")
    expect(runtimeListener).toBeTypeOf("function")

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.refresh",
      }),
    )
    await waitFor(() => expect(getStatusCalls).toBe(2))

    const pendingManualRefreshButton = screen.getByRole("button", {
      name: "common:status.refreshing",
    })
    expect(pendingManualRefreshButton).toBeDisabled()
    expect(pendingManualRefreshButton).toHaveAttribute("aria-busy", "true")

    await act(async () => {
      runtimeListener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "daily",
        updatedAccountIds: [],
        timestamp: Date.now(),
      })
    })
    await waitFor(() => expect(getStatusCalls).toBe(3))

    await act(async () => {
      manualStatus.resolve(
        createStatusResponse("manual", "Manual refresh account"),
      )
      await manualStatus.promise
    })

    await waitFor(() => {
      const aggregateLockedRefreshButton = screen.getByRole("button", {
        name: "autoCheckin:execution.refresh",
      })
      expect(aggregateLockedRefreshButton).toBeDisabled()
      expect(aggregateLockedRefreshButton).not.toHaveAttribute("aria-busy")
    })

    await act(async () => {
      runtimeListener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "daily",
        updatedAccountIds: [],
        timestamp: Date.now(),
      })
    })
    await waitFor(() => expect(getStatusCalls).toBe(4))

    await act(async () => {
      latestRuntimeStatus.resolve(
        createStatusResponse("latest", "Latest runtime account"),
      )
      await latestRuntimeStatus.promise
    })

    expect(await screen.findByText("Latest runtime account")).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.refresh",
      }),
    ).toBeDisabled()

    await act(async () => {
      staleRuntimeStatus.resolve(
        createStatusResponse("stale", "Stale runtime account"),
      )
      await staleRuntimeStatus.promise
    })

    await waitFor(() => {
      const restoredRefreshButton = screen.getByRole("button", {
        name: "autoCheckin:execution.refresh",
      })
      expect(restoredRefreshButton).toBeEnabled()
      expect(restoredRefreshButton).not.toHaveAttribute("aria-busy")
    })
    expect(screen.getByText("Latest runtime account")).toBeVisible()
    expect(screen.queryByText("Stale runtime account")).not.toBeInTheDocument()
  })
})
