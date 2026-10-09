import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { AccountKeyProvisioningDialog } from "~/features/TokenProvisioning/creation/AccountKeyProvisioningDialog"
import common from "~/locales/en/common.json"
import keyManagement from "~/locales/en/keyManagement.json"
import type { AccountKeyProvisioningEntry } from "~/services/accounts/keys/accountKeyProvisioning"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const { prepare } = vi.hoisted(() => ({ prepare: vi.fn() }))
vi.mock("~/services/accounts/keys/accountKeyProvisioning", () => ({
  prepareAccountKeyProvisioning: prepare,
}))
const i18n = await createResourceTestI18n({ en: { common, keyManagement } })

describe("provisioning with the real native editor", () => {
  it("keeps one editor workflow open and collects all quotas before writing", async () => {
    const user = userEvent.setup()
    const entries: AccountKeyProvisioningEntry[] = ["first", "second"].map(
      (key) => ({
        key,
        label: key,
        editor: {
          fields: [
            { fieldId: "name", type: RESOURCE_FIELD_TYPES.Text },
            {
              fieldId: "groups",
              type: RESOURCE_FIELD_TYPES.MultiSelect,
              options: [{ value: key, displayLabel: key }],
            },
            { fieldId: "amount", type: RESOURCE_FIELD_TYPES.Number, min: 0 },
            { fieldId: "boundlessAmount", type: RESOURCE_FIELD_TYPES.Boolean },
            {
              fieldId: "expires_at",
              type: RESOURCE_FIELD_TYPES.DateTime,
              nullable: true,
            },
            { fieldId: "enable", type: RESOURCE_FIELD_TYPES.Boolean },
            { fieldId: "note", type: RESOURCE_FIELD_TYPES.Textarea },
          ],
          initialValues: {
            name: key,
            groups: [key],
            amount: 0,
            boundlessAmount: false,
            expires_at: "",
            enable: true,
            note: "",
          },
          validate: (values) =>
            Number(values.amount) > 0
              ? { valid: true }
              : {
                  valid: false,
                  issues: [{ fieldId: "amount", code: "out_of_range" }],
                },
          submit: vi.fn(),
          resolveDestinationScopeKey: () => "account",
        },
        create: vi.fn().mockResolvedValue({ facts: null, ref: null }),
      }),
    )
    prepare.mockResolvedValue({ coveredCount: 0, entries })
    render(
      <I18nextProvider i18n={i18n}>
        <AccountKeyProvisioningDialog
          account={buildDisplaySiteData({ siteType: "voapi-v2" })}
          mode="all-groups"
          onClose={vi.fn()}
        />
      </I18nextProvider>,
    )
    await user.type(await screen.findByRole("spinbutton"), "5")
    await user.click(
      screen.getByRole("button", {
        name: keyManagement.native.editor.actions.save,
      }),
    )
    expect(entries[0]!.create).not.toHaveBeenCalled()
    await user.type(await screen.findByRole("spinbutton"), "6")
    await user.click(
      screen.getByRole("button", {
        name: keyManagement.native.editor.actions.save,
      }),
    )
    await waitFor(() =>
      expect(entries[1]!.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 6 }),
      ),
    )
    expect(entries[0]!.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5 }),
    )
    expect(await screen.findByRole("status")).toHaveTextContent("Created 2 / 2")
  })
})
