import { randomUUID } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { request, type Page } from "@playwright/test"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { registerBalanceDefaultDisplayTests } from "~~/e2e/scenarios/balanceDefaultDisplay"
import { saveAutoDetectedAccountFromApp } from "~~/e2e/utils/accountLifecycle"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  autoDetectAccountFromAddDialog,
  openAccountManagementPage,
  waitForSavedAccount,
} from "~~/e2e/utils/realSite/accountAdd"
import { registerRealSiteAccountDetectionTests } from "~~/e2e/utils/realSite/accountDetection"
import {
  realSiteAccountUsageChecks,
  runRealSiteAccountFixtureUsageChecks,
} from "~~/e2e/utils/realSite/accountUsage"
import { createCompatibleRealSiteAccountFixturePreparer } from "~~/e2e/utils/realSite/compatibleAccountSaveFlow"
import {
  getNewApiRealSiteSkipReason,
  loginToRealNewApiSite,
  resolveNewApiRealSiteConfig,
} from "~~/e2e/utils/realSite/newApi"
import {
  createNewApiAccountRecovery,
  waitForNewUserFacingCredentialPage,
} from "~~/e2e/utils/realSite/newApiAccountRecovery"
import {
  createReusedRealSiteAccountFixturePreparer,
  createSharedRealSiteAccountFixtureCache,
  resolveSharedRealSiteAccountFixture,
} from "~~/e2e/utils/realSite/sharedAccountFixture"
import {
  collectCleanupError,
  throwScenarioError,
} from "~~/e2e/utils/scenarioErrors"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

const tokenChannelTest = test.extend({
  screenshot: "off",
  trace: "off",
  video: "off",
})

for (const channel of ["extension", "official"] as const) {
  tokenChannelTest(
    `real-site New API token channel: ${channel} UI creates, saves and refreshes`,
    async ({ context, page, extensionId, extensionDir }, testInfo) => {
      test.setTimeout(240_000)
      context.setDefaultTimeout(15_000)
      page.setDefaultTimeout(15_000)
      const resolution = resolveNewApiRealSiteConfig()
      test.skip(
        !resolution.config,
        getNewApiRealSiteSkipReason(resolution.missingEnvKeys),
      )
      const config = resolution.config!
      const origin = new URL(config.baseUrl).origin
      const tokenName = `All API Hub e2e ${channel} ${randomUUID()}`
      const worker = await getServiceWorker(context)
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await seedUserPreferences(worker, {
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })
      const site = await context.newPage()
      let cleanupSession: (() => Promise<void>) | undefined
      let issued = false
      let creationAttempted = false
      let cleanupToken: (() => Promise<void>) | undefined
      let primaryError: unknown
      let identity = ""
      const onRequest = (request: import("@playwright/test").Request) => {
        if (
          request.url() !== `${origin}/api/user/access_tokens` ||
          request.method() !== "POST"
        )
          return
        try {
          creationAttempted ||= request.postDataJSON()?.name === tokenName
        } catch {
          // A request with an unreadable payload does not establish ownership.
        }
      }
      context.on("request", onRequest)
      try {
        const login = await loginToRealNewApiSite(site, config, tokenName)
        cleanupSession = login.cleanupOwnedSession
        identity = String(login.user.id)
        test.skip(
          !login.ownedScopedToken || !(await login.probeScopedAccessTokens?.()),
          "This channel requires scoped Access Token support",
        )
        const { find: lookupOwnedToken, revoke } = login.ownedScopedToken!
        expect(await lookupOwnedToken()).toBeUndefined()
        cleanupToken = revoke
        const recovery = createNewApiAccountRecovery({
          page,
          config,
          tokenChannel: channel,
          tokenName,
          expectedIdentity: identity,
          onCreatorReady: async (creator) => {
            if (!process.env.AAH_VISUAL_CAPTURE_DIR) return
            await creator
              .getByLabel("Token name", { exact: true })
              .scrollIntoViewIfNeeded()
            await captureVisualViews({
              page,
              ready: creator,
              id: "newapi-extension-creation-grant",
              extensionDir,
            })
            await page
              .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog)
              .getByRole("button", {
                name: "Verify and create token",
                exact: true,
              })
              .scrollIntoViewIfNeeded()
            await captureVisualViews({
              page,
              ready: creator,
              id: "newapi-extension-creation-verification",
              extensionDir,
            })
          },
        })
        await saveAutoDetectedAccountFromApp({
          page,
          extensionId,
          serviceWorker: worker,
          baseUrl: config.baseUrl,
          siteType: SITE_TYPES.NEW_API,
          prepareDetectedDialog: async (dialog) => {
            await recovery.prepareDetectedDialog(dialog)
            expect(creationAttempted).toBe(true)
            await expect.poll(lookupOwnedToken).toBeGreaterThan(0)
            issued = true
            await expect(dialog.userIdInput).toHaveValue(identity, {
              timeout: 30_000,
            })
            await captureVisualViews({
              page,
              ready: dialog.accessTokenInput,
              id: `newapi-token-${channel}-completed`,
              extensionDir,
            })
          },
        })
        const saved = await waitForSavedAccount({
          serviceWorker: worker,
          baseUrl: config.baseUrl,
          siteType: SITE_TYPES.NEW_API,
        })
        expect(String(saved.account_info.id)).toBe(identity)
        expect(saved.account_info.access_token.startsWith("nap_")).toBe(true)
        await site.close()
        await context.clearCookies()
        const isolated = await request.newContext()
        try {
          const response = await isolated.get(`${origin}/api/user/self`, {
            headers: {
              Authorization: `Bearer ${saved.account_info.access_token}`,
              "New-Api-User": identity,
            },
            maxRedirects: 0,
          })
          expect(response.ok()).toBe(true)
          const data = await response.json()
          expect(String(data.data?.id)).toBe(identity)
        } finally {
          await isolated.dispose()
        }
        await page.reload()
        await openAccountManagementPage({ page, extensionId })
        const refreshed = context.waitForEvent("response", {
          predicate: async (response) =>
            response.url() === `${origin}/api/user/self` &&
            response.ok() &&
            (await response.request().headerValue("authorization")) ===
              `Bearer ${saved.account_info.access_token}` &&
            !(await response.request().headerValue("cookie")),
        })
        await page.getByRole("button", { name: "Refresh", exact: true }).click()
        expect(String((await (await refreshed).json()).data?.id)).toBe(identity)
        const refreshedAccount = await waitForSavedAccount({
          serviceWorker: worker,
          baseUrl: config.baseUrl,
          siteType: SITE_TYPES.NEW_API,
          predicate: (account) =>
            account.id === saved.id &&
            account.last_sync_time > saved.last_sync_time,
        })
        expect(String(refreshedAccount.account_info.id)).toBe(identity)
        expect(
          refreshedAccount.account_info.access_token ===
            saved.account_info.access_token,
        ).toBe(true)
      } catch (error) {
        primaryError = error
      }
      const cleanupError = await collectCleanupError(
        [
          async () => {
            await cleanupToken?.()
          },
          async () => {
            await cleanupSession?.()
          },
          async () => {
            if (!site.isClosed()) await site.close()
          },
        ],
        "Token channel cleanup failed",
      )
      context.off("request", onRequest)
      await writeFile(
        testInfo.outputPath(`token-channel-${channel}.json`),
        JSON.stringify(
          {
            channel,
            issued,
            identityVerified: !primaryError,
            savedAndRefreshed: !primaryError,
            cleanupPassed: !cleanupError,
          },
          null,
          2,
        ),
      )
      throwScenarioError({
        primaryError,
        cleanupError,
        message: `New API ${channel} token channel failed`,
      })
    },
  )
}

registerBalanceDefaultDisplayTests("NEW_API")

registerRealSiteAccountDetectionTests({
  label: "New API",
  siteType: SITE_TYPES.NEW_API,
  cookieBootstrap: false,
  resolve: resolveNewApiRealSiteConfig,
  login: async (page, config) => {
    const result = await loginToRealNewApiSite(page, config)
    return {
      userId: String(result.user.id),
      cleanup: result.cleanupOwnedSession,
    }
  },
})

const guidanceTest = test.extend({
  screenshot: "off",
  trace: "off",
  video: "off",
})

guidanceTest.describe("real-site New API credential guidance", () => {
  guidanceTest.describe.configure({ retries: 0 })

  guidanceTest(
    "preserves manual recovery and opens the native token page without issuing a token",
    async ({ context, page, extensionId, extensionDir }, testInfo) => {
      test.setTimeout(180_000)
      const resolution = resolveNewApiRealSiteConfig()
      test.skip(
        !resolution.config,
        getNewApiRealSiteSkipReason(resolution.missingEnvKeys),
      )
      const config = resolution.config!
      const origin = new URL(config.baseUrl).origin
      const worker = await getServiceWorker(context)
      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await seedUserPreferences(worker, {
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })
      const sitePage = await context.newPage()
      let credentialPage: Page | undefined
      let cleanupSession: (() => Promise<void>) | undefined
      let primaryError: unknown
      const cdp = await context.newCDPSession(page)
      // Count dispatches across pages and workers; a GET can also issue a token.
      const tokenRequests: { method: string; path: string }[] = []
      const recordRequest = (request: { url(): string; method(): string }) => {
        const url = new URL(request.url())
        if (url.origin !== origin) return
        if (
          url.pathname === "/api/user/token" ||
          (request.method() === "POST" &&
            url.pathname === "/api/user/access_tokens")
        ) {
          tokenRequests.push({ method: request.method(), path: url.pathname })
        }
      }
      context.on("request", recordRequest)
      const evidence: Record<string, unknown> = { tokenRequests }
      try {
        const login = await loginToRealNewApiSite(sitePage, config)
        cleanupSession = login.cleanupOwnedSession
        const scopedTokens = (await login.probeScopedAccessTokens?.()) === true
        evidence.scopedTokenDialectConfirmed = scopedTokens
        test.skip(
          !scopedTokens,
          "Read-only scoped-token dialect proof is required before credential guidance detection",
        )
        await openAccountManagementPage({ page, extensionId })
        const runtime = await cdp.send("Runtime.evaluate", {
          expression: "chrome.runtime.id",
          returnByValue: true,
        })
        expect(runtime.result.value).toBe(extensionId)
        evidence.runtime = {
          extensionId,
          browser: (await cdp.send("Browser.getVersion")).product,
          build: JSON.parse(
            await readFile(
              path.join(extensionDir, ".aah-e2e-build.json"),
              "utf8",
            ),
          ),
        }
        const dialog = await autoDetectAccountFromAddDialog(
          page,
          config.baseUrl,
        )
        await expect(
          dialog.dialog.getByRole("button", {
            name: "Create token in extension",
            exact: true,
          }),
        ).toBeVisible({ timeout: 30_000 })
        const openFullForm = dialog.dialog.getByRole("button", {
          name: "Open full form",
          exact: true,
        })
        if (await openFullForm.isVisible()) await openFullForm.click()
        await expect(dialog.userIdInput).toHaveValue(String(login.user.id), {
          timeout: 30_000,
        })
        await expect(dialog.siteTypeTrigger).toHaveAttribute(
          "data-site-type",
          SITE_TYPES.NEW_API,
        )
        const guidance = dialog.dialog.getByTestId(
          ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage,
        )
        await expect(guidance).toHaveText(
          "Create a scoped token in the extension, or copy an existing token from the site.",
        )
        await expect(dialog.accessTokenInput).toBeEmpty()
        await expect(dialog.confirmAddButton).toBeEnabled()
        expect(tokenRequests).toEqual([])
        evidence.guidance = await guidance.innerText()

        await dialog.siteNameInput.fill("Keep my real-site draft")
        const notes = dialog.dialog.getByPlaceholder("Optional, enter notes")
        await notes.fill("Keep my recovery notes")
        const expectedUsername = await dialog.usernameInput.inputValue()
        expect(expectedUsername.length).toBeGreaterThan(0)
        await captureVisualViews({
          page,
          ready: guidance,
          id: "real-newapi-credential-guidance",
          extensionDir,
        })
        const sourceTab = await page.evaluate(() => chrome.tabs.getCurrent())
        if (sourceTab?.windowId == null)
          throw new Error("Missing account dialog window")
        const [openedPage] = await Promise.all([
          waitForNewUserFacingCredentialPage(
            context,
            worker,
            sourceTab.windowId,
          ),
          dialog.dialog
            .getByRole("button", { name: "Get from site", exact: true })
            .click(),
        ])
        credentialPage = openedPage
        await expect(credentialPage).toHaveURL(
          new URL("/security#security-access", config.baseUrl).href,
        )
        await expect(
          credentialPage
            .getByRole("button", {
              name: /^(Create access token|创建访问令牌)$/u,
            })
            .first(),
        ).toBeVisible({ timeout: 30_000 })
        await page.bringToFront()
        await expect(dialog.siteNameInput).toHaveValue(
          "Keep my real-site draft",
        )
        await expect(notes).toHaveValue("Keep my recovery notes")
        await expect(dialog.usernameInput).toHaveValue(expectedUsername)
        await expect(dialog.userIdInput).toHaveValue(String(login.user.id))
        await expect(dialog.accessTokenInput).toBeEmpty()
        await expect(dialog.accessTokenInput).toBeFocused()
        await expect(dialog.confirmAddButton).toBeEnabled()
        expect(tokenRequests).toEqual([])
        evidence.nativeTokenPage = "ready; no token creation requested"
        evidence.draftPreserved = true
      } catch (error) {
        primaryError = error
      }
      const cleanupError = await collectCleanupError(
        [
          async () => {
            await credentialPage?.close()
          },
          async () => {
            await cleanupSession?.()
          },
          async () => {
            await sitePage.close()
          },
          async () => {
            await cdp.detach()
          },
        ],
        "Real credential guidance cleanup failed",
      )
      context.off("request", recordRequest)
      evidence.passed = !primaryError && !cleanupError
      evidence.cleanupPassed = !cleanupError
      await writeFile(
        testInfo.outputPath("detection-credential-guidance.json"),
        JSON.stringify(evidence, null, 2),
      )
      throwScenarioError({
        primaryError,
        cleanupError,
        message: "Real credential guidance failed",
      })
    },
  )
})

test.describe("real-site E2E: New API account add flow", () => {
  // All checks share one real account. A terminal session-limit failure must
  // not restart workers and issue another login against the same account.
  test.describe.configure({
    mode: "serial",
    retries: 0,
  })

  const sharedAccountCache = createSharedRealSiteAccountFixtureCache()

  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  const usageChecks = [
    realSiteAccountUsageChecks.keyLifecycle(),
    realSiteAccountUsageChecks.keyToApiProfile(),
    realSiteAccountUsageChecks.providerDestinations({
      validateDestinationPages: true,
    }),
    realSiteAccountUsageChecks.modelCatalog(),
    realSiteAccountUsageChecks.modelToKey({ envPrefix: "NEW_API" }),
  ] as const

  for (const usageCheck of usageChecks) {
    test(`logs into a real New API site, saves the account, then ${usageCheck.name}`, async ({
      context,
      extensionId,
      page,
    }, testInfo) => {
      test.setTimeout(240_000)
      const realSite = resolveNewApiRealSiteConfig()
      test.skip(
        !realSite.config,
        getNewApiRealSiteSkipReason(realSite.missingEnvKeys),
      )

      const config = realSite.config!
      const serviceWorker = await getServiceWorker(context)

      await seedUserPreferences(serviceWorker, {
        managedSiteType: SITE_TYPES.NEW_API,
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })

      const accountFixture =
        await test.step("save or reuse account from real site auto-detect", async () =>
          await resolveSharedRealSiteAccountFixture({
            cache: sharedAccountCache,
            serviceWorker,
            prepareReusedAccountFixture:
              createReusedRealSiteAccountFixturePreparer({
                page,
                extensionId,
              }),
            prepareAccountFixture:
              createCompatibleRealSiteAccountFixturePreparer({
                context,
                page,
                extensionId,
                serviceWorker,
                config,
                ...createNewApiAccountRecovery({ page, config }),
                siteType: SITE_TYPES.NEW_API,
                login: loginToRealNewApiSite,
              }),
          }))
      await runRealSiteAccountFixtureUsageChecks(
        {
          testInfo,
          page,
          extensionId,
          serviceWorker,
          account: accountFixture,
          label: "New API",
        },
        [usageCheck],
      )
    })
  }
})
