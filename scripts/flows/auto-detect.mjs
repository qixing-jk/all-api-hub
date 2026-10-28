import { expect } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../../src/features/AccountManagement/testIds.ts"

/** Assert a caller-declared detection target without dispatching or saving. */
export async function assertAccountDetectionOutcome({
  page,
  expectedType,
  fields,
  saveState,
  guidance,
  timeoutMs = 30_000,
}) {
  if (
    !expectedType ||
    !fields ||
    !Object.keys(fields).length ||
    !["absent", "disabled", "enabled"].includes(saveState)
  )
    throw new Error(
      "Detection outcome requires type, expected fields and save state",
    )
  const dialog = page.getByTestId(accounts.accountDialog)
  await expect(dialog).toBeVisible({ timeout: timeoutMs })
  await expect(dialog.getByTestId(accounts.siteTypeTrigger)).toHaveAttribute(
    "data-site-type",
    expectedType,
    { timeout: timeoutMs },
  )
  for (const [field, value] of Object.entries(fields)) {
    if (!accounts[field] || typeof value !== "string")
      throw new Error(`Invalid detection field expectation: ${field}`)
    await expect(dialog.getByTestId(accounts[field])).toHaveValue(value, {
      timeout: timeoutMs,
    })
  }
  if (guidance !== undefined) {
    await expect(
      dialog.getByText(guidance, { exact: typeof guidance === "string" }),
    ).toBeVisible({ timeout: timeoutMs })
  } else {
    await expect(
      dialog.getByTestId(accounts.autoDetectErrorMessage),
    ).toBeHidden({ timeout: timeoutMs })
  }
  const save = dialog.getByTestId(accounts.confirmAddButton)
  if (saveState === "absent")
    await expect(save).toHaveCount(0, { timeout: timeoutMs })
  else {
    await expect(save).toBeVisible({ timeout: timeoutMs })
    if (saveState === "enabled")
      await expect(save).toBeEnabled({ timeout: timeoutMs })
    else await expect(save).toBeDisabled({ timeout: timeoutMs })
  }
  return dialog
}

/** Open a fresh account draft; this alone does not run credential acquisition. */
export async function openAccountAddDialog({
  page,
  targetUrl,
  timeoutMs = 30_000,
}) {
  await page
    .getByTestId(accounts.addAccountButton)
    .or(page.getByTestId(accounts.emptyStateAddAccountButton))
    .first()
    .click({ timeout: timeoutMs })
  const dialog = page.getByTestId(accounts.accountDialog)
  await dialog.waitFor({ state: "visible", timeout: timeoutMs })
  await dialog.getByTestId(accounts.siteUrlInput).fill(targetUrl)
  return dialog
}

/**
 * Execute the actual automatic action once and verify its machine site type.
 * Provider-specific acquisition effects remain those of the real action.
 */
export async function detectAccountSiteType({
  page,
  expectedType,
  timeoutMs = 30_000,
}) {
  if (!expectedType)
    throw new Error(
      "Automatic detection requires an expected machine site type",
    )
  const dialog = page.getByTestId(accounts.accountDialog)
  await dialog
    .getByTestId(accounts.autoDetectButton)
    .click({ timeout: timeoutMs })
  const outcome = await page.waitForFunction(
    ({ dialogId, triggerId, detectId, errorId, expectedType }) => {
      const root = document.querySelector(`[data-testid="${dialogId}"]`)
      const trigger = root?.querySelector(`[data-testid="${triggerId}"]`)
      const detect = root?.querySelector(`[data-testid="${detectId}"]`)
      if (detect?.getAttribute("aria-busy") === "true") return false
      const error = root?.querySelector(`[data-testid="${errorId}"]`)
      if (error?.textContent?.trim()) return { error: error.textContent.trim() }
      return trigger?.getAttribute("data-site-type") === expectedType
    },
    {
      dialogId: accounts.accountDialog,
      triggerId: accounts.siteTypeTrigger,
      detectId: accounts.autoDetectButton,
      errorId: accounts.autoDetectErrorMessage,
      expectedType,
    },
    { timeout: timeoutMs },
  )
  try {
    const result = await outcome.jsonValue()
    if (result?.error)
      throw new Error(`Automatic detection failed: ${result.error}`)
  } finally {
    await outcome.dispose()
  }
  return dialog
}

/** Close an owned draft through its application control and wait for closure. */
export async function closeAccountDraft(page, { timeoutMs = 30_000 } = {}) {
  const dialog = page.getByTestId(accounts.accountDialog)
  await dialog
    .getByRole("button", { name: /^(取消|Cancel|关闭|Close)$/i })
    .first()
    .click({ timeout: timeoutMs })
  await dialog.waitFor({ state: "hidden", timeout: timeoutMs })
}

/** Verify detection, then close the draft without saving an account. */
export async function testAutoDetectFlow({
  page,
  targetUrl,
  expectedType,
  timeoutMs = 30_000,
}) {
  if (!expectedType)
    throw new Error(
      "Automatic detection requires an expected machine site type",
    )
  await openAccountAddDialog({ page, targetUrl, timeoutMs })
  const dialog = await detectAccountSiteType({ page, expectedType, timeoutMs })
  const dialogText = await dialog.innerText()
  await closeAccountDraft(page, { timeoutMs })
  return { ok: true, dialogText }
}
