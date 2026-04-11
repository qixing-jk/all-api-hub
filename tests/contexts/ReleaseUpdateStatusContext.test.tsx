import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
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
})
