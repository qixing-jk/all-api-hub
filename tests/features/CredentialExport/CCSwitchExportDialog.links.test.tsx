import { writeFileSync } from "node:fs"
import userEvent from "@testing-library/user-event"
import { afterAll, describe, expect, it, vi } from "vitest"

import { CCSwitchExportDialog } from "~/features/CredentialExport/CCSwitchExportDialog"
import { createAccountExportSource } from "~~/tests/test-utils/credentialExportSources"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  discoverOpenAICompatibleModels: async () => ({
    models: [{ id: "claude-sonnet-test" }],
    resolvedBaseUrl: "https://relay.test/proxy/v1",
  }),
}))

const captures: { app: string; url: string }[] = []
afterAll(() => {
  if (process.env.CCSWITCH_LINK_PROBE_OUTPUT)
    writeFileSync(
      process.env.CCSWITCH_LINK_PROBE_OUTPUT,
      JSON.stringify(captures, null, 2),
    )
})

describe("CC Switch export links from the dialog", () => {
  it.each([
    ["claude", "claude", "https://anthropic.test/proxy"],
    ["claude-desktop", "claudeDesktop", "https://anthropic.test/proxy"],
    ["codex", "codex", "https://relay.test/proxy/v1"],
    ["gemini", "gemini", "https://relay.test/proxy"],
    ["agy", "agy", "https://relay.test/proxy"],
    ["pi", "pi", "https://relay.test/proxy/v1"],
    ["mcode", "mcode", "https://relay.test/proxy/v1"],
    ["kimi", "kimi", "https://relay.test/proxy/v1"],
    ["dsh", "dsh", "https://relay.test/proxy/v1"],
    ["omp", "omp", "https://relay.test/proxy/v1"],
    ["grokbuild", "grokbuild", "https://relay.test/proxy/v1"],
    ["hermes", "hermes", "https://relay.test/proxy/v1"],
    ["opencode", "opencode", "https://relay.test/proxy/v1"],
    ["openclaw", "openclaw", "https://relay.test/proxy/v1"],
  ])("generates a provider link for %s", async (app, label, endpoint) => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <CCSwitchExportDialog
        isOpen
        onClose={onClose}
        source={{
          ...createAccountExportSource(
            {
              id: "probe",
              name: "Example",
              baseUrl: "https://relay.test/proxy/v1",
            },
            { key: "sk-fake+&=测试" },
          ),
          anthropicBaseUrl: "https://anthropic.test/proxy/v1",
        }}
      />,
    )
    await user.click(
      await screen.findByLabelText("ui:dialog.ccswitch.fields.app"),
    )
    await user.click(
      await screen.findByRole("option", {
        name: `ui:dialog.ccswitch.appOptions.${label}`,
      }),
    )
    const picker = screen.getByLabelText("ui:dialog.ccswitch.fields.model")
    await waitFor(() => expect(picker).not.toBeDisabled())
    await user.click(picker)
    await user.click(
      await screen.findByRole("option", { name: "claude-sonnet-test" }),
    )
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.ccswitch.actions.export" }),
    )
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    const url = String(openSpy.mock.calls[0]?.[0])
    const parsed = new URL(url)
    expect(parsed.protocol).toBe("ccswitch:")
    expect(parsed.host).toBe("v1")
    expect(parsed.pathname).toBe("/import")
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
      resource: "provider",
      app,
      endpoint,
      apiKey: "sk-fake+&=测试",
      model: "claude-sonnet-test",
    })
    expect(onClose).toHaveBeenCalledOnce()
    captures.push({ app, url })
    openSpy.mockRestore()
  })
})
