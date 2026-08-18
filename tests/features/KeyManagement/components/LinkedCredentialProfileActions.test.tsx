import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LinkedCredentialProfileActions } from "~/features/KeyManagement/components/LinkedCredentialProfileActions"
import type { LinkedCredentialProfileActionsController } from "~/features/KeyManagement/components/useLinkedCredentialProfileActions"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

const {
  handleCherryStudioMock,
  handleClaudeCodeRouterMock,
  handleCliProxyMock,
  handleManagedSiteImportMock,
  openDialogMock,
  useLinkedCredentialProfileActionsMock,
} = vi.hoisted(() => ({
  handleCherryStudioMock: vi.fn(),
  handleClaudeCodeRouterMock: vi.fn(),
  handleCliProxyMock: vi.fn(),
  handleManagedSiteImportMock: vi.fn(),
  openDialogMock: vi.fn(),
  useLinkedCredentialProfileActionsMock: vi.fn(),
}))

vi.mock(
  "~/features/KeyManagement/components/useLinkedCredentialProfileActions",
  () => ({
    LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT: {},
    useLinkedCredentialProfileActions: useLinkedCredentialProfileActionsMock,
  }),
)

const profile = {
  id: "profile-example",
  name: "Example profile",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://api.example.invalid",
  apiKey: "sk-example",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
} satisfies ApiCredentialProfile

describe("LinkedCredentialProfileActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLinkedCredentialProfileActionsMock.mockReturnValue({
      activeDialog: null,
      handleCherryStudio: handleCherryStudioMock,
      handleClaudeCodeRouter: handleClaudeCodeRouterMock,
      handleCliProxy: handleCliProxyMock,
      handleManagedSiteImport: handleManagedSiteImportMock,
      managedSiteLabel: "Managed site",
      managedSiteType: "new-api",
      openDialog: openDialogMock,
    } as unknown as LinkedCredentialProfileActionsController)
  })

  it("renders the real action surfaces and routes every target", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <LinkedCredentialProfileActions
        profile={profile}
        managementActions={<button type="button">Delete profile</button>}
      />,
    )

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton),
    )
    expect(handleManagedSiteImportMock).toHaveBeenCalledOnce()

    const openExportMenu = () =>
      user.click(
        screen.getByTestId(
          KEY_MANAGEMENT_TEST_IDS.linkedProfileExportMenuButton,
        ),
      )
    for (const [label, callback] of [
      ["keyManagement:actions.useInCherry", handleCherryStudioMock],
      ["keyManagement:actions.importToCliProxy", handleCliProxyMock],
      [
        "keyManagement:actions.importToClaudeCodeRouter",
        handleClaudeCodeRouterMock,
      ],
    ] as const) {
      await openExportMenu()
      await user.click(screen.getByRole("menuitem", { name: label }))
      expect(callback).toHaveBeenCalledOnce()
    }

    for (const [label, dialog] of [
      ["keyManagement:actions.copyKelivoImportCode", "kelivo"],
      ["keyManagement:actions.exportToCCSwitch", "cc-switch"],
      ["keyManagement:actions.exportToCursorPlus", "cursor-plus"],
      ["keyManagement:actions.exportToKiloCode", "kilo-code"],
    ] as const) {
      await openExportMenu()
      await user.click(screen.getByRole("menuitem", { name: label }))
      expect(openDialogMock).toHaveBeenCalledWith(dialog)
    }

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyApi",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyCliSupport",
      }),
    )
    expect(openDialogMock).toHaveBeenCalledWith("verify-api")
    expect(openDialogMock).toHaveBeenCalledWith("verify-cli")
    expect(screen.getByRole("button", { name: "Delete profile" })).toBeVisible()

    rerender(<LinkedCredentialProfileActions profile={profile} />)
    expect(
      screen.queryByRole("button", { name: "Delete profile" }),
    ).not.toBeInTheDocument()
  })
})
