import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { API_CREDENTIAL_PROFILES_TEST_IDS as IDS } from "~/features/ApiCredentialProfiles/testIds"
import en from "~/locales/en/aiApiVerification.json" with { type: "json" }
import ui from "~/locales/en/ui.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredApiCredentialProfile,
  forceExtensionLanguage,
  seedApiCredentialProfiles,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("verification composer keeps its caret on resize and displays model empty guidance", async ({
  context,
  extensionId,
  extensionDir,
  page,
}) => {
  await stubLlmMetadataIndex(context)
  await forceExtensionLanguage(page, "en")
  await seedApiCredentialProfiles(await getServiceWorker(context), [
    createStoredApiCredentialProfile({
      baseUrl: "https://api.example.invalid",
      apiKey: "synthetic-key",
    }),
  ])
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(IDS.verifyButton).first().click()
  const workspace = page.getByTestId("verification-workspace")
  await workspace
    .getByRole("button", {
      name: en.verifyDialog.tools.questionAnswer.title,
      exact: true,
    })
    .click()
  const settingsToggle = workspace.locator(
    ".verification-workspace-controls button",
  )
  await settingsToggle.click()
  await workspace.locator(".verification-workspace-list-header button").click()
  const question = page.getByRole("textbox", {
    name: en.verifyDialog.tools.questionAnswer.question,
    exact: true,
  })
  await question.fill("Keep this selected question on resize")
  await question.evaluate((element: HTMLTextAreaElement) => {
    element.focus()
    element.setSelectionRange(5, 18, "backward")
  })
  await page.setViewportSize({ width: 660, height: 1000 })
  await expect(question).toBeFocused()
  expect(
    await question.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
      element.selectionDirection,
    ]),
  ).toEqual([5, 18, "backward"])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(question).toBeFocused()
  await page
    .locator(
      "[data-verification-detail]:not([hidden]) [data-slot=model-selector-trigger]",
    )
    .click()
  const popup = page.locator('[data-slot="popover-content"]')
  await expect(
    popup.getByText(ui.searchableSelect.noOptionsAllowCustom, { exact: true }),
  ).toBeVisible()
  await popup.screenshot({
    path: test.info().outputPath("model-selector-empty.png"),
    animations: "disabled",
  })
  await captureVisualViews({
    page,
    ready: popup,
    id: "model-selector-empty",
    extensionDir,
  })
})
