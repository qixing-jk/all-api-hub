import { SITE_TYPES } from "~/constants/siteType"
import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "~/features/AccountManagement/testIds"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import { saveAutoDetectedAccountFromApp } from "~~/e2e/utils/accountLifecycle"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { createSub2ApiBrowserSessionFixture } from "~~/e2e/utils/sub2apiBrowserSessionFixture"
import { createUiCapture } from "~~/scripts/cdp/ui-driver.mjs"

test("Sub2API website OAuth session detects, saves and refreshes without a password, including after closing its page", async ({
  context,
  page,
  extensionId,
}, testInfo) => {
  test.slow()
  const fixture = await createSub2ApiBrowserSessionFixture()
  const { origin, state, failures } = fixture
  const site = await context.newPage()
  try {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedUserPreferences(worker, {
      accountAutoRefresh: {
        ...DEFAULT_PREFERENCES.accountAutoRefresh,
        enabled: false,
        refreshOnOpen: false,
      },
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: false,
        pretriggerDailyOnUiOpen: false,
      },
    })
    await site.goto(origin)
    await site.getByRole("button", { name: "Continue with OAuth" }).click()
    await expect(site.locator("#status")).toHaveText("Signed in 17")
    // Return from the website to the extension before filling or capturing it.
    // Keeping the website active also lets its URL prefill race our manual fill.
    await page.bringToFront()
    const saved = await saveAutoDetectedAccountFromApp({
      page,
      extensionId,
      serviceWorker: worker,
      baseUrl: origin,
      siteType: SITE_TYPES.SUB2API,
      expectedSiteType: SITE_TYPES.SUB2API,
      prepareDetectedDialog: async (dialog) => {
        await expect(dialog.userIdInput).toHaveValue("17")
        await expect(dialog.usernameInput).toHaveValue("oauth-17")
        const browserSession = dialog.sub2apiBrowserSessionOption.getByRole(
          "radio",
          { name: "Browser session" },
        )
        await expect(browserSession).toBeChecked()
        await createUiCapture({
          page,
          directory: testInfo.outputDir,
          bringToFront: true,
        })("detected-website-session.png", dialog.dialog)
        await browserSession.press("ArrowDown")
        await expect(
          dialog.sub2apiIndependentSessionOption.getByRole("radio"),
        ).toBeChecked()
        const manual = dialog.dialog.getByTestId(ids.sub2apiManualDisclosure)
        await manual.click()
        await expect(
          dialog.dialog.getByText(
            "This website keeps its refresh token in the browser.",
            { exact: true },
          ),
        ).toBeVisible()
        await expect(dialog.sub2apiImportSessionButton).toHaveCount(0)
        await expect(dialog.sub2apiRefreshTokenInput).toHaveValue("")
        await manual.evaluate((button) =>
          button.scrollIntoView({ block: "center" }),
        )
        await createUiCapture({
          page,
          directory: testInfo.outputDir,
          bringToFront: true,
        })("manual-panel-proof.png", dialog.dialog)
        await dialog.sub2apiBrowserSessionOption.click()
      },
    })
    const account = () =>
      readStoredAccounts(worker).then((accounts) =>
        accounts.find((a) => a.id === saved.accountId)!,
      )
    const observedBalance = async () => {
      const amount = (await account()).account_info.balance?.positions[0]
        ?.amount
      return amount?.status === "known" ? amount.value : undefined
    }
    expect((await account()).login?.credentials?.password).toBeFalsy()
    expect((await account()).sub2apiAuth).toBeUndefined()
    const keyPrompt = page.getByRole("dialog", {
      name: "Create API Key",
      exact: true,
    })
    if (await keyPrompt.isVisible())
      await keyPrompt
        .getByRole("button", { name: "Cancel", exact: true })
        .click()
    const row = page.getByTestId(
      getAccountManagementListItemTestId(saved.accountId!),
    )
    const refresh = async () => {
      await page.bringToFront()
      await row.hover()
      await row.getByTestId(ids.rowMoreActionsButton).click()
      await page.getByTestId(ids.rowRefreshMenuItem).click()
    }
    await row.hover()
    await row.getByTestId(ids.rowEditButton).click()
    const edit = page.getByRole("dialog", { name: "Edit Account", exact: true })
    await expect(edit.getByTestId(ids.userIdInput)).toHaveValue("17")
    await expect(
      edit.getByTestId(ids.sub2apiBrowserSessionOption).getByRole("radio"),
    ).toBeChecked()
    await edit.getByTestId(ids.sub2apiIndependentSessionOption).click()
    const setup = edit.getByRole("button", { name: "Set up login" })
    await expect(setup).toBeVisible()
    await expect(edit.getByTestId(ids.sub2apiManualDisclosure)).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    await setup.evaluate((button) => button.scrollIntoView({ block: "center" }))
    await createUiCapture({
      page,
      directory: testInfo.outputDir,
      bringToFront: true,
    })("setup-desktop.png", edit)
    await edit.getByRole("button", { name: "Cancel", exact: true }).click()
    state.balance = 18
    await refresh()
    await expect
      .poll(observedBalance, { timeout: 45_000 })
      .toBe("18")
      .catch(async (error) => {
        console.log(
          JSON.stringify({
            health: (await account()).health,
            balance: (await account()).account_info.balance,
            state,
            failures,
          }),
        )
        await testInfo.attach("failed-browser-refresh", {
          body: JSON.stringify({ account: await account(), state, failures }),
          contentType: "application/json",
        })
        throw error
      })
    await site.close()
    await page.reload()
    state.balance = 21
    await refresh()
    await expect.poll(observedBalance).toBe("21")
    const switched = await context.newPage()
    await switched.goto(origin)
    await switched.getByRole("button", { name: "Switch account" }).click()
    await expect(switched.locator("#status")).toHaveText("Signed in 23")
    state.revoked = true
    const previous = await account()
    await refresh()
    await expect
      .poll(async () => (await account()).health?.status)
      .toBe("warning")
    expect((await account()).account_info.id).toBe(previous.account_info.id)
    expect((await account()).account_info.access_token).toBe(
      previous.account_info.access_token,
    )
    await switched.getByRole("button", { name: "Continue with OAuth" }).click()
    await expect(switched.locator("#status")).toHaveText("Signed in 17")
    await switched.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("sub2api-panel-proof-v2")
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    })
    state.revoked = false
    const beforeMissingKey = state.identityReads
    await refresh()
    await expect
      .poll(async () => (await account()).health.reason)
      .toMatch(/log.*in|sign.*in|login/i)
    expect((await account()).account_info.access_token).toBe(
      previous.account_info.access_token,
    )
    expect(state.identityReads).toBe(beforeMissingKey)
    expect(
      await switched.evaluate(async () =>
        (await indexedDB.databases()).some(
          (db) => db.name === "sub2api-panel-proof-v2",
        ),
      ),
    ).toBe(false)
    expect(state.refreshRequests).toBe(0)
    expect(failures).toEqual([])
    await testInfo.attach("website-session-result", {
      body: JSON.stringify({
        identityReads: state.identityReads,
        refreshRequests: state.refreshRequests,
        closedPageRecovered: true,
        identityMismatchRejected: true,
      }),
      contentType: "application/json",
    })
    await switched.close()
  } finally {
    await site.close().catch(() => {})
    await fixture.close()
  }
})
