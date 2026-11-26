import path from "node:path"
import { pathToFileURL } from "node:url"

import { SITE_TYPES } from "~/constants/siteType"
import en from "~/locales/en/accountDialog.json" with { type: "json" }
import ja from "~/locales/ja/accountDialog.json" with { type: "json" }
import zh from "~/locales/zh-CN/accountDialog.json" with { type: "json" }
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  autoDetectAccountFromAddDialog,
  openAccountManagementPage,
  waitForSavedAccount,
} from "~~/e2e/utils/realSite/accountAdd"

const { waitForDocVisuals } = await import(
  pathToFileURL(path.resolve("scripts/doc-screenshot-readiness.mjs")).href
)

const locales = {
  zh: { language: "zh-CN", copy: zh },
  en: { language: "en", copy: en },
  ja: { language: "ja", copy: ja },
}
const origin = "https://gateway.example.invalid"
const token = "nap_documentation_example"
const proof = "documentation-proof"
const resources = [
  { resource: "profile", actions: ["read"] },
  { resource: "wallet", actions: ["read"] },
  { resource: "usage", actions: ["read"] },
  { resource: "api_key", actions: ["read", "write", "reveal"] },
]

test.use({ viewport: { width: 1100, height: 740 }, deviceScaleFactor: 1 })
test.skip(!process.env.AAH_DOC_SHOT_DIR, "AAH_DOC_SHOT_DIR not set")

test("captures New API detection and the account form after token creation", async ({
  context,
  page,
  extensionId,
}) => {
  const output = process.env.AAH_DOC_SHOT_DIR
  if (!output) throw new Error("Missing documentation screenshot output path")
  const locale = process.env.AAH_DOC_SHOT_LOCALE ?? "zh"
  if (!Object.hasOwn(locales, locale))
    throw new Error(`Unsupported docs screenshot locale: ${locale}`)
  const { language, copy } = locales[locale as keyof typeof locales]
  const { tokenCreation } = copy

  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" })
  await forceExtensionLanguage(page, language)
  await stubLlmMetadataIndex(context)
  await stubNewApiSiteRoutes(context, {
    baseUrl: origin,
    title: "Example Gateway",
    systemName: "Example Gateway",
    username: "demo-user",
    userId: 42,
    dashboardAuthMode: "auth-bundle",
    accessToken: token,
  })
  await context.route(`${origin}/api/user/access_tokens/catalog`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          default_expiry_days: 30,
          max_tokens: 20,
          groups: [
            {
              group: "personal",
              resources: resources.map(({ resource, actions }) => ({
                resource,
                label_key: resource,
                actions: actions.map((action) => ({
                  action,
                  label_key: action,
                })),
              })),
            },
          ],
        },
      },
    }),
  )
  await context.route(`${origin}/api/user/access_tokens`, (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ json: { success: true, data: { items: [] } } })

    expect(route.request().headers()["x-security-proof"]).toBe(proof)
    const draft = route.request().postDataJSON()
    return route.fulfill({
      json: { success: true, data: { token, item: { id: 7, ...draft } } },
    })
  })
  await context.route(`${origin}/api/verify/methods?**`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          scope: "access_token.generate",
          methods: [{ method: "password", available: true }],
          oauth_providers: [],
          password_encryption_enabled: false,
        },
      },
    }),
  )
  await context.route(`${origin}/api/verify`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          proof_token: proof,
          scope: "access_token.generate",
          method: "password",
          expires_at: Math.floor(Date.now() / 1000) + 300,
        },
      },
    }),
  )
  await context.route(`${origin}/api/subscription/self`, (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  )

  const site = await context.newPage()
  await site.goto(origin)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language,
    autoFillCurrentSiteUrlOnAccountAdd: false,
    autoProvisionKeyOnAccountAdd: false,
    openChangelogOnUpdate: false,
  })
  await openAccountManagementPage({ page, extensionId })
  const { dialog, accessTokenInput, confirmAddButton, userIdInput } =
    await autoDetectAccountFromAddDialog(page, origin)
  const createInExtension = dialog.getByRole("button", {
    name: tokenCreation.title,
    exact: true,
  })
  await expect(createInExtension).toBeVisible({ timeout: 30_000 })
  await expect(accessTokenInput).toBeEmpty()
  await waitForDocVisuals(page)
  await dialog.screenshot({
    path: path.join(output, "new-api-token-creation-entry.png"),
    animations: "disabled",
  })

  await createInExtension.click()
  await dialog
    .getByLabel(tokenCreation.password, { exact: true })
    .fill("demo-password")
  await dialog
    .getByRole("button", { name: tokenCreation.create, exact: true })
    .click()
  const completion = dialog.getByText(tokenCreation.complete, { exact: true })
  await expect(completion).toBeVisible()
  await expect(accessTokenInput).toHaveValue(token)
  await expect(userIdInput).toHaveValue("42")
  await expect(confirmAddButton).toBeEnabled()
  await expect(confirmAddButton).toHaveAccessibleName(copy.actions.saveAccount)
  await dialog.locator('[data-slot="modal-body"]').evaluate((body) => {
    body.scrollTop = 0
  })
  await expect(completion).toBeInViewport()
  await page.mouse.move(0, 0)
  await waitForDocVisuals(page)
  await dialog.screenshot({
    path: path.join(output, "new-api-token-ready-to-save.png"),
    animations: "disabled",
  })

  await confirmAddButton.click()
  const account = await waitForSavedAccount({
    serviceWorker: worker,
    siteType: SITE_TYPES.NEW_API,
    baseUrl: origin,
  })
  expect(account.account_info.access_token).toBe(token)
})
