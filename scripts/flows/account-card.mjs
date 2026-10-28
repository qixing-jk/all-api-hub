import { expect } from "@playwright/test"

import { getAccountManagementListItemTestId } from "../../src/features/AccountManagement/testIds.ts"
import { dismissModals } from "../cdp/ui-driver.mjs"

/** Verify the selected saved account, including when several accounts share a name. */
export async function testAccountCardFlow({
  page,
  extensionId,
  accountName,
  accountId,
  timeoutMs = 15_000,
}) {
  if (!accountId) throw new Error("account_card_requires_account_id")
  await page.goto(
    `chrome-extension://${extensionId}/options.html#account?search=${encodeURIComponent(accountName)}`,
  )
  await page.waitForLoadState("domcontentloaded")
  await dismissModals(page)
  const card = page.getByTestId(getAccountManagementListItemTestId(accountId))
  await expect(card).toBeVisible({ timeout: timeoutMs })
  await expect(card).toContainText(accountName, { timeout: timeoutMs })
  return { ok: true }
}
