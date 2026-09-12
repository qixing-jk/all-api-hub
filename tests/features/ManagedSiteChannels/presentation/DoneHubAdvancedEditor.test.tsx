import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import {
  DoneHubChannelType,
  DONE_HUB_MANAGED_RESOURCE_FIELD_IDS as fields,
} from "~/constants/doneHub"
import { SITE_TYPES } from "~/constants/siteType"
import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/presentation/ManagedResourceEditorBody"
import { getManagedResourceFieldPolicy } from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import enChannelDialog from "~/locales/en/channelDialog.json"
import enCommon from "~/locales/en/common.json"
import enManaged from "~/locales/en/managedSiteChannels.json"
import enUi from "~/locales/en/ui.json"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/managedResourceNative"
import { withDoneHubAdvancedEditor } from "~/services/apiAdapters/managedResources/doneHubEditor"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"

const i18n = await createResourceTestI18n({
  en: {
    channelDialog: enChannelDialog,
    common: enCommon,
    managedSiteChannels: enManaged,
    ui: enUi,
  },
})
const policy = getManagedResourceFieldPolicy(
  SITE_TYPES.DONE_HUB,
  MANAGED_RESOURCE_KINDS.Channel,
  "edit",
)!
const editor = withDoneHubAdvancedEditor({
  fields: [
    { fieldId: fields.Name, type: "text" },
    { fieldId: fields.BaseUrl, type: "text" },
    {
      fieldId: fields.Key,
      type: "secret",
      canReplace: true,
      canLoadSecret: false,
      allowClear: false,
      secretState: "unavailable",
    },
    {
      fieldId: fields.Groups,
      type: "multi-select",
      options: [{ value: "default" }],
    },
    {
      fieldId: fields.Type,
      type: "select",
      options: [DoneHubChannelType.Custom, DoneHubChannelType.Midjourney].map(
        (value) => ({ value: String(value) }),
      ),
    },
    { fieldId: fields.Status, type: "select", options: [{ value: "1" }] },
    {
      fieldId: fields.Models,
      type: "multi-select",
      options: [{ value: "model-a" }],
    },
    { fieldId: fields.Priority, type: "number" },
    { fieldId: fields.Weight, type: "number" },
  ],
  initialValues: {
    [fields.Type]: String(DoneHubChannelType.Custom),
    [fields.Status]: "1",
    [fields.Models]: ["model-a"],
    [fields.Priority]: 0,
    [fields.Weight]: 1,
  },
  validate: () => ({ valid: true }),
  buildCommand: () => ({
    name: "Test",
    type: DoneHubChannelType.Custom,
    key: "",
    base_url: "",
    models: [],
    groups: [],
    priority: 0,
    weight: 1,
    status: 1,
  }),
})

/** Exercises provider validation and the actual shared editor with controlled drafts. */
function Editor({
  initial = {},
  disabled = false,
}: {
  initial?: EditableResourceProjection
  disabled?: boolean
}) {
  const [values, setValues] = useState({ ...editor.initialValues, ...initial })
  const validation = editor.validate(values)
  return (
    <ManagedResourceEditorBody
      t={i18n.t}
      mode="edit"
      descriptors={editor.fields}
      policy={policy}
      values={values}
      disabled={disabled}
      fieldIssues={validation.valid ? [] : validation.issues}
      onValueChange={(fieldId, value) =>
        setValues((current) => ({ ...current, [fieldId]: value }))
      }
    />
  )
}
const renderEditor = (
  initial?: EditableResourceProjection,
  disabled?: boolean,
) =>
  render(<Editor initial={initial} disabled={disabled} />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

describe("DoneHub advanced editor interactions", () => {
  it("repairs mappings, adds their names once, and offers those names as test models", async () => {
    const user = userEvent.setup()
    renderEditor({ [fields.ModelMapping]: '{"alias":"upstream"}' })
    const mapping = screen.getByRole("group", {
      name: "Model mapping",
    })
    const addModels = within(mapping).getByRole("button", {
      name: "Add mapped names to model list",
    })
    await user.click(addModels)
    expect(addModels).toBeDisabled()
    await user.click(within(mapping).getByRole("button", { name: "Edit JSON" }))
    const raw = within(mapping).getByRole("textbox", {
      name: "Model mapping",
    })
    await user.clear(raw)
    await user.type(raw, "broken")
    expect(within(mapping).getByRole("alert")).toHaveTextContent(
      enManaged.editor.doneHub.modelMapping.invalid,
    )
    expect(addModels).toBeDisabled()
    await user.clear(raw)
    await user.paste('{"alias":"upstream","second":"model-b"}')
    await user.click(within(mapping).getByRole("button", { name: "Edit rows" }))
    await user.click(addModels)
    expect(addModels).toBeDisabled()
    const testModel = screen.getByRole("combobox", {
      name: "Test model",
    })
    await user.click(testModel)
    await user.keyboard("{ArrowDown}")
    await user.click(await screen.findByRole("option", { name: "second" }))
    expect(testModel).toHaveValue("second")
    const models = screen.getByRole("button", { name: "Models" })
    await user.click(models)
    await user.click(models)
    await user.click(within(mapping).getByRole("button", { name: "Edit JSON" }))
    expect(
      within(mapping).getByRole("textbox", {
        name: "Model mapping",
      }),
    ).toHaveValue('{"alias":"upstream","second":"model-b"}')
  })

  it("retains custom model drafts after collapsing and validates long test model names", async () => {
    const user = userEvent.setup()
    renderEditor()
    const testModel = screen.getByRole("combobox", { name: "Test model" })
    await user.clear(testModel)
    await user.type(testModel, "manual-model")
    await user.tab()
    expect(testModel).toHaveValue("manual-model")
    const streaming = screen.getByRole("combobox", {
      name: "Models excluded from streaming",
    })
    await user.type(streaming, "custom-stream-model")
    await user.keyboard("{Enter}")
    expect(
      screen.getByText("custom-stream-model", { exact: true }),
    ).toBeVisible()
    const models = screen.getByRole("button", { name: "Models" })
    await user.click(models)
    expect(testModel).not.toBeVisible()
    await user.click(models)
    expect(testModel).toHaveValue("manual-model")
    await user.clear(testModel)
    await user.paste("x".repeat(51))
    await user.tab()
    expect(screen.getByRole("alert")).toHaveTextContent(
      enManaged.editor.doneHub.testModel.invalid,
    )
    expect(models).toHaveAttribute("aria-expanded", "true")
  })

  it("validates requests, keeps errors expanded, and retains request drafts after closing sections", async () => {
    const user = userEvent.setup()
    renderEditor()
    const requests = screen.getByRole("button", {
      name: "Network & requests",
    })
    expect(requests).toHaveAttribute("aria-expanded", "false")
    await user.click(requests)
    const proxy = screen.getByRole("textbox", {
      name: "Proxy URL",
    })
    await user.type(proxy, "bad proxy")
    expect(screen.getByRole("alert")).toHaveTextContent(
      enManaged.editor.doneHub.proxy.invalid,
    )
    await user.clear(proxy)
    await user.type(proxy, "socks5://proxy.example:1080")
    const headers = screen.getByRole("group", {
      name: "Custom request headers",
    })
    await user.click(within(headers).getByRole("button", { name: "Edit JSON" }))
    const rawHeaders = within(headers).getByRole("textbox", {
      name: "Custom request headers",
    })
    await user.type(rawHeaders, "invalid")
    expect(within(headers).getByRole("alert")).toHaveTextContent(
      enManaged.editor.doneHub.modelHeaders.invalid,
    )
    await user.clear(rawHeaders)
    await user.paste('{"X-Project":"test"}')
    const parameters = screen.getByRole("textbox", {
      name: "Extra request parameters",
    })
    await user.type(parameters, "invalid")
    expect(screen.getByRole("alert")).toHaveTextContent(
      enManaged.editor.doneHub.customParameter.invalid,
    )
    await user.click(requests)
    expect(parameters).toBeVisible()
    await user.clear(parameters)
    await user.paste('{"temperature":0.5}')
    await user.click(screen.getAllByRole("button", { name: "Format JSON" })[1])
    expect(parameters).toHaveValue('{\n  "temperature": 0.5\n}')
    await user.click(
      screen.getByRole("switch", { name: "Forward extra body fields" }),
    )
    await user.click(requests)
    await user.click(requests)
    expect(rawHeaders).toHaveValue('{"X-Project":"test"}')
    expect(
      screen.getByRole("switch", { name: "Forward extra body fields" }),
    ).toBeChecked()
    await user.click(screen.getByRole("button", { name: "API compatibility" }))
    await user.click(
      screen.getByRole("switch", { name: "Responses API compatibility" }),
    )
    await user.type(
      screen.getByRole("textbox", { name: "Responses request path" }),
      "/custom/responses",
    )
    expect(
      screen.getByRole("switch", { name: "Responses API compatibility" }),
    ).toBeChecked()
    await user.click(screen.getByRole("button", { name: "Routing" }))
    expect(screen.getByRole("spinbutton", { name: "Priority" })).toBeVisible()
  })
})
