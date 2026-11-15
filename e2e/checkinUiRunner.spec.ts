import { expect, test } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as ids } from "~/features/AccountManagement/testIds"
import { test as extensionTest } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  configureAccountLoginFromUi,
  redetectCheckinMethod,
  refreshAccountFromUi,
  removeOwnedAccountFromUi,
} from "~~/scripts/test-xingya-session-checkin-e2e-live.mjs"

test("waits for the account list to finish loading before confirming cleanup", async ({
  context,
  page,
}) => {
  await page.setContent(`<button onclick="setTimeout(() => {
    const list = document.getElementById('list');
    list.removeAttribute('aria-busy');
    document.getElementById('owned').hidden = false;
  }, 2000)">Account Management</button>
  <input placeholder="Enter site information or account information to search">
  <div id="list" style="min-height:80px" data-testid="${ids.accountListView}" aria-busy="true">
    <div id="owned" hidden data-testid="account-management-account-list-item-owned">Owned delayed account
      <button data-testid="${ids.rowMoreActionsButton}">More</button>
    </div>
  </div>
  <button data-testid="${ids.rowDeleteMenuItem}">Delete</button>
  <button data-testid="${ids.deleteConfirmButton}" onclick="document.getElementById('owned').remove()">Confirm delete</button>`)
  // A loading list has no mounted account rows yet, as in the extension skeleton.
  await page.locator("#owned").evaluate((element) => {
    const parent = element.parentElement!
    element.remove()
    setTimeout(() => parent.append(element), 1500)
  })
  await removeOwnedAccountFromUi(
    context,
    page,
    "unused",
    "Owned delayed account",
  )
  await expect(page.getByTestId(ids.accountListView)).not.toHaveAttribute(
    "aria-busy",
    "true",
  )
  await expect(
    page.getByText("Owned delayed account", { exact: false }),
  ).toHaveCount(0)
})

extensionTest(
  "cleans its owned account through a new Options page after the original closes",
  async ({ context, page, extensionId }) => {
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await forceExtensionLanguage(page, "en")
    await seedStoredAccounts(worker, [
      ...Array.from({ length: 80 }, (_, index) =>
        createStoredAccount({
          id: `other-${index}`,
          site_name: `Account ${String(index).padStart(3, "0")}`,
        }),
      ),
      createStoredAccount({
        id: "owned-cleanup",
        site_name: "Owned cleanup account",
      }),
      createStoredAccount({
        id: "unrelated-cleanup",
        site_name: "Unrelated account",
      }),
    ])
    await page.goto(`chrome-extension://${extensionId}/options.html#account`)
    await page.close()
    await removeOwnedAccountFromUi(
      context,
      page,
      extensionId,
      "Owned cleanup account",
    )
    const check = await context.newPage()
    await check.goto(`chrome-extension://${extensionId}/options.html#account`)
    await expect(check.getByTestId(ids.accountListView)).toBeVisible()
    const search = check.getByPlaceholder(
      "Enter site information or account information to search",
    )
    await search.fill("Owned cleanup account")
    await expect(
      check.getByText("No matching accounts found", { exact: true }),
    ).toBeVisible()
    await search.fill("Unrelated account")
    await expect(
      check.getByText("Unrelated account", { exact: true }),
    ).toBeVisible()
    await check.close()
  },
)

for (const password of [true, false]) {
  test(`configures the offered ${password ? "password" : "Linux DO"} login through UI`, async ({
    page,
  }) => {
    await page.setContent(`<div role="dialog">
      <section data-testid="${ids.accountFormSectionCheckIn}">
        <button onclick="document.getElementById('login').hidden=false">Set up login</button>
        <div role="combobox" aria-label="Check-in method">Automatic selection: Daily check-in</div>
      </section>
      <section id="login" hidden>
        <button id="login-method" role="combobox" aria-label="Login method" onclick="document.getElementById('options').hidden=false">Not configured</button>
        <label>Login username<input id="account-login-username"></label>
        <label>Login password<input id="account-login-password" type="password"></label>
      </section>
    </div>
    <div id="options" hidden>
      <button role="option" onclick="document.getElementById('login-method').textContent=this.textContent;this.parentElement.hidden=true">Password login</button>
      <button role="option" onclick="document.getElementById('login-method').textContent=this.textContent;this.parentElement.hidden=true">Linux DO</button>
    </div>`)
    await configureAccountLoginFromUi(
      page,
      page.getByRole("dialog"),
      password
        ? { username: "fixture-user", password: "fixture-password" }
        : {},
    )
    await expect(
      page.getByRole("combobox", { name: "Login method", exact: true }),
    ).toHaveText(password ? "Password login" : "Linux DO")
    if (password) {
      await expect(page.getByLabel("Login username")).toHaveValue(
        "fixture-user",
      )
      await expect(page.getByLabel("Login password")).toHaveValue(
        "fixture-password",
      )
    }
    await expect(
      page.getByRole("combobox", { name: "Check-in method", exact: true }),
    ).toHaveText("Automatic selection: Daily check-in")
  })
}

test("rejects failed redetection even when the previous automatic selection remains", async ({
  page,
}) => {
  await page.setContent(`<section>
    <button onclick="document.getElementById('feedback').hidden=false">Detect check-in method</button>
    <div role="combobox" aria-label="Check-in method">Automatic selection: Daily check-in</div>
    <div role="alert" id="feedback" hidden>Detection failed</div>
  </section>`)
  await expect(
    redetectCheckinMethod(
      page.locator("section"),
      /^Automatic selection: Daily check-in$/u,
    ),
  ).rejects.toThrow()
})

test("rejects a failed refresh even when a saved account row remains", async ({
  page,
}) => {
  await page.setContent(`<div id="account">
    <button data-testid="${ids.rowMoreActionsButton}">More</button>
    <span>Owned account</span>
  </div>
  <button data-testid="${ids.rowRefreshMenuItem}" onclick="document.getElementById('feedback').hidden=false">Refresh</button>
  <div role="status" id="feedback" hidden>Failed to refresh Owned account</div>`)
  await expect(
    refreshAccountFromUi(page, page.locator("#account"), "Owned account"),
  ).rejects.toThrow()
})
