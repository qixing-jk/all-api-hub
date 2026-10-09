import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { expect, it } from "vitest"

import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/editor/ManagedResourceEditorBody"
import { getManagedResourceFieldPolicy } from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import enChannelDialog from "~/locales/en/channelDialog.json"
import enCommon from "~/locales/en/common.json"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import enUi from "~/locales/en/ui.json"
import { magpieEditor } from "~/services/apiAdapters/managedResources/magpie/editorProjection"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

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

it("selects discovered models, adds custom models, and edits headers as rows", async () => {
  const user = userEvent.setup()
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
  })
  let current = editor.initialValues
  function Harness() {
    const [values, setValues] = useState(editor.initialValues)
    current = values
    return (
      <ManagedResourceEditorBody
        t={i18n.getFixedT("en")}
        mode="edit"
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
  const models = screen.getByRole("combobox", { name: "Available Models" })
  await user.click(models)
  await user.click(await screen.findByRole("option", { name: "model-b" }))
  await user.type(models, "custom-model{Enter}")
  expect(editor.buildCommand(current).fields.models).toEqual([
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
  expect(editor.buildCommand(current).fields.headers).toEqual({
    "X-Tenant": "team",
  })
  await user.type(
    screen.getByLabelText("Models URL", { exact: true }),
    "https://relay.test/custom/models",
  )
  await user.type(
    screen.getByLabelText("Model catalog", { exact: true }),
    "openai, anthropic",
  )
  await user.type(
    screen.getByLabelText("Balance URL", { exact: true }),
    "https://relay.test/balance",
  )
  await user.type(
    screen.getByLabelText("Balance expression", { exact: true }),
    "data.balance / 500000",
  )
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
  expect(editor.buildCommand(current).fields).toMatchObject({
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
  expect(editor.buildCommand(current).fields).not.toHaveProperty(
    "maxConcurrency",
  )
  expect(editor.buildCommand(current).fields).not.toHaveProperty("maxRPM")
  expect(editor.buildCommand(current).fields).not.toHaveProperty("priceRate")
})
