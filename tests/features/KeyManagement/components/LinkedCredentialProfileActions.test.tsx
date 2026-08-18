import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LinkedCredentialProfileActions } from "~/features/KeyManagement/components/LinkedCredentialProfileActions"
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

vi.mock("~/components/ExportActionsMenu", () => ({
  EXPORT_ACTION_TARGETS: {
    CherryStudio: "cherryStudio",
    Kelivo: "kelivo",
    CCSwitch: "ccSwitch",
    KiloCode: "kiloCode",
    CursorPlus: "cursorPlus",
    CliProxy: "cliProxy",
    ClaudeCodeRouter: "claudeCodeRouter",
  },
  ExportActionsMenu: ({
    actions,
  }: {
    actions: Record<string, { onSelect: () => void }>
  }) => (
    <>
      {Object.entries(actions).map(([target, action]) => (
        <button
          key={target}
          type="button"
          data-testid={`export-${target}`}
          onClick={action.onSelect}
        >
          {target}
        </button>
      ))}
    </>
  ),
}))

vi.mock("~/components/ManagedSiteImportButton", () => ({
  ManagedSiteImportButton: ({ onImport }: { onImport: () => void }) => (
    <button type="button" onClick={onImport}>
      Import managed site
    </button>
  ),
}))

vi.mock("~/components/ui", () => ({
  IconButton: ({
    "aria-label": ariaLabel,
    children,
    onClick,
  }: {
    "aria-label": string
    children: ReactNode
    onClick: () => void
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock("~/features/KeyManagement/components/KeyResourceCard", () => ({
  KeyResourceActionGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  KeyResourceActionToolbar: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock(
  "~/features/KeyManagement/components/LinkedCredentialProfileDialogs",
  () => ({
    LinkedCredentialProfileDialogs: () => <div data-testid="dialog-host" />,
  }),
)

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
      handleCherryStudio: handleCherryStudioMock,
      handleClaudeCodeRouter: handleClaudeCodeRouterMock,
      handleCliProxy: handleCliProxyMock,
      handleManagedSiteImport: handleManagedSiteImportMock,
      managedSiteLabel: "Managed site",
      managedSiteType: "new-api",
      openDialog: openDialogMock,
    })
  })

  it("routes every integration, diagnostic, and management action", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <LinkedCredentialProfileActions
        profile={profile}
        managementActions={<button type="button">Delete profile</button>}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "Import managed site" }),
    )
    expect(handleManagedSiteImportMock).toHaveBeenCalledOnce()

    await user.click(screen.getByTestId("export-cherryStudio"))
    await user.click(screen.getByTestId("export-cliProxy"))
    await user.click(screen.getByTestId("export-claudeCodeRouter"))
    expect(handleCherryStudioMock).toHaveBeenCalledOnce()
    expect(handleCliProxyMock).toHaveBeenCalledOnce()
    expect(handleClaudeCodeRouterMock).toHaveBeenCalledOnce()

    for (const [target, dialog] of [
      ["kelivo", "kelivo"],
      ["ccSwitch", "cc-switch"],
      ["cursorPlus", "cursor-plus"],
      ["kiloCode", "kilo-code"],
    ] as const) {
      await user.click(screen.getByTestId(`export-${target}`))
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
