import { describe, expect, it, vi } from "vitest"

import { ReleaseUpdateStatusPanel } from "~/components/ReleaseUpdateStatusPanel"
import type { ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
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
