import { describe, expect, it, vi } from "vitest"

import { LinkedCredentialProfileDialogs } from "~/features/KeyManagement/components/LinkedCredentialProfileDialogs"
import type { LinkedCredentialProfileActionsController } from "~/features/KeyManagement/components/useLinkedCredentialProfileActions"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/components/CCSwitchExportDialog", () => ({
  CCSwitchExportDialog: () => <div data-testid="cc-switch-dialog" />,
}))

vi.mock("~/components/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: () => (
    <div data-testid="claude-code-router-dialog" />
  ),
}))

vi.mock("~/components/CliProxyExportDialog", () => ({
  CliProxyExportDialog: () => <div data-testid="cli-proxy-dialog" />,
}))

vi.mock("~/components/CursorPlusExportDialog", () => ({
  CursorPlusExportDialog: () => <div data-testid="cursor-plus-dialog" />,
}))

vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: () => <div data-testid="verify-cli-dialog" />,
}))

vi.mock("~/components/KelivoExportDialog", () => ({
  KelivoExportDialog: () => <div data-testid="kelivo-dialog" />,
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog",
  () => ({
    KiloCodeProfileExportDialog: () => <div data-testid="kilo-code-dialog" />,
  }),
)

vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
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
    cliProxyPayload: { account: {}, token: {} },
    closeDialog: vi.fn(),
    exportAccount: {},
    exportRuntimeKey: {},
    exportToken: {},
  }) as unknown as LinkedCredentialProfileActionsController

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

  it("mounts only the active linked-profile dialog", () => {
    render(
      <LinkedCredentialProfileDialogs
        controller={buildController("kelivo")}
        profile={profile}
      />,
      { withThemeProvider: false, withUserPreferencesProvider: false },
    )

    expect(screen.getByTestId("kelivo-dialog")).toBeVisible()
    expect(screen.queryByTestId("cc-switch-dialog")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cli-proxy-dialog")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cursor-plus-dialog")).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("claude-code-router-dialog"),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId("kilo-code-dialog")).not.toBeInTheDocument()
    expect(screen.queryByTestId("verify-api-dialog")).not.toBeInTheDocument()
    expect(screen.queryByTestId("verify-cli-dialog")).not.toBeInTheDocument()
  })
})
