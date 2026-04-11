import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ReleaseUpdateStatusProvider,
  useReleaseUpdateStatus,
} from "~/contexts/ReleaseUpdateStatusContext"
import type { ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"

const { requestReleaseUpdateCheckNowMock, requestReleaseUpdateStatusMock } =
  vi.hoisted(() => ({
    requestReleaseUpdateCheckNowMock: vi.fn(),
    requestReleaseUpdateStatusMock: vi.fn(),
  }))

vi.mock("~/services/updates/runtime", () => ({
  requestReleaseUpdateCheckNow: requestReleaseUpdateCheckNowMock,
  requestReleaseUpdateStatus: requestReleaseUpdateStatusMock,
}))

function buildStatus(
  overrides: Partial<ReleaseUpdateStatus> = {},
): ReleaseUpdateStatus {
  return {
    eligible: true,
    reason: "chromium-development",
    currentVersion: "3.31.0",
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
    checkedAt: null,
    lastError: null,
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function Consumer({ label }: { label: string }) {
  const { isLoading, status } = useReleaseUpdateStatus()

  return (
    <div>{`${label}:${isLoading ? "loading" : status?.currentVersion ?? "none"}`}</div>
  )
}

function StatusConsumer() {
  const { checkNow, error, isChecking, isLoading, refresh, status } =
    useReleaseUpdateStatus()
  const [result, setResult] = useState("idle")

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void refresh().then(() => {
            setResult("refreshed")
          })
        }}
      >
        refresh
      </button>
      <button
        type="button"
        onClick={() => {
          void checkNow().then((next) => {
            setResult(next ? next.currentVersion : "null")
          })
        }}
      >
        check-now
      </button>
      <div>{`loading:${isLoading ? "yes" : "no"}`}</div>
      <div>{`checking:${isChecking ? "yes" : "no"}`}</div>
      <div>{`status:${status?.currentVersion ?? "none"}`}</div>
      <div>{`error:${error ?? "none"}`}</div>
      <div>{`result:${result}`}</div>
    </>
  )
}

function Wrapper({ children }: { children: ReactNode }) {
  return <ReleaseUpdateStatusProvider>{children}</ReleaseUpdateStatusProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ReleaseUpdateStatusProvider", () => {
  it("shares one initial fetch across multiple consumers", async () => {
    requestReleaseUpdateStatusMock.mockResolvedValue({
      success: true,
      data: buildStatus(),
    })

    render(
      <Wrapper>
        <Consumer label="one" />
        <Consumer label="two" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("one:3.31.0")).toBeInTheDocument()
      expect(screen.getByText("two:3.31.0")).toBeInTheDocument()
    })

    expect(requestReleaseUpdateStatusMock).toHaveBeenCalledTimes(1)
  })

  it("exposes an initial fetch error when the status request returns success false", async () => {
    requestReleaseUpdateStatusMock.mockResolvedValue({
      success: false,
      error: "status unavailable",
    })

    render(
      <Wrapper>
        <StatusConsumer />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("loading:no")).toBeInTheDocument()
      expect(screen.getByText("status:none")).toBeInTheDocument()
      expect(screen.getByText("error:status unavailable")).toBeInTheDocument()
    })
  })

  it("exposes an initial fetch error when the status request rejects", async () => {
    requestReleaseUpdateStatusMock.mockRejectedValue(new Error("boom"))

    render(
      <Wrapper>
        <StatusConsumer />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("loading:no")).toBeInTheDocument()
      expect(screen.getByText("status:none")).toBeInTheDocument()
      expect(screen.getByText("error:boom")).toBeInTheDocument()
    })
  })

  it("refreshes status data when refresh succeeds", async () => {
    const user = userEvent.setup()

    requestReleaseUpdateStatusMock
      .mockResolvedValueOnce({
        success: true,
        data: buildStatus(),
      })
      .mockResolvedValueOnce({
        success: true,
        data: buildStatus({
          currentVersion: "3.32.0",
          checkedAt: 1,
        }),
      })

    render(
      <Wrapper>
        <StatusConsumer />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("status:3.31.0")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "refresh" }))

    await waitFor(() => {
      expect(screen.getByText("status:3.32.0")).toBeInTheDocument()
      expect(screen.getByText("error:none")).toBeInTheDocument()
      expect(screen.getByText("result:refreshed")).toBeInTheDocument()
    })

    expect(requestReleaseUpdateStatusMock).toHaveBeenCalledTimes(2)
  })

  it("preserves the last known status and surfaces an error when refresh rejects", async () => {
    const user = userEvent.setup()

    requestReleaseUpdateStatusMock
      .mockResolvedValueOnce({
        success: true,
        data: buildStatus(),
      })
      .mockRejectedValueOnce(new Error("refresh exploded"))

    render(
      <Wrapper>
        <StatusConsumer />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("status:3.31.0")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "refresh" }))

    await waitFor(() => {
      expect(screen.getByText("status:3.31.0")).toBeInTheDocument()
      expect(screen.getByText("error:refresh exploded")).toBeInTheDocument()
      expect(screen.getByText("result:refreshed")).toBeInTheDocument()
    })
  })

  it("returns null when a manual check fails instead of returning stale status", async () => {
    const user = userEvent.setup()

    requestReleaseUpdateStatusMock.mockResolvedValue({
      success: true,
      data: buildStatus(),
    })
    requestReleaseUpdateCheckNowMock.mockResolvedValue({
      success: false,
      error: "runtime failed",
    })

    render(
      <Wrapper>
        <StatusConsumer />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("status:3.31.0")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "check-now" }))

    await waitFor(() => {
      expect(screen.getByText("result:null")).toBeInTheDocument()
      expect(screen.getByText("error:runtime failed")).toBeInTheDocument()
      expect(screen.getByText("status:3.31.0")).toBeInTheDocument()
    })
  })

  it("keeps isChecking true until all overlapping checks finish", async () => {
    const user = userEvent.setup()
    const firstCheck = createDeferred<{
      success: true
      data: ReleaseUpdateStatus
    }>()
    const secondCheck = createDeferred<{
      success: true
      data: ReleaseUpdateStatus
    }>()

    requestReleaseUpdateStatusMock.mockResolvedValue({
      success: true,
      data: buildStatus(),
    })
    requestReleaseUpdateCheckNowMock
      .mockImplementationOnce(() => firstCheck.promise)
      .mockImplementationOnce(() => secondCheck.promise)

    render(
      <Wrapper>
        <StatusConsumer />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("status:3.31.0")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "check-now" }))
    await user.click(screen.getByRole("button", { name: "check-now" }))

    await waitFor(() => {
      expect(requestReleaseUpdateCheckNowMock).toHaveBeenCalledTimes(2)
      expect(screen.getByText("checking:yes")).toBeInTheDocument()
    })

    firstCheck.resolve({
      success: true,
      data: buildStatus({
        currentVersion: "3.32.0",
        checkedAt: 1,
      }),
    })

    await waitFor(() => {
      expect(screen.getByText("status:3.32.0")).toBeInTheDocument()
      expect(screen.getByText("checking:yes")).toBeInTheDocument()
    })

    secondCheck.resolve({
      success: true,
      data: buildStatus({
        currentVersion: "3.33.0",
        checkedAt: 2,
      }),
    })

    await waitFor(() => {
      expect(screen.getByText("status:3.33.0")).toBeInTheDocument()
      expect(screen.getByText("checking:no")).toBeInTheDocument()
      expect(screen.getByText("result:3.33.0")).toBeInTheDocument()
    })
  })
})
