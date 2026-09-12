import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody"
import { getManagedResourceFieldPolicy } from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import enChannelDialog from "~/locales/en/channelDialog.json"
import enCommon from "~/locales/en/common.json"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import type {
  EditableResourceProjection,
  ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { withNewApiAdvancedEditor } from "~/services/apiAdapters/managedResources/newApiAdvancedEditor"
import { createNewApiEditEditor } from "~/services/apiAdapters/managedResources/newApiEditor"
import type { NewApiChannel } from "~/types/newApi"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const i18n = await createResourceTestI18n({
  en: {
    channelDialog: enChannelDialog,
    common: enCommon,
    managedSiteChannels: enManagedSiteChannels,
  },
})
const t = i18n.getFixedT("en")

async function setup(overrides: Partial<NewApiChannel> = {}) {
  const detail = buildManagedSiteChannel({
    name: "Channel",
    models: "model-a,model-b",
    auto_ban: 1,
    ...overrides,
  })
  const common = await createNewApiEditEditor(
    {
      canLoadSecret: false,
      loadSecret: vi.fn(),
      fetchModels: vi.fn(),
      fetchDraftModels: vi.fn(),
      loadEditorGroups: async () => ["default"],
    },
    detail,
  )
  const editor = withNewApiAdvancedEditor(common, detail)
  const submit = vi.fn()
  function Harness() {
    const [values, setValues] = useState<EditableResourceProjection>(
      editor.initialValues,
    )
    const [issues, setIssues] = useState<readonly ResourceFieldIssue[]>([])
    return (
      <I18nextProvider i18n={i18n}>
        <ManagedResourceEditorBody
          t={t}
          mode="edit"
          descriptors={editor.fields}
          policy={getManagedResourceFieldPolicy("new-api", "channel", "edit")!}
          values={values}
          fieldIssues={issues}
          onValueChange={(id, value) => {
            setValues((previous) => ({ ...previous, [id]: value }))
            setIssues([])
          }}
        />
        <button
          onClick={() => {
            const result = editor.validate(values)
            if (result.valid) submit(editor.buildCommand(values))
            else setIssues(result.issues)
          }}
        >
          Save
        </button>
      </I18nextProvider>
    )
  }
  const user = userEvent.setup()
  render(<Harness />)
  return { user, submit }
}

describe("New API advanced channel editing", () => {
  it("groups advanced fields, links detection switches and preserves edits across collapse", async () => {
    const { user, submit } = await setup({
      settings: JSON.stringify({
        upstream_model_update_check_enabled: true,
        upstream_model_update_auto_sync_enabled: true,
        upstream_model_update_last_check_time: 100,
        upstream_model_update_last_detected_models: ["new-model"],
      }),
    })
    const toggle = screen.getByRole("button", {
      name: "Upstream model detection",
    })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    for (const name of ["Routing", "Channel management", "Network settings"])
      await user.click(screen.getByRole("button", { name }))
    for (const name of [
      "Upstream model detection",
      "Basic & connection",
      "Models",
      "Routing",
      "Channel management",
      "Network settings",
    ])
      expect(screen.getByRole("group", { name })).toBeVisible()
    expect(screen.getByText("new-model")).toBeVisible()
    const detection = screen.getByRole("switch", {
      name: "Check upstream model updates",
    })
    const sync = screen.getByRole("switch", {
      name: "Automatically sync upstream models",
    })
    expect(sync).toBeChecked()
    await user.click(detection)
    expect(sync).not.toBeChecked()
    expect(sync).toBeDisabled()
    await user.type(
      screen.getByRole("textbox", { name: "Notes" }),
      "Usage note",
    )
    const metadata = screen.getByRole("button", {
      name: "Channel management",
    })
    await user.click(metadata)
    await user.click(metadata)
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Usage note",
    )
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        advanced: {
          remark: "Usage note",
          settings: {
            upstream_model_update_check_enabled: false,
            upstream_model_update_auto_sync_enabled: false,
          },
        },
      }),
    )
  })

  it("supports choosing, typing and clearing the test model", async () => {
    const { user, submit } = await setup({ test_model: "old-model" })
    const input = screen.getByRole("combobox", { name: "Test model" })
    await user.clear(input)
    await user.type(input, "model-b")
    await user.click(await screen.findByRole("option", { name: "model-b" }))
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ advanced: { test_model: "model-b" } }),
    )
    await user.clear(input)
    await user.type(input, "custom-test-model")
    await user.tab()
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        advanced: { test_model: "custom-test-model" },
      }),
    )
    await user.clear(input)
    await user.tab()
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ advanced: { test_model: "" } }),
    )
  })

  it("adds and removes mapping rows and reveals invalid advanced input on save", async () => {
    const { user, submit } = await setup()
    const toggle = screen.getByRole("button", { name: "Models" })
    const group = () => within(screen.getByRole("group", { name: "Models" }))
    await user.click(group().getByRole("button", { name: "Add mapping" }))
    await user.type(
      group().getByRole("combobox", { name: "Request model 1" }),
      "alias",
    )
    await user.click(toggle)
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("alert")).toHaveTextContent("Complete both names")
    await user.type(
      group().getByRole("combobox", { name: "Upstream model 1" }),
      "model-a",
    )
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        advanced: { model_mapping: '{"alias":"model-a"}' },
      }),
    )
    await user.click(group().getByRole("button", { name: "Remove mapping 1" }))
    expect(
      group().queryByRole("combobox", { name: "Request model 1" }),
    ).not.toBeInTheDocument()
  })

  it("preserves malformed settings with disabled controls and clear guidance", async () => {
    const { user, submit } = await setup({
      setting: "broken",
      settings: "[]",
      model_mapping: '{"alias":5}',
    })
    await user.click(
      screen.getByRole("button", { name: "Upstream model detection" }),
    )
    await user.click(screen.getByRole("button", { name: "Network settings" }))
    expect(
      screen.getByRole("switch", { name: "Check upstream model updates" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("switch", {
        name: "Automatically sync upstream models",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("combobox", { name: "Ignored upstream models" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("textbox", { name: "Proxy address" }),
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add mapping" })).toBeDisabled()
    expect(
      screen.getAllByText(enManagedSiteChannels.editor.advanced.invalidExisting)
        .length,
    ).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(submit).toHaveBeenCalledWith(
      expect.not.objectContaining({ advanced: expect.anything() }),
    )
  })

  it("reveals invalid proxy input in its collapsed section", async () => {
    const { user, submit } = await setup()
    const section = screen.getByRole("button", { name: "Network settings" })
    await user.click(section)
    await user.type(
      screen.getByRole("textbox", { name: "Proxy address" }),
      "not-a-url",
    )
    await user.click(section)
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(section).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("alert")).toHaveTextContent(
      enManagedSiteChannels.editor.advanced.proxy.invalid,
    )
    expect(submit).not.toHaveBeenCalled()
  })

  it("explains unsupported detection while allowing ordinary edits", async () => {
    const { user } = await setup({ type: 3 })
    await user.click(
      screen.getByRole("button", {
        name: "Upstream model detection",
      }),
    )
    await user.click(screen.getByRole("button", { name: "Channel management" }))
    expect(
      screen.getByRole("switch", { name: "Check upstream model updates" }),
    ).toBeDisabled()
    expect(screen.getByText(/Upstream detection is unavailable/)).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeEnabled()
  })
})
