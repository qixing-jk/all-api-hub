import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_KEY_RESOURCE_EDITOR_MODES as modes } from "~/features/KeyManagement/constants"
import { AccountKeyResourceEditorDialog } from "~/features/KeyManagement/resources/AccountKeyResourceEditorDialog"
import en from "~/locales/en/keyManagement.json"
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import { DAHL_KEY_RESOURCE_FIELDS as fields } from "~/services/apiAdapters/dahl/keyResourceFields"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

it.each([editActions.Allocate, editActions.Return] as const)(
  "opens an independent %s operation with exact amount shortcuts",
  async (operation) => {
    const i18n = await createResourceTestI18n({ en: { keyManagement: en } })
    const submit = vi.fn()
    const values = {
      [fields.TransferDirection]: operation,
      [fields.TransferAmount]: "",
      [fields.PoolTokens]: 100000001,
      [fields.KeyTokens]: 2000000,
      [fields.KeyMask]: "dahl_abc…xyz",
    }
    render(
      <I18nextProvider i18n={i18n}>
        <AccountKeyResourceEditorDialog
          editor={{
            editorId: 1,
            siteType: SITE_TYPES.DAHL,
            mode: modes.Edit,
            values,
            initialValues: values,
            fields: [
              {
                fieldId: fields.TransferDirection,
                type: "text",
                readOnly: true,
              },
              { fieldId: fields.TransferAmount, type: "text", required: true },
              { fieldId: fields.PoolTokens, type: "number", readOnly: true },
              { fieldId: fields.KeyTokens, type: "number", readOnly: true },
              { fieldId: fields.KeyMask, type: "text", readOnly: true },
            ],
          }}
          onSubmit={submit}
          onClose={vi.fn()}
          onValuesChange={vi.fn()}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const user = userEvent.setup()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("textbox", { name: "Key name" }),
    ).not.toBeInTheDocument()
    const amount = screen.getByRole("textbox", { name: "Tokens to transfer" })
    const label =
      operation === editActions.Allocate ? "Allocate tokens" : "Return tokens"
    expect(screen.getByRole("button", { name: label })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "25%" }))
    expect(amount).toHaveValue(
      operation === editActions.Allocate ? "25000000" : "500000",
    )
    await user.click(screen.getByRole("button", { name: "Max" }))
    expect(amount).toHaveValue(
      operation === editActions.Allocate ? "100000001" : "2000000",
    )
    await user.click(screen.getByRole("button", { name: label }))
    expect(submit.mock.calls[0]![1]).toMatchObject({
      [fields.TransferDirection]: operation,
      [fields.TransferAmount]:
        operation === editActions.Allocate ? "100000001" : "2000000",
    })
    await user.clear(amount)
    await user.type(amount, "9999999999")
    expect(screen.getByRole("button", { name: label })).toBeDisabled()
    expect(screen.getByRole("alert")).toBeVisible()
    await user.clear(amount)
    await user.type(amount, "1K")
    expect(screen.getByRole("button", { name: label })).toBeEnabled()
  },
)

it("creates with an optional local name and exposes a rename-only operation with sync guidance", async () => {
  const i18n = await createResourceTestI18n({ en: { keyManagement: en } })
  const submit = vi.fn()
  const values = {
    [fields.TransferDirection]: editActions.Rename,
    [fields.TransferAmount]: "",
    [fields.Name]: "Work key",
    [fields.NameSync]: "pending",
    [fields.PoolTokens]: 0,
    [fields.KeyTokens]: 0,
    [fields.KeyMask]: "dahl_abc…xyz",
  }
  render(
    <I18nextProvider i18n={i18n}>
      <AccountKeyResourceEditorDialog
        editor={{
          editorId: 1,
          siteType: SITE_TYPES.DAHL,
          mode: modes.Edit,
          values,
          initialValues: values,
          fields: [
            {
              fieldId: fields.TransferDirection,
              type: "select",
              options: [
                { value: editActions.Allocate },
                { value: editActions.Return },
                { value: editActions.Rename },
              ],
              required: true,
            },
            { fieldId: fields.TransferAmount, type: "text", required: true },
            { fieldId: fields.Name, type: "text" },
            ...[fields.PoolTokens, fields.KeyTokens].map((fieldId) => ({
              fieldId,
              type: "number" as const,
              readOnly: true,
            })),
            ...[fields.KeyMask, fields.NameSync].map((fieldId) => ({
              fieldId,
              type: "text" as const,
              readOnly: true,
            })),
          ],
        }}
        onSubmit={submit}
        onClose={vi.fn()}
        onValuesChange={vi.fn()}
      />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const user = userEvent.setup()
  const name = await screen.findByRole("textbox", { name: "Key name" })
  expect(
    screen.queryByRole("textbox", { name: "Tokens to transfer" }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  expect(screen.getByText(/waiting to sync/i)).toBeInTheDocument()
  await user.clear(name)
  await user.type(name, "Personal key")
  expect(screen.getByRole("button", { name: "Save name" })).toBeEnabled()
  await user.keyboard("{Enter}")
  expect(submit.mock.calls[0]![1]).toMatchObject({
    [fields.TransferDirection]: editActions.Rename,
    [fields.Name]: "Personal key",
    [fields.TransferAmount]: "",
  })
})

it("creates a zero-token key with an optional name and no funding controls", async () => {
  const i18n = await createResourceTestI18n({ en: { keyManagement: en } })
  const submit = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <AccountKeyResourceEditorDialog
        editor={{
          editorId: 1,
          siteType: SITE_TYPES.DAHL,
          mode: modes.Create,
          values: { [fields.Name]: "" },
          initialValues: { [fields.Name]: "" },
          fields: [{ fieldId: fields.Name, type: "text" }],
        }}
        onSubmit={submit}
        onClose={vi.fn()}
        onValuesChange={vi.fn()}
      />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  const user = userEvent.setup()
  expect(
    screen.queryByRole("textbox", { name: "Tokens to transfer" }),
  ).not.toBeInTheDocument()
  await user.type(screen.getByRole("textbox", { name: "Key name" }), "Work")
  await user.click(screen.getByRole("button", { name: "Create key" }))
  expect(submit).toHaveBeenCalledWith(1, { [fields.Name]: "Work" })
})
