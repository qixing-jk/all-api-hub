import "./accountActionButtonsMocks"

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import type { DisplaySiteData } from "~/types"
import { render } from "~~/tests/test-utils/render"

import {
  buildDisplaySiteData,
  setupAccountActionButtonsTest,
} from "./accountActionButtonsTestSupport"

vi.mock(
  "~/features/TokenProvisioning/creation/AccountKeyProvisioningDialog",
  () => ({
    AccountKeyProvisioningDialog: ({
      account,
      mode,
      onClose,
    }: {
      account: DisplaySiteData
      mode: string
      onClose: () => void
    }) => (
      <div role="dialog" aria-label="Provision keys">
        <p>
          {account.id}:{mode}
        </p>
        <button onClick={onClose}>Finish provisioning</button>
      </div>
    ),
  }),
)

describe("account key completion shortcuts", () => {
  setupAccountActionButtonsTest()

  it.each(["default", "all-groups"] as const)(
    "keeps the %s completion task on its original account after the menu closes",
    async (mode) => {
      const user = userEvent.setup({ skipHover: true })
      const props = { onCopyKey: vi.fn(), onDeleteAccount: vi.fn() }
      const { rerender } = render(
        <AccountActionButtons
          {...props}
          site={buildDisplaySiteData({ id: "original", siteType: "new-api" })}
        />,
      )
      await user.click(
        screen.getByRole("button", { name: "common:actions.more" }),
      )
      await user.click(
        screen.getByRole("menuitem", {
          name: "keyManagement:provisioning.actions.title",
        }),
      )
      await user.click(
        screen.getByRole("menuitem", {
          name: `keyManagement:provisioning.actions.${mode === "default" ? "default" : "allGroups"}`,
        }),
      )
      expect(
        await screen.findByRole("dialog", { name: "Provision keys" }),
      ).toHaveTextContent(`original:${mode}`)
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      rerender(
        <AccountActionButtons
          {...props}
          site={buildDisplaySiteData({
            id: "replacement",
            siteType: "new-api",
          })}
        />,
      )
      expect(
        screen.getByRole("dialog", { name: "Provision keys" }),
      ).toHaveTextContent(`original:${mode}`)
      await user.click(
        screen.getByRole("button", { name: "Finish provisioning" }),
      )
      expect(
        screen.queryByRole("dialog", { name: "Provision keys" }),
      ).not.toBeInTheDocument()
    },
  )

  it.each([
    { disabled: true, siteType: "new-api" },
    { disabled: false, siteType: "sharedchat" },
  ] as const)(
    "does not offer key completion for an unavailable account: %o",
    async (overrides) => {
      const user = userEvent.setup({ skipHover: true })
      render(
        <AccountActionButtons
          site={buildDisplaySiteData(overrides)}
          onCopyKey={vi.fn()}
          onDeleteAccount={vi.fn()}
        />,
      )
      await user.click(
        screen.getByRole("button", { name: "common:actions.more" }),
      )
      expect(
        screen.queryByRole("menuitem", {
          name: "keyManagement:provisioning.actions.title",
        }),
      ).not.toBeInTheDocument()
    },
  )
})
