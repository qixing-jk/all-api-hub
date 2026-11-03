import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS as accountIds,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { KEY_MANAGEMENT_TEST_IDS as ids } from "~/features/KeyManagement/testIds"
import { TOKEN_PROVISIONING_TEST_IDS as secretIds } from "~/features/TokenProvisioning/testIds"
import {
  encodeNanoGptCredentials,
  parseNanoGptCredentials,
} from "~/services/apiService/nanogpt/credentials"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  readStoredAccounts,
  refreshAccountRowsAndReadStorage,
} from "~~/e2e/scenarios/accountManualAdd"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { nativeKey } from "~~/tests/test-utils/nanogpt"

for (const hasManagementToken of [false, true]) {
  test(`NanoGPT saved inference key remains usable with management token ${hasManagementToken ? "present" : "missing"}`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    let managementReads = 0
    await context.route(
      "https://nano-gpt.com/api/management/v1/**",
      async (route) => {
        managementReads++
        await route.fulfill({ json: { data: [nativeKey] } })
      },
    )
    await context.route(
      "https://api.nano-gpt.com/api/check-balance",
      async (route) => {
        await route.fulfill({
          json: {
            usd_balance: "2",
            nano_balance: "0",
            nanoDepositAddress: "nano_fixture",
          },
        })
      },
    )
    await seedStoredAccounts(await getServiceWorker(context), [
      createStoredAccount({
        id: "nano-copy-key",
        site_name: "NanoGPT",
        site_type: SITE_TYPES.NANOGPT,
        site_url: "https://nano-gpt.com",
        account_info: {
          id: "nano_fixture",
          username: "fixture",
          access_token: encodeNanoGptCredentials({
            apiKey: "sk-nano-inference-fixture",
            managementToken: hasManagementToken ? "sk-nano-mgmt-fixture" : "",
          }),
        },
      }),
    ])
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
    )
    await waitForExtensionRoot(page)
    const row = page.getByTestId(
      getAccountManagementListItemTestId("nano-copy-key"),
    )
    await row.hover()
    await row.getByTestId(accountIds.rowCopyKeyButton).click()
    const dialog = page.getByRole("dialog").filter({ hasText: "Key List" })
    await expect(dialog.getByText("NanoGPT", { exact: true })).toHaveCount(2)
    await dialog.getByText("NanoGPT", { exact: true }).last().click()
    await expect(
      dialog.getByRole("button", { name: "Copy", exact: true }),
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Export", exact: true }),
    ).toBeEnabled()
    await expect(dialog.getByText(/only when it is created/)).toHaveCount(0)
    if (hasManagementToken) {
      await expect(
        dialog.getByText(nativeKey.name, { exact: true }),
      ).toBeVisible()
      await dialog
        .getByRole("button", {
          name: `View details for ${nativeKey.name}`,
          exact: true,
        })
        .click()
      await expect(
        dialog
          .getByRole("note")
          .filter({ hasText: /complete the required sign-in verification/ }),
      ).toBeVisible()
      expect(managementReads).toBeGreaterThan(0)
    } else {
      await expect(
        dialog.getByText(/requires a management token/),
      ).toBeVisible()
      await expect(
        dialog.getByText(/configuration_required|Failed to load/),
      ).toHaveCount(0)
      expect(managementReads).toBe(0)
    }
    await dialog.screenshot({
      path: testInfo.outputPath("nano-copy-key-light.png"),
      animations: "disabled",
    })
    await dialog.getByRole("button", { name: "Copy", exact: true }).click()
    await expect(
      dialog.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible()
    await page.emulateMedia({ colorScheme: "dark" })
    await page.setViewportSize({ width: 380, height: 740 })
    await expect(page.locator("html")).toHaveClass(/dark/)
    await dialog.screenshot({
      path: testInfo.outputPath("nano-copy-key-dark-mobile.png"),
      animations: "disabled",
    })
  })
}

test("NanoGPT management-only native lifecycle preserves limits and discloses a newly created secret once", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const keys = new Map([["17", { ...nativeKey }]])
  const patches: unknown[] = []
  let creates = 0
  let deletes = 0
  await context.route(
    "https://nano-gpt.com/api/management/v1/**",
    async (route) => {
      const request = route.request()
      expect(request.headers().authorization).toBe("Bearer sk-nano-mgmt-e2e")
      const id = new URL(request.url()).pathname.split("/").at(-1)!
      if (request.method() === "POST") {
        expect(request.headers()["idempotency-key"]).toBeTruthy()
        creates++
        const key = { ...nativeKey, ...request.postDataJSON(), id: "18" }
        keys.set("18", key)
        return route.fulfill({
          json: { ...key, key: "sk-nano-created-e2e-secret" },
        })
      }
      if (request.method() === "PATCH") {
        const patch = request.postDataJSON()
        patches.push(patch)
        Object.assign(keys.get(id)!, patch)
        return route.fulfill({ json: keys.get(id) })
      }
      if (request.method() === "DELETE") {
        deletes++
        keys.delete(id)
        return route.fulfill({ status: 204 })
      }
      if (id === "usage") return route.fulfill({ json: { active: false } })
      return route.fulfill({
        json: id === "api-keys" ? { data: [...keys.values()] } : keys.get(id),
      })
    },
  )
  await seedStoredAccounts(await getServiceWorker(context), [
    createStoredAccount({
      id: "nanogpt-management-e2e",
      site_name: "NanoGPT management fixture",
      site_type: SITE_TYPES.NANOGPT,
      site_url: "https://nano-gpt.com",
      account_info: {
        id: "nanogpt-management:fixture",
        username: "fixture",
        access_token: "sk-nano-mgmt-e2e",
        balanceUnavailable: true,
      },
    }),
  ])
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.KEYS}?accountId=nanogpt-management-e2e`,
  )
  await waitForExtensionRoot(page)
  const row = page.getByTestId(ids.nativeKeyRow).filter({ hasText: "fixture" })
  await expect(row).toHaveCount(1)
  await expect(
    row.getByRole("button", { name: "Copy Key", exact: true }),
  ).toHaveCount(0)
  await row.getByRole("button", { name: "Edit key", exact: true }).click()
  const editor = page.getByTestId(ids.nativeEditor)
  await expect(editor.getByLabel("Weekly spend limit (USD)")).toHaveValue("10")
  await editor.getByLabel("Daily spend limit (USD)").fill("3.75")
  await editor.screenshot({
    path: testInfo.outputPath("nanogpt-key-editor.png"),
  })
  await editor.getByLabel("Privacy routing").scrollIntoViewIfNeeded()
  await editor.screenshot({
    path: testInfo.outputPath("nanogpt-key-editor-privacy.png"),
  })
  await editor.getByTestId(ids.nativeEditorSubmitButton).click()
  await expect(editor).toBeHidden()
  expect(patches).toEqual([{ daily_usd_limit: 3.75 }])
  await row.getByRole("button", { name: "Edit key", exact: true }).click()
  await expect(editor.getByLabel("Daily spend limit (USD)")).toHaveValue("3.75")
  await expect(editor.getByLabel("Weekly spend limit (USD)")).toHaveValue("10")
  await editor.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.getByRole("button", { name: "Add API Key", exact: true }).click()
  await editor.getByLabel("Token Name").fill("NanoGPT created fixture")
  await editor.getByTestId(ids.nativeEditorSubmitButton).click()
  await expect(page.getByTestId(secretIds.oneTimeKeyInput)).toHaveValue(
    "sk-nano-created-e2e-secret",
  )
  const createdSecretDialog = page.getByRole("dialog", {
    name: "Key created",
    exact: true,
  })
  await expect(
    createdSecretDialog.getByText(/complete the required sign-in verification/),
  ).toBeVisible()
  await expect(
    createdSecretDialog.getByText(/only be viewed once/),
  ).toHaveCount(0)
  expect(creates).toBe(1)
  await page.getByTestId(secretIds.oneTimeKeyCloseButton).click()
  const createdRow = page
    .getByTestId(ids.nativeKeyRow)
    .filter({ hasText: "NanoGPT created fixture" })
  await expect(createdRow).toHaveCount(1)
  await createdRow
    .getByRole("button", { name: "Delete key", exact: true })
    .click()
  await page.getByTestId(ids.nativeDeleteConfirmButton).click()
  await expect(createdRow).toHaveCount(0)
  expect(deletes).toBe(1)
})

test("NanoGPT saves management-only credentials, reopens both inputs and adds an independent inference key", async ({
  context,
  extensionId,
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 1100 })
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedStoredAccounts(worker, [])
  await seedUserPreferences(worker, {
    refreshOnOpen: false,
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await context.route(
    "https://nano-gpt.com/api/management/v1/**",
    async (route) => {
      expect(route.request().headers().authorization).toBe(
        "Bearer sk-nano-mgmt-e2e",
      )
      expect(route.request().method()).toBe("GET")
      await route.fulfill({ json: { active: false } })
    },
  )
  await context.route("https://api.nano-gpt.com/**", async (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer sk-nano-inference-e2e",
    )
    const path = new URL(route.request().url()).pathname
    await route.fulfill({
      json: path.endsWith("check-balance")
        ? {
            usd_balance: "2",
            nano_balance: "0",
            nanoDepositAddress: "nano_e2e_identity",
          }
        : path.endsWith("/usage")
          ? { totals: { requests: 3, totalTokens: 4, costUsd: 0.01 } }
          : { active: false },
    })
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#account`,
  )
  await waitForExtensionRoot(page)
  await page.getByTestId(accountIds.addAccountButton).click()
  const dialog = page.getByTestId(accountIds.accountDialog)
  await dialog.getByTestId(accountIds.siteUrlInput).fill("https://nano-gpt.com")
  await dialog.getByTestId(accountIds.manualAddButton).click()
  await dialog.getByTestId(accountIds.siteTypeTrigger).click()
  await page.getByRole("option", { name: /nanogpt/i }).click()
  await dialog
    .getByTestId(accountIds.siteNameInput)
    .fill("NanoGPT dual credentials")
  await dialog.getByTestId(accountIds.usernameInput).fill("fixture")
  await dialog.getByTestId(accountIds.exchangeRateInput).fill("7")
  await dialog
    .getByTestId(accountIds.nanoGptManagementTokenInput)
    .fill("sk-nano-mgmt-e2e")
  await expect(dialog.getByTestId(accountIds.accessTokenInput)).toHaveValue("")
  await expect(
    dialog.getByTestId(accountIds.accessTokenInput),
  ).not.toHaveAttribute("required", "")
  await expect(page.getByTestId(accountIds.confirmAddButton)).toBeEnabled({
    timeout: 30_000,
  })
  await page.getByTestId(accountIds.confirmAddButton).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  await expect
    .poll(
      async () =>
        (await readStoredAccounts(worker))[0]?.account_info.balanceUnavailable,
    )
    .toBe(true)
  let saved = (await readStoredAccounts(worker))[0]!
  expect(saved.account_info.balanceUnavailable).toBe(true)
  expect(saved.account_info.id).toMatch(/^nanogpt-management:/)
  const row = page.getByTestId(getAccountManagementListItemTestId(saved.id))
  await row.hover()
  await row.getByTestId(accountIds.rowEditButton).click()
  await expect(
    dialog.getByTestId(accountIds.nanoGptManagementTokenInput),
  ).toHaveValue("sk-nano-mgmt-e2e")
  await expect(dialog.getByTestId(accountIds.accessTokenInput)).toHaveValue("")
  await dialog
    .getByTestId(accountIds.accessTokenInput)
    .fill("sk-nano-inference-e2e")
  await expect(
    dialog.getByText("Complete NanoGPT credentials", { exact: true }),
  ).toHaveCount(0)
  await dialog.screenshot({
    path: testInfo.outputPath("nanogpt-dual-credentials.png"),
    animations: "disabled",
  })
  await expect(page.getByTestId(accountIds.confirmAddButton)).toBeEnabled({
    timeout: 30_000,
  })
  await page.getByTestId(accountIds.confirmAddButton).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  saved = (await readStoredAccounts(worker))[0]!
  expect(parseNanoGptCredentials(saved.account_info.access_token)).toEqual({
    apiKey: "sk-nano-inference-e2e",
    managementToken: "sk-nano-mgmt-e2e",
  })
  expect(saved.account_info.id).toBe("nano_e2e_identity")
  await expect
    .poll(
      async () =>
        (await readStoredAccounts(worker))[0]?.account_info.balanceUnavailable,
    )
    .not.toBe(true)
  const [refreshed] = await refreshAccountRowsAndReadStorage({
    page,
    serviceWorker: worker,
    accountIds: [saved.id],
    expectedQuotas: [1_000_000],
  })
  expect(refreshed!.account_info.balanceUnavailable).not.toBe(true)
  await row.hover()
  await row.getByTestId(accountIds.rowEditButton).click()
  await expect(
    dialog.getByTestId(accountIds.nanoGptManagementTokenInput),
  ).toHaveValue("sk-nano-mgmt-e2e")
  await expect(dialog.getByTestId(accountIds.accessTokenInput)).toHaveValue(
    "sk-nano-inference-e2e",
  )
})
