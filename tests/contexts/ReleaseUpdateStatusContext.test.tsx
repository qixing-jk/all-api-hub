import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  ReleaseUpdateStatusProvider,
  useReleaseUpdateStatus,
} from "~/contexts/ReleaseUpdateStatusContext"

const { requestReleaseUpdateCheckNowMock, requestReleaseUpdateStatusMock } =
  vi.hoisted(() => ({
    requestReleaseUpdateCheckNowMock: vi.fn(),
    requestReleaseUpdateStatusMock: vi.fn(),
  }))

vi.mock("~/services/updates/runtime", () => ({
  requestReleaseUpdateCheckNow: requestReleaseUpdateCheckNowMock,
  requestReleaseUpdateStatus: requestReleaseUpdateStatusMock,
}))

function Consumer({ label }: { label: string }) {
  const { isLoading, status } = useReleaseUpdateStatus()

  return (
    <div>{`${label}:${isLoading ? "loading" : status?.currentVersion}`}</div>
  )
}

function Wrapper({ children }: { children: ReactNode }) {
  return <ReleaseUpdateStatusProvider>{children}</ReleaseUpdateStatusProvider>
}

function CheckNowConsumer() {
  const { checkNow, error, status } = useReleaseUpdateStatus()
  const [result, setResult] = useState("idle")

  return (
    <>
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
      <div>{`status:${status?.currentVersion ?? "none"}`}</div>
      <div>{`error:${error ?? "none"}`}</div>
      <div>{`result:${result}`}</div>
    </>
  )
}

describe("ReleaseUpdateStatusProvider", () => {
  it("shares one initial fetch across multiple consumers", async () => {
    requestReleaseUpdateStatusMock.mockResolvedValue({
      success: true,
      data: {
        eligible: true,
        reason: "chromium-development",
        currentVersion: "3.31.0",
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
        checkedAt: null,
        lastError: null,
      },
    })
    requestReleaseUpdateCheckNowMock.mockResolvedValue({
      success: true,
      data: {
        eligible: true,
        reason: "chromium-development",
        currentVersion: "3.31.0",
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
        checkedAt: null,
        lastError: null,
      },
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

  it("returns null when a manual check fails instead of returning stale status", async () => {
    const user = userEvent.setup()

    requestReleaseUpdateStatusMock.mockResolvedValue({
      success: true,
      data: {
        eligible: true,
        reason: "chromium-development",
        currentVersion: "3.31.0",
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: "https://github.com/qixing-jk/all-api-hub/releases/latest",
        checkedAt: null,
        lastError: null,
      },
    })
    requestReleaseUpdateCheckNowMock.mockResolvedValue({
      success: false,
      error: "runtime failed",
    })

    render(
      <Wrapper>
        <CheckNowConsumer />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("status:3.31.0")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "check-now" }))

    await waitFor(() => {
      expect(screen.getByText("result:null")).toBeInTheDocument()
      expect(screen.getByText("error:runtime failed")).toBeInTheDocument()
    })
  })
})
