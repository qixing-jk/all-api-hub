import type { Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { expect } from "~~/e2e/fixtures/extensionTest"
import { runManagedMultiKeyEditorScenario } from "~~/e2e/scenarios/managedMultiKeyEditor"
import { cleanupManagedSiteChannelsByPrefix } from "~~/e2e/scenarios/managedSiteChannels"
import { runScenarioWithCleanup } from "~~/e2e/utils/scenarioErrors"

/** Create only run-owned channels, exercise the editor, and verify cleanup even on failure. */
export async function runRealSiteMultiKeyEditorScenario(params: {
  page: Page
  extensionId: string
  siteType: typeof SITE_TYPES.AXON_HUB | typeof SITE_TYPES.OCTOPUS
  baseUrl: string
}) {
  const { page } = params
  page.setDefaultTimeout(15_000)
  const name = `AAH E2E MultiKey ${crypto.randomUUID()}`
  const keys = [1, 2, 3].map(
    (index) => `sk-aah-nonfunctional-${crypto.randomUUID()}-${index}`,
  )
  const url = new URL(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}`,
  )
  url.hash = MENU_ITEM_IDS.MANAGED_SITE_CHANNELS
  let supported = true
  await runScenarioWithCleanup({
    run: async () => {
      await page.goto(url.toString())
      await page
        .getByRole("button", { name: "Add channel", exact: true })
        .click()
      const dialog = page.getByRole("dialog")
      await expect(
        dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput),
      ).toBeVisible()
      if (
        params.siteType === SITE_TYPES.OCTOPUS &&
        (await dialog
          .getByRole("button", { name: "Add key", exact: true })
          .count()) === 0
      ) {
        supported = false
        await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.cancelButton).click()
        return
      }
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput).fill(name)
      await dialog
        .getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput)
        .fill("https://aah-e2e.example.invalid")
      for (let index = 0; index < keys.length; index++) {
        if (index)
          await dialog
            .getByRole("button", { name: "Add key", exact: true })
            .click()
        const row = dialog.getByRole("group", {
          name: `API Key ${index + 1}`,
          exact: true,
        })
        await row.locator("input[type=password]").fill(keys[index])
        const keyName = row.getByRole("textbox", {
          name: "Channel Name",
          exact: true,
        })
        if (await keyName.count()) await keyName.fill(`key-${index + 1}`)
      }
      const models = dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput)
      await models.fill(`aah-e2e-${crypto.randomUUID()}`)
      await models.press("Enter")
      await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
      await expect(dialog).toBeHidden({ timeout: 30_000 })
      await runManagedMultiKeyEditorScenario({ ...params, name, keys })
    },
    finalizers: [
      () => cleanupManagedSiteChannelsByPrefix({ ...params, prefix: name }),
    ],
    cleanupMessage: "Multi-key test channel cleanup failed",
    failureMessage: "Real-site multi-key persistence failed",
  })
  return supported
}
