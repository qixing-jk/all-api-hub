import { SITE_TYPES } from "~/constants/siteType"
import { MODEL_LIST_TEST_IDS as ids } from "~/features/ModelList/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { verifyAccountModelCatalogUsage } from "~~/e2e/scenarios/accountUsage"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("Novita exposes account-bound model actions and masked key recovery", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "novita-model-actions",
      site_type: SITE_TYPES.NOVITA,
      site_name: "Novita model actions",
      site_url: "https://novita.ai",
      account_info: {
        id: "novita-fixture-user",
        username: "fixture-user",
        access_token: "novita-console:fixture-management",
      },
    }),
  ])
  const requests: { method: string; path: string }[] = []
  await context.route(
    "https://api.novita.ai/openai/v1/models",
    async (route) => {
      expect(route.request().headers().authorization).toBeUndefined()
      await route.fulfill({
        json: {
          data: [
            {
              id: "example/novita-model",
              created: 1,
              display_name: "Novita fixture model",
              endpoints: ["chat/completions"],
              pricing: {
                prompt: { price_per_m_decimal: "0.2" },
                completion: { price_per_m_decimal: "0.6" },
              },
            },
          ],
        },
      })
    },
  )
  await context.route("https://api-server.novita.ai/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    requests.push({ method: request.method(), path })
    expect(request.method()).toBe("GET")
    if (path === "/v2/user/key") {
      await route.fulfill({
        json: {
          keys: [
            {
              name: "Novita inference key",
              stringId: "key-fixture",
              maskedKey: "sk_fixture****last",
              expireTime: "",
              modelAccessPolicy: {
                mode: "all_enabled",
                excludedModelCount: 0,
                allowedModelCount: 0,
              },
            },
          ],
        },
      })
    } else
      await route.fulfill({
        status: 404,
        json: { error: "Unexpected fixture endpoint" },
      })
  })

  await verifyAccountModelCatalogUsage({
    page,
    extensionId,
    account: { accountId: "novita-model-actions" },
    expectations: { sourceLabel: "Novita model actions", totalModels: 1 },
  })
  await page.screenshot({
    path: testInfo.outputPath("model-actions.png"),
    animations: "disabled",
  })
  for (const id of [
    ids.modelKeyDialogButton,
    ids.verifyApiButton,
    ids.verifyCliSupportButton,
    ids.batchVerifyButton,
  ]) {
    await expect(page.getByTestId(id)).toBeVisible()
  }
  await page.getByTestId(ids.modelKeyDialogButton).click()
  await expect(page.getByTestId(ids.modelKeyDialog)).toBeVisible()
  await expect(
    page.getByLabel("Compatible key", { exact: true }),
  ).toContainText("Novita inference key")
  await page.getByTestId(ids.modelKeyDialog).screenshot({
    path: testInfo.outputPath("model-key.png"),
    animations: "disabled",
  })
  await page.keyboard.press("Escape")
  await expect(page.getByTestId(ids.modelKeyDialog)).toBeHidden()

  await page.getByTestId(ids.verifyApiButton).click()
  await expect(page.getByRole("dialog")).toContainText("API Credential Library")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  await page.getByTestId(ids.verifyCliSupportButton).click()
  await expect(page.getByRole("dialog")).toContainText("CLI Support Simulation")
  await expect(page.getByRole("dialog")).toContainText("Novita inference key")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  await page.getByTestId(ids.batchVerifyButton).click()
  await expect(page.getByRole("dialog")).toContainText("example/novita-model")
  expect(requests.some((request) => request.path === "/v2/user/key")).toBe(true)
})
