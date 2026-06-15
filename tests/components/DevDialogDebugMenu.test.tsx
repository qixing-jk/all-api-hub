import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DevDialogDebugMenu } from "~/components/DevDialogDebugMenu"
import { useUpdateLogDialogContext } from "~/components/dialogs/UpdateLogDialog"
import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { debugQueuePopupInterruptionHint } from "~/services/popupInterruptionHint"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getExtensionVersion } from "~/utils/browser/browserApi"
import { openPermissionsOnboardingPage } from "~/utils/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
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

const mockedUseUpdateLogDialogContext = vi.mocked(useUpdateLogDialogContext)
const mockedGetExtensionVersion = vi.mocked(getExtensionVersion)
const mockedOpenPermissionsOnboardingPage = vi.mocked(
  openPermissionsOnboardingPage,
)
const mockedDebugQueuePopupInterruptionHint = vi.mocked(
  debugQueuePopupInterruptionHint,
)

describe("DevDialogDebugMenu", () => {
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

  it("groups update-log, onboarding, and popup hint debug actions in one development menu", async () => {
    const user = userEvent.setup()
    const openDialog = vi.fn()
    mockedUseUpdateLogDialogContext.mockReturnValue({
      state: { isOpen: false, version: null },
      openDialog,
      closeDialog: vi.fn(),
    })

    render(<DevDialogDebugMenu />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Dev: Dialog debug menu" }),
    )

    await user.click(
      await screen.findByRole("menuitem", {
        name: "Dev: Trigger update log",
      }),
    )

    await waitFor(() => {
      expect(openDialog).toHaveBeenCalledWith("3.37.0")
    })

    await user.click(
      await screen.findByRole("button", { name: "Dev: Dialog debug menu" }),
    )
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Dev: Trigger onboarding",
      }),
    )

    expect(mockedOpenPermissionsOnboardingPage).toHaveBeenCalledWith({
      reason: "debug",
    })

    await user.click(
      await screen.findByRole("button", { name: "Dev: Dialog debug menu" }),
    )
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Dev: Queue popup interruption hint",
      }),
    )

    expect(mockedDebugQueuePopupInterruptionHint).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Queued popup interruption hint (dev)",
      )
    })
  })

  it("reports popup hint debug failures", async () => {
    const user = userEvent.setup()
    mockedDebugQueuePopupInterruptionHint.mockRejectedValueOnce(
      new Error("storage blocked"),
    )

    render(<DevDialogDebugMenu />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      await screen.findByRole("button", { name: "Dev: Dialog debug menu" }),
    )
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Dev: Queue popup interruption hint",
      }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Failed to queue popup interruption hint (dev): storage blocked",
      )
    })
  })

  it("triggers the root translation crash fallback from the development menu", async () => {
    const user = userEvent.setup()
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    try {
      render(
        <RootErrorBoundary reloadPage={vi.fn()}>
          <DevDialogDebugMenu />
        </RootErrorBoundary>,
        {
          withReleaseUpdateStatusProvider: false,
          withUserPreferencesProvider: false,
          withThemeProvider: false,
        },
      )

      await user.click(
        await screen.findByRole("button", { name: "Dev: Dialog debug menu" }),
      )
      await user.click(
        await screen.findByRole("menuitem", {
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

  it("does not render outside development mode", () => {
    vi.stubEnv("MODE", "production")

    render(<DevDialogDebugMenu />, {
      withReleaseUpdateStatusProvider: false,
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      screen.queryByRole("button", { name: "Dev: Dialog debug menu" }),
    ).not.toBeInTheDocument()
    expect(mockedUseUpdateLogDialogContext).not.toHaveBeenCalled()
  })
})
