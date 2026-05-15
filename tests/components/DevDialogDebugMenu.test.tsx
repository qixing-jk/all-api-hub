import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DevDialogDebugMenu } from "~/components/DevDialogDebugMenu"
import { useUpdateLogDialogContext } from "~/components/dialogs/UpdateLogDialog"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getManifest } from "~/utils/browser/browserApi"
import { openPermissionsOnboardingPage } from "~/utils/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

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

const mockedUseUpdateLogDialogContext = vi.mocked(useUpdateLogDialogContext)
const mockedGetManifest = vi.mocked(getManifest)
const mockedOpenPermissionsOnboardingPage = vi.mocked(
  openPermissionsOnboardingPage,
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
    mockedGetManifest.mockReturnValue({
      manifest_version: 3,
      optional_permissions: [],
      version: "3.37.0",
    } as any)
    mockedOpenPermissionsOnboardingPage.mockResolvedValue(undefined)
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

  it("groups update-log and onboarding debug actions in one development menu", async () => {
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
