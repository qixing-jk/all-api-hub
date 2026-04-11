import userEvent from "@testing-library/user-event"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { ReleaseUpdateStatusPanel } from "~/components/ReleaseUpdateStatusPanel"
import type { ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: toastMocks,
}))

const mockUseReleaseUpdateStatus = vi.fn()

vi.mock("~/contexts/ReleaseUpdateStatusContext", () => ({
  useReleaseUpdateStatus: () => mockUseReleaseUpdateStatus(),
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

function mockHook(status: ReleaseUpdateStatus | null) {
  mockUseReleaseUpdateStatus.mockReturnValue({
    status,
    isLoading: false,
    isChecking: false,
    error: null,
    refresh: vi.fn(),
    checkNow: vi.fn(),
  })
}

function mockInteractiveHook(params: {
  initialStatus: ReleaseUpdateStatus | null
  nextError?: string | null
  nextStatus: ReleaseUpdateStatus | null
}) {
  const checkNow = vi.fn(async () => params.nextStatus)

  mockUseReleaseUpdateStatus.mockImplementation(() => {
    const [status, setStatus] = React.useState(params.initialStatus)
    const [error, setError] = React.useState<string | null>(null)

    return {
      status,
      isLoading: false,
      isChecking: false,
      error,
      refresh: vi.fn(),
      checkNow: async () => {
        const next = await checkNow()
        setError(params.nextError ?? null)
        if (next) {
          setStatus(next)
        }
        return next
      },
    }
  })

  return checkNow
}

function mockHookState(overrides: {
  checkNow?: ReturnType<typeof vi.fn>
  error?: string | null
  isChecking?: boolean
  isLoading?: boolean
  status?: ReleaseUpdateStatus | null
}) {
  mockUseReleaseUpdateStatus.mockReturnValue({
    status: overrides.status ?? null,
    isLoading: overrides.isLoading ?? false,
    isChecking: overrides.isChecking ?? false,
    error: overrides.error ?? null,
    refresh: vi.fn(),
    checkNow: overrides.checkNow ?? vi.fn(),
  })
}

const renderSubject = () =>
  render(<ReleaseUpdateStatusPanel />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })

describe("ReleaseUpdateStatusPanel", () => {
  it("shows an error toast when checking now returns a failed status", async () => {
    const user = userEvent.setup()

    mockInteractiveHook({
      initialStatus: buildStatus(),
      nextStatus: buildStatus({
        checkedAt: Date.now(),
        lastError: "network error",
      }),
    })

    renderSubject()
    await user.click(
      screen.getByRole("button", { name: "settings:releaseUpdate.checkNow" }),
    )

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "settings:releaseUpdate.states.checkFailed",
      )
      expect(
        screen.getByText("settings:releaseUpdate.states.checkFailed"),
      ).toBeInTheDocument()
    })
  })

  it("updates the panel and shows a success toast when checking now finds an update", async () => {
    const user = userEvent.setup()

    mockInteractiveHook({
      initialStatus: buildStatus(),
      nextStatus: buildStatus({
        checkedAt: Date.now(),
        latestVersion: "3.32.0",
        updateAvailable: true,
        releaseUrl:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.32.0",
      }),
    })

    renderSubject()
    await user.click(
      screen.getByRole("button", { name: "settings:releaseUpdate.checkNow" }),
    )

    await waitFor(() => {
      expect(toastMocks.success).toHaveBeenCalledWith(
        "settings:releaseUpdate.states.updateAvailable",
      )
      expect(
        screen.getByText("settings:releaseUpdate.states.updateAvailable"),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("link", {
          name: "settings:releaseUpdate.downloadUpdate",
        }),
      ).toHaveAttribute(
        "href",
        "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.32.0",
      )
    })
  })

  it("updates the panel and shows a success toast when checking now confirms the latest version", async () => {
    const user = userEvent.setup()

    mockInteractiveHook({
      initialStatus: buildStatus(),
      nextStatus: buildStatus({
        checkedAt: Date.now(),
        latestVersion: "3.31.0",
        updateAvailable: false,
      }),
    })

    renderSubject()
    await user.click(
      screen.getByRole("button", { name: "settings:releaseUpdate.checkNow" }),
    )

    await waitFor(() => {
      expect(toastMocks.success).toHaveBeenCalledWith(
        "settings:releaseUpdate.states.upToDate",
      )
      expect(
        screen.getByText("settings:releaseUpdate.states.upToDate"),
      ).toBeInTheDocument()
    })
  })

  it("shows not-checked copy instead of up-to-date before the first check", () => {
    mockHook(buildStatus())

    renderSubject()

    expect(
      screen.getByText("settings:releaseUpdate.states.notChecked"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("settings:releaseUpdate.latestVersionPending"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("settings:releaseUpdate.helpers.notChecked"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.states.upToDate"),
    ).not.toBeInTheDocument()
  })

  it("shows a direct download action when a newer version is available", () => {
    mockHook(
      buildStatus({
        eligible: true,
        reason: "chromium-development",
        latestVersion: "3.32.0",
        updateAvailable: true,
        releaseUrl:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.32.0",
        checkedAt: Date.now(),
      }),
    )

    renderSubject()

    expect(
      screen.getByText("settings:releaseUpdate.states.updateAvailable"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("settings:releaseUpdate.helpers.manualUpdate"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: "settings:releaseUpdate.downloadUpdate",
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.32.0",
    )
  })

  it("shows an unavailable latest-version line after a failed check", () => {
    mockHook(
      buildStatus({
        lastError: "network error",
      }),
    )

    renderSubject()

    expect(
      screen.getByText("settings:releaseUpdate.states.checkFailed"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("settings:releaseUpdate.latestVersionUnavailable"),
    ).toBeInTheDocument()
  })

  it("falls back to localized unavailable copy instead of exposing raw errors", () => {
    mockHookState({
      status: null,
      error: "No listeners available",
    })

    renderSubject()

    expect(
      screen.getByText("settings:releaseUpdate.states.unavailable"),
    ).toBeInTheDocument()
    expect(screen.queryByText("No listeners available")).not.toBeInTheDocument()
  })
})
