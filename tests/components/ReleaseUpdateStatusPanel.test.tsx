import userEvent from "@testing-library/user-event"
import React from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { ReleaseUpdateStatusPanel } from "~/components/ReleaseUpdateStatusPanel"
import settingsEn from "~/locales/en/settings.json"
import type { ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: toastMocks,
}))

const mockUseReleaseUpdateStatus = vi.fn()

it("shows the actionable AMO version and links to AMO without unrelated metadata", async () => {
  mockHook(
    buildStatus({
      reason: "firefox-amo",
      latestVersion: "3.40.0",
      githubLatestVersion: "3.41.0",
      updateAvailable: true,
      releaseUrl: "https://addons.mozilla.org/firefox/addon/all-api-hub/",
    }),
  )
  const i18n = await createResourceTestI18n({ en: { settings: settingsEn } })
  render(
    <I18nextProvider i18n={i18n}>
      <ReleaseUpdateStatusPanel />
    </I18nextProvider>,
    { withThemeProvider: false, withUserPreferencesProvider: false },
  )
  expect(screen.getByText(/Firefox Add-ons.*3.40.0/)).toBeInTheDocument()
  expect(screen.queryByText(/GitHub.*3.41.0/)).not.toBeInTheDocument()
  expect(screen.queryByText("Update details")).not.toBeInTheDocument()
  expect(
    screen.getByRole("link", { name: /download update/i }),
  ).toHaveAttribute(
    "href",
    "https://addons.mozilla.org/firefox/addon/all-api-hub/",
  )
  expect(
    screen.queryByRole("button", { name: /reload/i }),
  ).not.toBeInTheDocument()
})

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
    selfUpdate: false,
    storeUpdate: {
      supported: false,
      status: "unsupported",
      version: null,
    },
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

  it("prioritizes the installed version and check action without diagnostic controls", () => {
    mockHook(buildStatus())

    renderSubject()

    expect(
      screen.getByRole("heading", {
        name: "about:releaseUpdate.currentVersion",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.latestVersionPending"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.helpers.notChecked"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.distributionChannel"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.details"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.states.upToDate"),
    ).not.toBeInTheDocument()
  })

  it("shows checking copy and disables check-now while a check is pending", () => {
    mockHookState({ status: buildStatus(), isChecking: true })

    renderSubject()

    const checkNowButton = screen.getByRole("button", {
      name: "common:status.checking",
    })
    expect(checkNowButton).toBeDisabled()
    expect(checkNowButton).toHaveAttribute("aria-busy", "true")
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

  it("points a self-updating build at the browser update controls instead of a download", async () => {
    const user = userEvent.setup()
    const checkNow = mockInteractiveHook({
      initialStatus: buildStatus(),
      nextStatus: buildStatus({
        reason: "github-release",
        selfUpdate: true,
        latestVersion: "3.32.0",
        updateAvailable: true,
        checkedAt: Date.now(),
      }),
    })

    renderSubject()
    await user.click(
      screen.getByRole("button", { name: "settings:releaseUpdate.checkNow" }),
    )

    await waitFor(() => {
      expect(checkNow).toHaveBeenCalled()
      // The browser installs the update itself; a manual check only reports it.
      expect(toastMocks.success).toHaveBeenCalledWith(
        "settings:releaseUpdate.states.selfUpdatePending",
      )
      expect(
        screen.getByText("settings:releaseUpdate.helpers.selfUpdate"),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("link", {
          name: "settings:releaseUpdate.downloadUpdate",
        }),
      ).not.toBeInTheDocument()
      // The release page stays reachable, but only to read what changed.
      expect(
        screen.getByRole("link", {
          name: "settings:releaseUpdate.viewReleaseNotes",
        }),
      ).toHaveAttribute(
        "href",
        "https://github.com/qixing-jk/all-api-hub/releases/latest",
      )
    })
  })

  it("shows store rollout pending copy when GitHub is newer but the store has no update yet", () => {
    mockHook(
      buildStatus({
        eligible: true,
        reason: "store-build",
        currentVersion: "3.50.0",
        latestVersion: "3.51.0",
        updateAvailable: true,
        releaseUrl:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.51.0",
        checkedAt: Date.now(),
        storeUpdate: {
          supported: true,
          status: "no_update",
          version: "3.50.0",
        },
      }),
    )

    renderSubject()

    expect(
      screen.getByText("settings:releaseUpdate.states.storeUpdatePending"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("settings:releaseUpdate.helpers.storeUpdate"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.states.updateAvailable"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", {
        name: "settings:releaseUpdate.changelog",
      }),
    ).toHaveAttribute("href", expect.stringContaining("/changelog.html"))
    expect(
      screen.queryByRole("link", {
        name: "settings:releaseUpdate.downloadUpdate",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows a store rollout pending toast after checking a store build with no browser update yet", async () => {
    const user = userEvent.setup()

    mockInteractiveHook({
      initialStatus: buildStatus({
        eligible: true,
        reason: "store-build",
        storeUpdate: {
          supported: true,
          status: "not_checked",
          version: null,
        },
      }),
      nextStatus: buildStatus({
        eligible: true,
        reason: "store-build",
        currentVersion: "3.50.0",
        latestVersion: "3.51.0",
        updateAvailable: true,
        checkedAt: Date.now(),
        storeUpdate: {
          supported: true,
          status: "no_update",
          version: "3.50.0",
        },
      }),
    })

    renderSubject()
    await user.click(
      screen.getByRole("button", { name: "settings:releaseUpdate.checkNow" }),
    )

    await waitFor(() => {
      expect(toastMocks.success).toHaveBeenCalledWith(
        "settings:releaseUpdate.states.storeUpdatePending",
      )
    })
  })

  it("shows a recoverable failure without an empty latest-version line", () => {
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
      screen.queryByText("settings:releaseUpdate.latestVersionUnavailable"),
    ).not.toBeInTheDocument()
  })

  it("omits install diagnostics for unsupported installs", () => {
    mockHook(
      buildStatus({
        eligible: false,
        reason: "unknown",
      }),
    )

    renderSubject()

    expect(
      screen.queryByText("settings:releaseUpdate.reasons.unknown"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.latestVersionUnavailable"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:releaseUpdate.latestVersionPending"),
    ).not.toBeInTheDocument()
  })

  it("allows a manual check when the install cannot use automatic checks", async () => {
    const user = userEvent.setup()
    const checkNow = vi.fn()

    mockHookState({
      status: buildStatus({
        eligible: false,
        reason: "unknown",
      }),
      checkNow,
    })

    renderSubject()
    await user.click(
      screen.getByRole("button", { name: "settings:releaseUpdate.checkNow" }),
    )

    expect(checkNow).toHaveBeenCalledOnce()
    expect(toastMocks.error).toHaveBeenCalledWith(
      "settings:releaseUpdate.states.checkFailed",
    )
  })

  it("allows store builds to check browser-store updates from the unified panel", async () => {
    const user = userEvent.setup()

    mockInteractiveHook({
      initialStatus: buildStatus({
        eligible: true,
        reason: "store-build",
        storeUpdate: {
          supported: true,
          status: "not_checked",
          version: null,
        },
      }),
      nextStatus: buildStatus({
        eligible: true,
        reason: "store-build",
        checkedAt: Date.now(),
        latestVersion: "3.32.0",
        updateAvailable: true,
        storeUpdate: {
          supported: true,
          status: "update_available",
          version: "3.32.0",
        },
      }),
    })

    renderSubject()
    await user.click(
      screen.getByRole("button", { name: "settings:releaseUpdate.checkNow" }),
    )

    await waitFor(() => {
      expect(toastMocks.success).toHaveBeenCalledWith(
        "settings:releaseUpdate.states.storeUpdateReady",
      )
      expect(
        screen.getByText("settings:releaseUpdate.states.storeUpdateReady"),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", {
          name: "settings:releaseUpdate.reloadToUpdate",
        }),
      ).toBeInTheDocument()
    })
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
    expect(
      screen.queryByText("settings:releaseUpdate.latestVersionUnavailable"),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("0.0.0")).not.toBeInTheDocument()
    expect(screen.queryByText("No listeners available")).not.toBeInTheDocument()
  })
})

it("shows the published Nightly revision with its download action", () => {
  mockHook(
    buildStatus({
      reason: "github-nightly",
      latestVersion: "bbbbbbb",
      updateAvailable: true,
      checkedAt: Date.now(),
    }),
  )
  renderSubject()
  expect(
    screen.getByText("settings:releaseUpdate.latestNightlyVersion"),
  ).toBeInTheDocument()
  expect(
    screen.getByRole("link", { name: "settings:releaseUpdate.downloadUpdate" }),
  ).toBeInTheDocument()
})
