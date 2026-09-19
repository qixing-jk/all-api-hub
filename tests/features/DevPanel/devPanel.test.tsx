import { act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useUpdateLogDialogContext } from "~/components/dialogs/UpdateLogDialog"
import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { DevPanel } from "~/features/DevPanel/DevPanel"
import {
  DevPanelProvider,
  useRegisterDevPanelSection,
} from "~/features/DevPanel/DevPanelSectionsContext"
import { debugQueuePopupInterruptionHint } from "~/services/popupInterruptionHint"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getExtensionVersion } from "~/utils/browser/browserApi"
import { openPermissionsOnboardingPage } from "~/utils/navigation"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock("~/components/dialogs/UpdateLogDialog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/components/dialogs/UpdateLogDialog")
    >()

  return {
    ...actual,
    useUpdateLogDialogContext: vi.fn(),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    getExtensionVersion: vi.fn(() => ""),
    getManifest: vi.fn(() => ({
      manifest_version: 3,
      optional_permissions: [],
    })),
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openPermissionsOnboardingPage: vi.fn(),
  }
})

vi.mock("~/services/popupInterruptionHint", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/popupInterruptionHint")>()

  return {
    ...actual,
    debugQueuePopupInterruptionHint: vi.fn(),
  }
})

vi.mock("~/features/DevPanel/fixtureAccounts", () => ({
  countDevFixtureAccounts: vi.fn(async () => 0),
  addDevFixtureAccounts: vi.fn(async () => 0),
  clearDevFixtureAccounts: vi.fn(async () => 0),
}))

const mockedUseUpdateLogDialogContext = vi.mocked(useUpdateLogDialogContext)
const mockedGetExtensionVersion = vi.mocked(getExtensionVersion)
const mockedOpenPermissionsOnboardingPage = vi.mocked(
  openPermissionsOnboardingPage,
)
const mockedDebugQueuePopupInterruptionHint = vi.mocked(
  debugQueuePopupInterruptionHint,
)

async function openDevPanel() {
  await act(async () => {
    fireEvent.click(
      await screen.findByRole("button", { name: "Dev: Open dev panel" }),
    )
  })
}

describe("DevPanel", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "development")
    mockedUseUpdateLogDialogContext.mockReset()
    mockedUseUpdateLogDialogContext.mockReturnValue({
      state: { isOpen: false, version: null },
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
    })
    mockedGetExtensionVersion.mockReturnValue("3.37.0")
    mockedOpenPermissionsOnboardingPage.mockReset()
    mockedOpenPermissionsOnboardingPage.mockResolvedValue(undefined)
    mockedDebugQueuePopupInterruptionHint.mockReset()
    mockedDebugQueuePopupInterruptionHint.mockResolvedValue(undefined)
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    vi.spyOn(changelogOnUpdateState, "setPendingVersion").mockResolvedValue(
      undefined,
    )
    vi.spyOn(changelogOnUpdateState, "consumePendingVersion").mockResolvedValue(
      "3.37.0",
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("renders nothing outside development mode", () => {
    vi.stubEnv("MODE", "production")

    render(
      <DevPanelProvider surface="options">
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    expect(
      screen.queryByRole("button", { name: "Dev: Open dev panel" }),
    ).not.toBeInTheDocument()
    expect(mockedUseUpdateLogDialogContext).not.toHaveBeenCalled()
  })

  it("hosts the global dialog debug actions behind the floating ball", async () => {
    const openDialog = vi.fn()
    mockedUseUpdateLogDialogContext.mockReturnValue({
      state: { isOpen: false, version: null },
      openDialog,
      closeDialog: vi.fn(),
    })

    render(
      <DevPanelProvider surface="options">
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()

    fireEvent.click(
      await screen.findByRole("button", { name: "Dev: Trigger update log" }),
    )
    await waitFor(() => {
      expect(openDialog).toHaveBeenCalledWith("3.37.0")
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "Dev: Trigger onboarding" }),
    )
    expect(mockedOpenPermissionsOnboardingPage).toHaveBeenCalledWith({
      reason: "debug",
    })
  })

  it("reports popup hint debug failures", async () => {
    mockedDebugQueuePopupInterruptionHint.mockRejectedValueOnce(
      new Error("storage blocked"),
    )

    render(
      <DevPanelProvider surface="options">
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dev: Queue popup interruption hint",
      }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Failed to queue popup interruption hint (dev): storage blocked",
      )
    })
  })

  it("shows page-scoped sections only on their matching page", async () => {
    function PageScopedSectionRegistrar() {
      useRegisterDevPanelSection({
        id: "page-scoped",
        title: "Page scoped",
        pages: [MENU_ITEM_IDS.AUTO_CHECKIN],
        actions: [{ id: "page-action", label: "Page action", run: () => {} }],
      })
      return null
    }

    const { unmount } = render(
      <DevPanelProvider surface="options" page={MENU_ITEM_IDS.AUTO_CHECKIN}>
        <PageScopedSectionRegistrar />
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    expect(await screen.findByText("Page action")).toBeVisible()

    unmount()
    render(
      <DevPanelProvider surface="options" page={MENU_ITEM_IDS.ACCOUNT}>
        <PageScopedSectionRegistrar />
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    expect(screen.queryByText("Page action")).not.toBeInTheDocument()
  })

  it("triggers the root translation crash fallback from the panel", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    try {
      render(
        <RootErrorBoundary reloadPage={vi.fn()}>
          <DevPanelProvider surface="options">
            <DevPanel />
          </DevPanelProvider>
        </RootErrorBoundary>,
        {
          withReleaseUpdateStatusProvider: false,
          withUserPreferencesProvider: false,
          withThemeProvider: false,
        },
      )

      await openDevPanel()
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Dev: Trigger translation crash",
        }),
      )

      expect(
        await screen.findByText(
          "common:rootErrorBoundary.translationDescription",
        ),
      ).toBeVisible()
      expect(
        screen.getByRole("link", {
          name: "common:rootErrorBoundary.requestLanguage",
        }),
      ).toHaveAttribute(
        "href",
        "https://github.com/qixing-jk/all-api-hub/issues/new?template=language_request.yml",
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
