import fs from "node:fs/promises"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("exports account keys while preserving per-account failures in the backup file", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  const serviceWorker = await getServiceWorker(context)

  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: "export-ok-account",
      site_name: "Export OK",
      site_url: "https://export-ok.example.com",
      account_info: {
        id: 11,
        access_token: "export-ok-token",
        username: "export-ok-user",
      },
    }),
    createStoredAccount({
      id: "export-bad-account",
      site_name: "Export Bad",
      site_url: "https://export-bad.example.com",
      account_info: {
        id: 22,
        access_token: "export-bad-token",
        username: "export-bad-user",
      },
    }),
  ])

  await stubNewApiSiteRoutes(context, {
    baseUrl: "https://export-ok.example.com",
    userId: 11,
    username: "export-ok-user",
    accessToken: "export-ok-token",
    initialTokens: [
      {
        id: 101,
        user_id: 11,
        key: "sk-export-real",
        status: 1,
        name: "Export Primary Key",
        created_time: 1_700_000_000,
        accessed_time: 1_700_000_000,
        expired_time: -1,
        remain_quota: -1,
        unlimited_quota: true,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        used_quota: 0,
        group: "vip",
      },
    ],
  })

  await context.route("https://export-bad.example.com/api/token/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "upstream timeout",
      }),
    }),
  )

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#importExport`,
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)
  page.removeAllListeners("console")

  await page.evaluate(() => {
    const originalCreateObjectURL = URL.createObjectURL.bind(URL)
    const originalCreateElement = document.createElement.bind(document)

    ;(
      window as typeof window & { __lastExportedBackupText?: string }
    ).__lastExportedBackupText = undefined

    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) {
        void object.text().then((text) => {
          ;(
            window as typeof window & { __lastExportedBackupText?: string }
          ).__lastExportedBackupText = text
        })
      }

      return originalCreateObjectURL(object)
    }

    document.createElement = ((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const element = originalCreateElement(tagName, options)

      if (tagName.toLowerCase() === "a") {
        ;(element as HTMLAnchorElement).click = () => {
          // Swallow the synthetic download click so the page stays on the
          // options screen while we inspect the generated Blob content.
        }
      }

      return element
    }) as typeof document.createElement
  })

  await page
    .getByRole("checkbox", { name: "Include account keys in export" })
    .click()
  await page
    .locator("#export-section")
    .getByRole("button", { name: "Export" })
    .first()
    .evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
  await expect(page.getByText("Data exported successfully")).toBeVisible()

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return (window as typeof window & { __lastExportedBackupText?: string })
          .__lastExportedBackupText
      })
    })
    .toBeTruthy()

  const exportedRaw = await page.evaluate(() => {
    return (window as typeof window & { __lastExportedBackupText?: string })
      .__lastExportedBackupText
  })
  if (!exportedRaw) {
    throw new Error("missing exported backup payload")
  }

  const exportedPath = testInfo.outputPath("import-export-with-keys.json")
  await fs.writeFile(exportedPath, exportedRaw ?? "", "utf8")
  const exported = JSON.parse(exportedRaw) as {
    accountKeySnapshots?: Array<{
      accountId: string
      accountName: string
      baseUrl: string
      siteType: string
      tokens: Array<{
        id: number
        name: string
        key: string
        group?: string
      }>
    }>
    accountKeySnapshotErrors?: Array<{
      accountId: string
      accountName: string
      baseUrl: string
      siteType: string
      errorMessage: string
    }>
  }

  expect(exported.accountKeySnapshots).toMatchObject([
    {
      accountId: "export-ok-account",
      accountName: "Export OK",
      baseUrl: "https://export-ok.example.com",
      siteType: "new-api",
      tokens: [
        {
          id: 101,
          name: "Export Primary Key",
          key: "sk-export-real",
          group: "vip",
        },
      ],
    },
  ])

  expect(exported.accountKeySnapshotErrors).toMatchObject([
    {
      accountId: "export-bad-account",
      accountName: "Export Bad",
      baseUrl: "https://export-bad.example.com",
      siteType: "new-api",
      errorMessage: "请求失败: 500",
    },
  ])
})
