import { describe, expect, it, vi } from "vitest"

import { LinkedCredentialProfileDialogs } from "~/features/KeyManagement/associations/LinkedCredentialProfileDialogs"
import type { LinkedCredentialProfileActionsController } from "~/features/KeyManagement/associations/useLinkedCredentialProfileActions"
import { createProfileCredentialExportSource } from "~/services/apiCredentialProfiles/credentialExport"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/features/CredentialExport/CCSwitchExportDialog", () => ({
  CCSwitchExportDialog: () => <div data-testid="cc-switch-dialog" />,
}))

vi.mock("~/features/CredentialExport/AiToolboxExportDialog", () => ({
  AiToolboxExportDialog: () => <div data-testid="ai-toolbox-dialog" />,
}))

vi.mock("~/features/CredentialExport/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: () => (
    <div data-testid="claude-code-router-dialog" />
  ),
}))

vi.mock("~/components/CliProxyApiExportDialog", () => ({
  CliProxyApiExportDialog: () => <div data-testid="cli-proxy-dialog" />,
}))

vi.mock("~/features/CredentialExport/CursorPlusExportDialog", () => ({
  CursorPlusExportDialog: () => <div data-testid="cursor-plus-dialog" />,
}))

vi.mock("~/features/Verification/cli", () => ({
  VerifyCliSupportDialog: () => <div data-testid="verify-cli-dialog" />,
}))

vi.mock("~/features/CredentialExport/KelivoExportDialog", () => ({
  KelivoExportDialog: () => <div data-testid="kelivo-dialog" />,
}))

vi.mock(
  "~/features/ApiCredentialProfiles/export/KiloCodeProfileExportDialog",
  () => ({
    KiloCodeProfileExportDialog: () => <div data-testid="kilo-code-dialog" />,
  }),
)

vi.mock(
  "~/features/ApiCredentialProfiles/verification/VerifyApiCredentialProfileDialog",
  () => ({
    VerifyApiCredentialProfileDialog: () => (
      <div data-testid="verify-api-dialog" />
    ),
  }),
)

const profile = {
  id: "profile-example",
  name: "Example profile",
  apiType: "openai-compatible",
  baseUrl: "https://api.example.invalid/v1",
  apiKey: "sk-example",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
} as ApiCredentialProfile

const buildController = (
  activeDialog: LinkedCredentialProfileActionsController["activeDialog"],
) =>
  ({
    activeDialog,
    claudeCodeRouterApiKey: "",
    claudeCodeRouterBaseUrl: "",
    closeDialog: vi.fn(),
    exportSource: createProfileCredentialExportSource(profile),
  }) as unknown as LinkedCredentialProfileActionsController

const activeDialogCases = [
  ["cc-switch", "cc-switch-dialog"],
  ["ai-toolbox", "ai-toolbox-dialog"],
  ["cursor-plus", "cursor-plus-dialog"],
  ["kilo-code", "kilo-code-dialog"],
  ["kelivo", "kelivo-dialog"],
  ["claude-code-router", "claude-code-router-dialog"],
  ["verify-api", "verify-api-dialog"],
  ["verify-cli", "verify-cli-dialog"],
] as const

describe("LinkedCredentialProfileDialogs", () => {
  it("mounts no dialog while no linked-profile action is active", () => {
    const { container } = render(
      <LinkedCredentialProfileDialogs
        controller={buildController(null)}
        profile={profile}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    expect(container).toBeEmptyDOMElement()
  })

  it.each(activeDialogCases)(
    "mounts only the active %s linked-profile dialog",
    (activeDialog, activeTestId) => {
      render(
        <LinkedCredentialProfileDialogs
          controller={buildController(activeDialog)}
          profile={profile}
        />,
        { withThemeProvider: false, withUserPreferencesProvider: false },
      )

      expect(screen.getByTestId(activeTestId)).toBeVisible()
      for (const [, inactiveTestId] of activeDialogCases) {
        if (inactiveTestId === activeTestId) continue
        expect(screen.queryByTestId(inactiveTestId)).not.toBeInTheDocument()
      }
    },
  )
})
