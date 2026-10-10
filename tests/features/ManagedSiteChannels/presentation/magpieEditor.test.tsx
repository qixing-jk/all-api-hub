import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { expect, it, vi } from "vitest"

import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/editor/ManagedResourceEditorBody"
import { getManagedResourceFieldPolicy } from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import enChannelDialog from "~/locales/en/channelDialog.json"
import enCommon from "~/locales/en/common.json"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import enUi from "~/locales/en/ui.json"
import type { ResourceFieldIssue } from "~/services/apiAdapters/contracts/managedResourceNative"
import { magpieEditor } from "~/services/apiAdapters/managedResources/magpie/editorProjection"
import type { MagpieProvider } from "~/services/apiService/magpie/providers"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

// Exercise form interactions without the floating tooltip layout work in jsdom.
vi.mock("react-tooltip", () => ({ Tooltip: () => null }))

it("switches API types with one address visible and retains each draft without copying URLs", async () => {
  const user = userEvent.setup()
  const i18n = await createResourceTestI18n({
    en: {
      channelDialog: enChannelDialog,
      common: enCommon,
      managedSiteChannels: enManagedSiteChannels,
      ui: enUi,
    },
  })
  const editor = magpieEditor()
  function Harness() {
    const [values, setValues] = useState(editor.initialValues)
    return (
      <ManagedResourceEditorBody
        t={i18n.getFixedT("en")}
        mode="create"
        descriptors={editor.fields}
        policy={getManagedResourceFieldPolicy("magpie", "channel", "create")!}
        values={values}
        onValueChange={(id, value) =>
          setValues((previous) => ({ ...previous, [id]: value }))
        }
      />
    )
  }
  const { container } = render(<Harness />)
  expect(
    screen.getByRole("combobox", { name: "Key routing" }),
  ).toHaveTextContent("Smart (automatic failover)")
  const types = screen.getByRole("radiogroup", { name: "API type" })
  expect(within(types).getByRole("radio", { name: "OpenAI" })).toBeChecked()
  expect(screen.queryByLabelText("Anthropic URL")).not.toBeInTheDocument()
  await user.type(
    screen.getByLabelText("Chat Completions URL"),
    "https://relay.test/v1",
  )
  await user.click(within(types).getByRole("radio", { name: "Anthropic" }))
  expect(
    screen.queryByLabelText("Chat Completions URL"),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText("Anthropic URL")).toHaveValue("")
  await user.type(screen.getByLabelText("Anthropic URL"), "https://claude.test")
  await user.click(within(types).getByRole("radio", { name: "Gemini" }))
  expect(screen.getByLabelText("Gemini URL")).toHaveAttribute(
    "placeholder",
    "https://generativelanguage.googleapis.com/v1beta",
  )
  await user.click(within(types).getByRole("radio", { name: "Responses" }))
  expect(screen.getByLabelText("Responses URL")).toHaveAttribute(
    "placeholder",
    "https://api.example.com/v1",
  )
  await user.click(within(types).getByRole("radio", { name: "OpenAI" }))
  expect(screen.getByLabelText("Chat Completions URL")).toHaveValue(
    "https://relay.test/v1",
  )
  await user.click(within(types).getByRole("radio", { name: "Anthropic" }))
  expect(screen.getByLabelText("Anthropic URL")).toHaveValue(
    "https://claude.test",
  )
  await user.click(within(types).getByRole("radio", { name: "OpenAI" }))
  const ids = [...container.querySelectorAll("input[id], textarea[id]")].map(
    (element) => element.id,
  )
  expect(new Set(ids).size).toBe(ids.length)
  const key = screen.getByLabelText(/^Primary API Key/)
  expect(
    key.compareDocumentPosition(screen.getByLabelText("Chat Completions URL")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

async function renderExistingEditor(
  overrides: Partial<MagpieProvider> = {},
  fieldIssues: ResourceFieldIssue[] = [],
) {
  const i18n = await createResourceTestI18n({
    en: {
      channelDialog: enChannelDialog,
      common: enCommon,
      managedSiteChannels: enManagedSiteChannels,
      ui: enUi,
    },
  })
  const editor = magpieEditor({
    id: "relay",
    name: "Relay",
    chat: "https://relay.test/v1",
    responses: "",
    anthropic: "",
    key: { set: true, masked: "sk-***", optional: false },
    off: false,
    chosen: ["model-a"],
    models: [{ id: "model-a" }, { id: "model-b" }],
    ...overrides,
  })
  let current = editor.initialValues
  function Harness() {
    const [values, setValues] = useState(editor.initialValues)
    current = values
    return (
      <ManagedResourceEditorBody
        t={i18n.getFixedT("en")}
        mode="edit"
        fieldIssues={fieldIssues}
        descriptors={editor.fields}
        policy={getManagedResourceFieldPolicy("magpie", "channel", "edit")!}
        values={values}
        onValueChange={(id, value) =>
          setValues((previous) => ({ ...previous, [id]: value }))
        }
      />
    )
  }
  render(<Harness />)
  return () => editor.buildCommand(current)
}

it.each(["chat", "responses", "anthropic", "gemini"] as const)(
  "explains a missing %s address beside the visible control",
  async (protocol) => {
    const user = userEvent.setup()
    await renderExistingEditor({ baseAPI: protocol, [protocol]: "" }, [
      { fieldId: protocol, code: "required" },
    ])
    await user.click(
      screen.getByRole("radio", {
        name: {
          chat: "OpenAI",
          responses: "Responses",
          anthropic: "Anthropic",
          gemini: "Gemini",
        }[protocol],
      }),
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      enManagedSiteChannels.editor.fields.magpieChat.required,
    )
  },
)

it("identifies a native-managed protocol and gives actionable pool validation feedback", async () => {
  await renderExistingEditor(
    { baseAPI: "decide", decide: "https://native.test" },
    [
      { fieldId: "keyPool", code: "invalid_value" },
      { fieldId: "baseAPI", code: "inconsistent_value" },
    ],
  )
  expect(screen.getByText("Managed in Magpie")).toBeVisible()
  expect(
    screen.getByText(enManagedSiteChannels.magpieKeys.invalid),
  ).toBeVisible()
  expect(
    screen.getByText(enManagedSiteChannels.magpieProtocols.checkOther),
  ).toBeVisible()
})

it("edits saved key status, protocol and weight while retaining neighboring keys", async () => {
  const user = userEvent.setup()
  const command = await renderExistingEditor({
    keyList: [
      {
        id: "main",
        active: true,
        on: true,
        masked: "sk-***main",
        name: "Main",
      },
      {
        id: "backup",
        active: false,
        on: false,
        masked: "sk-***back",
        name: "Backup",
        protocol: "future",
      },
    ],
  })
  const backup = within(screen.getByRole("group", { name: "API Key 2" }))
  expect(backup.getByText(/Disabled/)).toBeVisible()
  await user.click(backup.getByRole("switch", { name: "Enabled" }))
  await user.click(backup.getByRole("button", { name: "Expand API Key 2" }))
  await user.click(backup.getByRole("combobox", { name: "Protocol" }))
  expect(screen.getByRole("option", { name: "future" })).toBeVisible()
  expect(screen.getByRole("option", { name: "Responses" })).toBeVisible()
  expect(screen.getByRole("option", { name: "Chat Completions" })).toBeVisible()
  expect(screen.getByRole("option", { name: "Any protocol" })).toBeVisible()
  await user.click(screen.getByRole("option", { name: "Anthropic" }))
  await user.clear(backup.getByRole("spinbutton", { name: "Weight" }))
  await user.type(backup.getByRole("spinbutton", { name: "Weight" }), "5")
  expect(command().keyPool).toEqual({
    add: [],
    remove: [],
    update: [{ ref: "backup", on: true, protocol: "anthropic", weight: 5 }],
  })
})

it("adds a new key row and offers all routing policies", async () => {
  const user = userEvent.setup()
  const command = await renderExistingEditor()
  await user.click(screen.getByRole("button", { name: "Add key" }))
  const row = within(screen.getByRole("group", { name: "API Key 1" }))
  await user.click(row.getByLabelText("API Key 1"))
  await user.paste("sk-new")
  await user.click(screen.getByRole("combobox", { name: "Key routing" }))
  for (const name of [
    "In order (failover)",
    "Round robin",
    "Least used first",
    "Remaining allowance per hour",
  ])
    expect(screen.getByRole("option", { name })).toBeVisible()
  await user.click(screen.getByRole("option", { name: "Weighted" }))
  expect(command()).toMatchObject({
    fields: { routing: "weight" },
    keyPool: { add: [{ key: "sk-new", on: true }] },
  })
})

it("selects discovered models, adds custom models, and edits headers as rows", async () => {
  const user = userEvent.setup()
  const command = await renderExistingEditor()
  const models = screen.getByRole("combobox", { name: "Available Models" })
  await user.click(models)
  await user.click(await screen.findByRole("option", { name: "model-b" }))
  await user.type(models, "custom-model{Enter}")
  expect(command().fields.models).toEqual([
    "model-a",
    "model-b",
    "custom-model",
  ])
  await user.keyboard("{Escape}")
  await user.click(screen.getByRole("button", { name: "Advanced" }))
  const headers = within(screen.getByRole("group", { name: "Custom headers" }))
  await user.click(headers.getByRole("button", { name: "Add row" }))
  await user.type(
    headers.getByRole("textbox", { name: "Custom headers: row 1 key" }),
    "X-Tenant",
  )
  await user.type(
    headers.getByRole("textbox", { name: "Custom headers: row 1 value" }),
    "team",
  )
  expect(command().fields.headers).toEqual({
    "X-Tenant": "team",
  })
})

it("edits advanced settings and restores unset numeric limits", async () => {
  const user = userEvent.setup()
  const command = await renderExistingEditor()
  await user.click(screen.getByRole("button", { name: "Advanced" }))
  for (const [label, value] of [
    ["Models URL", "https://relay.test/custom/models"],
    ["Model catalog", "openai, anthropic"],
    ["Balance URL", "https://relay.test/balance"],
    ["Balance expression", "data.balance / 500000"],
  ] as const) {
    await user.click(screen.getByLabelText(label, { exact: true }))
    await user.paste(value)
  }
  await user.type(
    screen.getByRole("spinbutton", { name: "Concurrent requests per key" }),
    "3",
  )
  await user.type(
    screen.getByRole("spinbutton", { name: "Requests per minute per key" }),
    "60",
  )
  await user.type(
    screen.getByRole("spinbutton", { name: "Price multiplier" }),
    "0.8",
  )
  expect(command().fields).toMatchObject({
    modelsURL: "https://relay.test/custom/models",
    catalog: "openai, anthropic",
    balanceURL: "https://relay.test/balance",
    balancePath: "data.balance / 500000",
    maxConcurrency: 3,
    maxRPM: 60,
    priceRate: 0.8,
  })
  await user.clear(
    screen.getByRole("spinbutton", { name: "Concurrent requests per key" }),
  )
  await user.clear(
    screen.getByRole("spinbutton", { name: "Requests per minute per key" }),
  )
  await user.clear(screen.getByRole("spinbutton", { name: "Price multiplier" }))
  expect(command().fields).not.toHaveProperty("maxConcurrency")
  expect(command().fields).not.toHaveProperty("maxRPM")
  expect(command().fields).not.toHaveProperty("priceRate")
})
