import { act } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useUpdateLogDialogContext } from "~/components/dialogs/UpdateLogDialog"
import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { DevPanel } from "~/features/DevPanel/DevPanel"
import {
  DevPanelProvider,
  useRegisterDevPanelSection,
} from "~/features/DevPanel/DevPanelSectionsContext"
import {
  addDevFixtureApiCredentials,
  countDevFixtureApiCredentials,
} from "~/features/DevPanel/fixtureApiCredentials"
import { debugQueuePopupInterruptionHint } from "~/services/popupInterruptionHint"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getExtensionVersion } from "~/utils/browser/browserApi"
import { openPermissionsOnboardingPage } from "~/utils/navigation"
import {
  buildDevIdentity,
  DEV_IDENTITY_FIXTURE_COLOR,
  DEV_IDENTITY_FIXTURE_PATH,
  DEV_IDENTITY_FIXTURE_PATH_TAIL,
} from "~~/tests/test-utils/devIdentityFixtures"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { toastErrorMock, toastSuccessMock, getDevIdentityMock } = vi.hoisted(
  () => ({
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    getDevIdentityMock: vi.fn(),
  }),
)

vi.mock("~/utils/browser/extensionIdentity", () => ({
  getDevIdentity: (...args: unknown[]) => getDevIdentityMock(...args),
}))

const devIdentityFixture = buildDevIdentity()

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

vi.mock("~/features/DevPanel/fixtureApiCredentials", () => ({
  countDevFixtureApiCredentials: vi.fn(async () => 0),
  addDevFixtureApiCredentials: vi.fn(async () => 5),
  clearDevFixtureApiCredentials: vi.fn(async () => 0),
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
  it("offers credential fixtures on the credential page and refreshes their count", async () => {
    render(
      <DevPanelProvider
        surface="options"
        page={MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}
      >
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    const add = await screen.findByRole("button", {
      name: "Dev: Add 5 fixture credentials",
    })
    fireEvent.click(add)
    await waitFor(() =>
      expect(addDevFixtureApiCredentials).toHaveBeenCalledWith(5),
    )
    expect(countDevFixtureApiCredentials).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Dialogs" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })

  it("shows page actions first and folds unrelated sections individually", async () => {
    function PageSection() {
      useRegisterDevPanelSection({
        id: "page-task",
        title: "Page task",
        pages: [MENU_ITEM_IDS.AUTO_CHECKIN],
        actions: [
          { id: "run-page-task", label: "Run page task", run: () => {} },
        ],
      })
      return null
    }

    render(
      <DevPanelProvider surface="options" page={MENU_ITEM_IDS.AUTO_CHECKIN}>
        <PageSection />
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    expect(screen.getByRole("button", { name: "Run page task" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /Other tools/ }),
    ).not.toBeInTheDocument()
    const dialogs = screen.getByRole("button", { name: "Dialogs" })
    const devPages = screen.getByRole("button", { name: "Dev pages" })
    expect(dialogs).toHaveAttribute("aria-expanded", "false")
    expect(devPages).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.getByRole("button", { name: "Uninstall survey" }),
    ).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.getByRole("button", { name: /^Star promotion/ }),
    ).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("button", { name: /^This build/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    expect(
      screen.queryByRole("button", { name: "Dev: Trigger update log" }),
    ).not.toBeInTheDocument()
    expect(
      screen
        .getByRole("button", { name: "Run page task" })
        .compareDocumentPosition(dialogs) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.click(dialogs)
    expect(
      screen.getByRole("button", { name: "Dev: Trigger update log" }),
    ).toBeVisible()
    expect(devPages).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Fixture accounts")).not.toBeInTheDocument()
  })

  it("shows account fixtures on account pages but not on the credential page", async () => {
    const { unmount } = render(
      <DevPanelProvider surface="options" page={MENU_ITEM_IDS.ACCOUNT}>
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )
    await openDevPanel()
    expect(
      screen.getByRole("button", { name: "Dev: Add 5 fixture accounts" }),
    ).toBeVisible()

    unmount()
    render(
      <DevPanelProvider
        surface="options"
        page={MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}
      >
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )
    await openDevPanel()
    expect(screen.queryByText("Fixture accounts")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Dev: Add 5 fixture credentials" }),
    ).toBeVisible()
  })

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
    getDevIdentityMock.mockReturnValue(devIdentityFixture)
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
    fireEvent.click(screen.getByRole("button", { name: "Dialogs" }))

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
    fireEvent.click(screen.getByRole("button", { name: "Dialogs" }))
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

  it("closes the panel from the header button", async () => {
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
    expect(await screen.findByTestId("dev-panel")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close dev panel" }))
    expect(screen.queryByTestId("dev-panel")).not.toBeInTheDocument()
  })

  it("folds a section that only asks for a collapsed default", async () => {
    function CollapsedByDefaultSectionRegistrar() {
      useRegisterDevPanelSection({
        id: "collapsed-by-default",
        title: "Reference section",
        defaultCollapsed: true,
        summary: "folded",
        actions: [
          { id: "hidden-action", label: "Hidden action", run: () => {} },
        ],
      })
      return null
    }

    render(
      <DevPanelProvider surface="options">
        <CollapsedByDefaultSectionRegistrar />
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()

    const toggle = await screen.findByRole("button", {
      name: /Reference section/,
    })

    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Hidden action")).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(await screen.findByText("Hidden action")).toBeVisible()
  })

  it("marks the floating ball with the build's instance color and source path", async () => {
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

    const trigger = await screen.findByTestId("dev-panel-trigger")

    expect(screen.getByTestId("dev-panel-identity")).toHaveTextContent(
      DEV_IDENTITY_FIXTURE_PATH_TAIL,
    )
    expect(trigger.firstElementChild).toHaveStyle({
      borderColor: DEV_IDENTITY_FIXTURE_COLOR,
    })
  })

  it("reports the build's directories when the ball is hovered", async () => {
    const outputPath = `${DEV_IDENTITY_FIXTURE_PATH}\\.output\\chrome-mv3-dev`
    getDevIdentityMock.mockReturnValue(buildDevIdentity({ outputPath }))

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

    const trigger = await screen.findByTestId("dev-panel-trigger")
    fireEvent.mouseOver(trigger)

    await waitFor(() =>
      expect(screen.getByText(DEV_IDENTITY_FIXTURE_PATH)).toBeInTheDocument(),
    )
    expect(screen.getByText(outputPath)).toBeInTheDocument()
  })

  it("falls back to the badge code when the build baked no path", async () => {
    getDevIdentityMock.mockReturnValue(
      buildDevIdentity({ path: null, pathTail: null }),
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

    expect(await screen.findByTestId("dev-panel-identity")).toHaveTextContent(
      "TEM",
    )
  })

  it("keeps this build's details folded until they are asked for", async () => {
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

    const toggle = await screen.findByRole("button", { name: /^This build/ })

    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Source path")).not.toBeInTheDocument()
    // The folded header still answers "which build", from the same code the
    // toolbar badge and the floating ball show.
    expect(toggle).toHaveTextContent(DEV_IDENTITY_FIXTURE_PATH_TAIL)

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(await screen.findByText("Source path")).toBeVisible()
  })

  it("shows which build this instance is and copies its source path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
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
    fireEvent.click(await screen.findByRole("button", { name: /^This build/ }))

    expect(await screen.findByText("Source path")).toBeVisible()
    expect(screen.getByText(DEV_IDENTITY_FIXTURE_PATH)).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "Copy Source path" }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(DEV_IDENTITY_FIXTURE_PATH),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith("Dev: copied Source path")
  })

  it("labels the panel with the hosting surface", async () => {
    const { unmount } = render(
      <DevPanelProvider surface="sidepanel">
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    expect(await screen.findByText("Side panel")).toBeVisible()
    unmount()

    render(
      <DevPanelProvider surface="popup">
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    expect(await screen.findByText("Popup")).toBeVisible()
  })

  it("hides sections that belong to another surface", async () => {
    function OptionsOnlySectionRegistrar() {
      useRegisterDevPanelSection({
        id: "options-only",
        title: "Options only",
        surfaces: ["options"],
        actions: [{ id: "a", label: "Options action", run: () => {} }],
      })
      return null
    }

    render(
      <DevPanelProvider surface="popup">
        <OptionsOnlySectionRegistrar />
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    expect(screen.queryByText("Options action")).not.toBeInTheDocument()
  })

  it("runs a section action and shows its pending state", async () => {
    let release!: () => void
    const runMock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    function PendingSectionRegistrar() {
      const [isPending, setIsPending] = useState(false)
      useRegisterDevPanelSection({
        id: "pending-section",
        title: "Pending section",
        surfaces: ["options"],
        actions: [
          {
            id: "slow",
            label: "Slow action",
            loading: isPending,
            run: async () => {
              setIsPending(true)
              await runMock()
              setIsPending(false)
            },
          },
        ],
      })
      return null
    }

    render(
      <DevPanelProvider surface="options">
        <PendingSectionRegistrar />
        <DevPanel />
      </DevPanelProvider>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await openDevPanel()
    fireEvent.click(screen.getByRole("button", { name: "Pending section" }))
    fireEvent.click(await screen.findByRole("button", { name: "Slow action" }))

    await waitFor(() => {
      expect(runMock).toHaveBeenCalled()
    })
    const pendingButton = screen.getByRole("button", { name: "Slow action" })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute("aria-busy", "true")

    release()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Slow action" })).toBeEnabled()
    })
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
      fireEvent.click(screen.getByRole("button", { name: "Dialogs" }))
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
