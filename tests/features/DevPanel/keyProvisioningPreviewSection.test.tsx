import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import {
  DevPanelProvider,
  useDevPanelSections,
} from "~/features/DevPanel/DevPanelSectionsContext"
import { KeyProvisioningPreviewSection } from "~/features/DevPanel/sections/keyProvisioningPreviewSection"
import accountDialog from "~/locales/zh-CN/accountDialog.json"
import common from "~/locales/zh-CN/common.json"
import keyManagement from "~/locales/zh-CN/keyManagement.json"
import settings from "~/locales/zh-CN/settings.json"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const { nativePrepare, realSave } = vi.hoisted(() => ({
  nativePrepare: vi.fn(),
  realSave: vi.fn(),
}))
vi.mock(
  "~/services/accounts/accountKeyProvisioning",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/accounts/accountKeyProvisioning")
    >()),
    prepareAccountKeyProvisioning: nativePrepare,
  }),
)
vi.mock(
  "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction",
  () => ({ buildOneTimeApiKeyProfileSaveAction: realSave }),
)

function RegisteredActions() {
  return useDevPanelSections().flatMap((section) =>
    section.actions.map((action) => (
      <button key={action.id} onClick={action.run}>
        {action.label}
      </button>
    )),
  )
}
const i18n = await createResourceTestI18n(
  { "zh-CN": { common, keyManagement, settings, accountDialog } },
  "zh-CN",
)

function setup() {
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <DevPanelProvider surface="options" page="account">
        <KeyProvisioningPreviewSection />
        <RegisteredActions />
      </DevPanelProvider>
    </I18nextProvider>,
  )
  return user
}

describe("key provisioning dev preview", () => {
  it("lets AIHubMix previews cancel or confirm before creation and closes the preview", async () => {
    const user = setup()
    await user.click(
      await screen.findByRole("button", {
        name: "Dev: Preview key provisioning",
      }),
    )
    await user.click(screen.getByRole("combobox", { name: "Site type" }))
    await user.click(screen.getByRole("option", { name: "AIHubMix" }))
    await user.click(screen.getByRole("button", { name: "Start preview" }))
    await user.click(
      await screen.findByRole("button", { name: "稍后手动创建" }),
    )
    expect(
      screen.queryByRole("button", { name: "现在创建并查看" }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Start preview" }))
    await user.click(
      await screen.findByRole("button", { name: "现在创建并查看" }),
    )
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Simulate save" },
        { timeout: 3000 },
      ),
    )
    await user.click(
      within(screen.getByRole("dialog", { name: "立即保存完整密钥" }))
        .getAllByRole("button", { name: "关闭" })
        .at(-1)!,
    )
    await user.click(
      within(await screen.findByRole("dialog", { name: "准备账号密钥" }))
        .getAllByRole("button", { name: "关闭" })
        .at(-1)!,
    )
    expect(
      screen.getByRole("status", { name: "Preview results" }),
    ).toHaveTextContent("Created in preview: 1")
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Key provisioning preview" }),
      ).getByRole("button", { name: "common:actions.close" }),
    )
    expect(
      screen.queryByRole("dialog", { name: "Key provisioning preview" }),
    ).not.toBeInTheDocument()
  })
  it("registers a preview entry and lists every site type", async () => {
    const user = setup()
    await user.click(
      await screen.findByRole("button", {
        name: "Dev: Preview key provisioning",
      }),
    )
    expect(
      await screen.findByRole("dialog", { name: "Key provisioning preview" }),
    ).toBeVisible()
    expect(screen.getByText(/Uses simulated inventory and keys/)).toBeVisible()
    await user.click(screen.getByRole("combobox", { name: "Scope" }))
    expect(screen.getByRole("option", { name: "Default key" })).toBeVisible()
    await user.click(screen.getByRole("option", { name: "All groups" }))
    await user.click(screen.getByRole("combobox", { name: "Scenario" }))
    expect(
      screen.getByRole("option", { name: "Inventory read failure" }),
    ).toBeVisible()
    await user.click(
      screen.getByRole("option", {
        name: "Normal creation (multiple groups / channels)",
      }),
    )
    await user.click(screen.getByRole("combobox", { name: "Site type" }))
    expect(screen.getByRole("option", { name: "voapi-v2" })).toBeVisible()
    expect(screen.getByRole("option", { name: "grsai" })).toBeVisible()
    expect(screen.getByRole("option", { name: "freemodel" })).toBeVisible()
    expect(
      screen.getByRole("option", { name: "kimi-global" }),
    ).toBeInTheDocument()
  })
  it.each(["openrouter", "freemodel"])(
    "reuses the one-time dialog for %s but saves only inside the preview",
    async (siteType) => {
      const user = setup()
      const clipboardWrite = vi.spyOn(navigator.clipboard, "writeText")
      await user.click(
        await screen.findByRole("button", {
          name: "Dev: Preview key provisioning",
        }),
      )
      await user.click(screen.getByRole("combobox", { name: "Site type" }))
      await user.click(screen.getByRole("option", { name: siteType }))
      await user.click(screen.getByRole("button", { name: "Start preview" }))
      await user.click(
        await screen.findByRole(
          "button",
          { name: "Simulate save" },
          { timeout: 3000 },
        ),
      )
      expect(nativePrepare).not.toHaveBeenCalled()
      expect(realSave).not.toHaveBeenCalled()
      expect(clipboardWrite).not.toHaveBeenCalled()
      const secretDialog = screen.getByRole("dialog", {
        name: "立即保存完整密钥",
      })
      await user.click(
        within(secretDialog).getAllByRole("button", { name: "关闭" }).at(-1)!,
      )
      const result = await screen.findByRole("dialog", { name: "准备账号密钥" })
      await user.click(
        within(result).getAllByRole("button", { name: "关闭" }).at(-1)!,
      )
      await waitFor(() =>
        expect(
          screen.getByRole("status", { name: "Preview results" }),
        ).toHaveTextContent("Saved in preview: 1"),
      )
    },
  )
})
