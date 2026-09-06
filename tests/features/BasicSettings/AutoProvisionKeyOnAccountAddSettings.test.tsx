import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AutoProvisionKeyOnAccountAddSettings from "~/features/BasicSettings/components/tabs/AccountManagement/AutoProvisionKeyOnAccountAddSettings"
import { userPreferences } from "~/services/preferences/userPreferences"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

describe("automatic account key creation settings", () => {
  beforeEach(async () => {
    await userPreferences.savePreferences({
      autoProvisionKeyOnAccountAdd: false,
      autoProvisionKeyOnAccountAddMode:
        ACCOUNT_KEY_AUTO_PROVISION_MODES.Default,
    })
  })

  it("saves the all-groups choice without enabling automatic creation", async () => {
    const user = userEvent.setup()
    render(<AutoProvisionKeyOnAccountAddSettings />)

    const allGroups = await screen.findByRole("button", {
      name: "settings:autoProvisionKeyOnAccountAdd.modes.allGroups",
    })
    await user.click(allGroups)

    await waitFor(() =>
      expect(allGroups).toHaveAttribute("aria-pressed", "true"),
    )
    expect(await userPreferences.getPreferences()).toMatchObject({
      autoProvisionKeyOnAccountAdd: false,
      autoProvisionKeyOnAccountAddMode: "all-groups",
    })

    await user.click(
      screen.getByRole("switch", {
        name: "settings:autoProvisionKeyOnAccountAdd.toggleLabel",
      }),
    )

    await waitFor(async () =>
      expect(await userPreferences.getPreferences()).toMatchObject({
        autoProvisionKeyOnAccountAdd: true,
        autoProvisionKeyOnAccountAddMode: "all-groups",
      }),
    )
  })

  it("retains the saved mode when a mode update cannot be persisted", async () => {
    const user = userEvent.setup()
    const update = vi
      .spyOn(userPreferences, "updateAutoProvisionKeyOnAccountAddMode")
      .mockResolvedValueOnce({
        ok: false,
        reason: { type: "storage-error", error: new Error("write failed") },
      })
    render(<AutoProvisionKeyOnAccountAddSettings />)

    await user.click(
      await screen.findByRole("button", {
        name: "settings:autoProvisionKeyOnAccountAdd.modes.allGroups",
      }),
    )

    expect(await userPreferences.getPreferences()).toMatchObject({
      autoProvisionKeyOnAccountAddMode: "default",
    })
    expect(
      screen.getByRole("button", {
        name: "settings:autoProvisionKeyOnAccountAdd.modes.default",
      }),
    ).toHaveAttribute("aria-pressed", "true")
    update.mockRestore()
  })
})
