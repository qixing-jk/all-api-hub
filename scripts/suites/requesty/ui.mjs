/* global chrome */
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { OPTIONS_PAGE_PATH } from "../../../src/constants/extensionPages.ts"
import { ACCOUNT_MANAGEMENT_TEST_IDS as accounts } from "../../../src/features/AccountManagement/testIds.ts"
import { KEY_MANAGEMENT_TEST_IDS as keys } from "../../../src/features/KeyManagement/testIds.ts"
import { TOKEN_PROVISIONING_TEST_IDS } from "../../../src/features/TokenProvisioning/testIds.ts"
import {
  REQUESTY_MANAGE_API_ORIGIN,
  REQUESTY_WEB_ORIGIN,
  SITE_TYPES,
} from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import {
  I18NEXT_LANGUAGE_STORAGE_KEY,
  STORAGE_LOCKS,
} from "../../../src/services/core/storageKeys.ts"
import { getAccounts } from "../../cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "../../cdp/ui-driver.mjs"
import { testModelCatalogFlow } from "../../flows/model-catalog.mjs"

const LANGUAGE_STORAGE_KEY = I18NEXT_LANGUAGE_STORAGE_KEY

const REQUESTY_CONSOLE_URL = REQUESTY_WEB_ORIGIN
const REQUESTY_SITE_TYPE = SITE_TYPES.REQUESTY
const ACCOUNT_STORAGE_LOCK = STORAGE_LOCKS.ACCOUNT_STORAGE

const KEY_PAGE_LOAD_ERROR_MARKERS = [
  "Failed to load keys",
  "无法加载",
  "加载密钥列表失败",
  "invalid_response",
]

/**
 * Live UI end-to-end checks for the Requesty account integration.
 *
 * Automatic onboarding must create and validate a management key when the
 * console is signed in. Otherwise it must preserve an actionable manual form.
 * A created or supplied credential continues through save, refresh, native
 * key create/edit/delete and provider model-catalog verification.
 *
 * The saved account and the throwaway key are both removed in `finally`; the
 * one-time plaintext of the created key is never printed. Console keys are
 * revoked by id and only when the pre-run inventory did not already contain
 * them, so a saved management credential reused by onboarding survives the run.
 */

/** Wait until the site-type trigger carries the expected `data-site-type`. */
async function waitForSiteType(page, siteType, timeoutMs = 20_000) {
  const triggerTestId = accounts.siteTypeTrigger
  const trigger = page.locator(`[data-testid="${triggerTestId}"]`)
  await page.waitForFunction(
    ([testId, expected]) =>
      document
        .querySelector(`[data-testid="${testId}"]`)
        ?.getAttribute("data-site-type") === expected,
    [triggerTestId, siteType],
    { timeout: timeoutMs },
  )
  return (await trigger.innerText()).trim()
}

/** Remove the account created by the credentialed stage, under the app lock. */
async function removeAccountFixture(serviceWorker, accountId) {
  await serviceWorker.evaluate(
    async ({ accountId, lockName }) => {
      if (!navigator.locks) throw new Error("account_storage_lock_unavailable")
      return navigator.locks.request(
        lockName,
        { mode: "exclusive" },
        async () => {
          const stored = await new Promise((resolve, reject) => {
            chrome.storage.local.get("site_accounts", (value) => {
              if (chrome.runtime.lastError)
                reject(new Error(chrome.runtime.lastError.message))
              else resolve(value)
            })
          })
          const raw = stored.site_accounts
          if (raw === undefined) return
          const envelope = typeof raw === "string" ? JSON.parse(raw) : raw
          if (!envelope || !Array.isArray(envelope.accounts)) return
          if (!envelope.accounts.some((account) => account.id === accountId))
            return
          const next = {
            ...envelope,
            accounts: envelope.accounts.filter(
              (account) => account.id !== accountId,
            ),
            last_updated: Date.now(),
          }
          for (const field of ["pinnedAccountIds", "orderedAccountIds"]) {
            if (Array.isArray(next[field]))
              next[field] = next[field].filter((id) => id !== accountId)
          }
          await new Promise((resolve, reject) => {
            chrome.storage.local.set(
              { site_accounts: JSON.stringify(next) },
              () => {
                if (chrome.runtime.lastError)
                  reject(new Error(chrome.runtime.lastError.message))
                else resolve()
              },
            )
          })
        },
      )
    },
    { accountId, lockName: ACCOUNT_STORAGE_LOCK },
  )
}

async function saveScreenshot(page, evidenceDir, name) {
  try {
    await fs.mkdir(evidenceDir, { recursive: true })
    await page.screenshot({
      path: path.join(evidenceDir, name),
      fullPage: true,
    })
    console.log(`  📸 证据截图: ${path.join(evidenceDir, name)}`)
  } catch (error) {
    console.warn(`  ⚠️ 截图失败 (${name}): ${error.message}`)
  }
}

/**
 * Page-side: reads the console session plus the key inventory that proves
 * cleanup ownership, using the console's own Clerk token. `keys` is null
 * whenever the inventory cannot be established, which callers must treat as
 * "ownership unknown", never as "no keys".
 * @param manageApiOrigin Management API origin.
 * @returns The console path, the signed-in flag and the key inventory.
 */
async function readConsoleStateInPage(manageApiOrigin) {
  const path = window.location.pathname
  const signedIn = Boolean(window.Clerk?.session)
  if (!signedIn) return { path, signedIn, keys: null }
  const token = await window.Clerk.session.getToken?.()
  if (!token) return { path, signedIn, keys: null }
  const response = await fetch(`${manageApiOrigin}/v1/apikey`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
  })
  if (!response.ok) return { path, signedIn, keys: null }
  const payload = await response.json()
  // The console collection answers `{ apis: [...] }`.
  const list = Array.isArray(payload)
    ? payload
    : payload.apis || payload.api_keys || payload.keys || []
  return {
    path,
    signedIn,
    keys: list
      .map((key) => ({
        id: String(key.api_key_id ?? key.id ?? ""),
        name: String(key.name ?? ""),
      }))
      .filter((key) => key.id && key.name),
  }
}

/**
 * Page-side: deletes exactly the given console key ids.
 * @param params Deletion input.
 * @param params.manageApiOrigin Management API origin.
 * @param params.keyIds Console key ids to revoke.
 * @returns Per-id deletion status, or the reason the pass did not run.
 */
async function deleteConsoleKeysInPage({ manageApiOrigin, keyIds }) {
  const token = await window.Clerk?.session?.getToken?.()
  if (!token) return { error: "signed_out", deleted: [] }
  const deleted = []
  for (const id of keyIds) {
    const response = await fetch(`${manageApiOrigin}/v1/apikey/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit",
    })
    deleted.push({ id, status: response.status })
  }
  return { deleted }
}

/**
 * Opens `/api-keys` in the dev profile and runs `read` on the Clerk-ready page.
 * Returns null when the console could not be opened in time.
 */
async function withConsolePage(context, read) {
  const consolePage = await context.newPage()
  try {
    await consolePage.goto(`${REQUESTY_CONSOLE_URL}/api-keys`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    })
    await consolePage.waitForFunction(
      () =>
        Boolean(window.Clerk?.loaded) || location.pathname.includes("sign-in"),
      undefined,
      { timeout: 20_000 },
    )
    return await read(consolePage)
  } catch {
    return null
  } finally {
    await consolePage.close().catch(() => {})
  }
}

/**
 * Opens the console in the dev profile and reports whether its Clerk session is
 * signed in, plus the key inventory that proves cleanup ownership.
 */
async function readConsoleSessionState(context) {
  const state = await withConsolePage(context, (consolePage) =>
    consolePage.evaluate(readConsoleStateInPage, REQUESTY_MANAGE_API_ORIGIN),
  )
  return state ?? { path: "", signedIn: false, keys: null }
}

/** Reads the console key inventory, or null when it cannot be established. */
async function readConsoleKeys(context) {
  return (await readConsoleSessionState(context)).keys
}

/** Deletes only the console key ids this run created. */
async function deleteConsoleKeysByIds(context, keyIds) {
  const result = await withConsolePage(context, (consolePage) =>
    consolePage.evaluate(deleteConsoleKeysInPage, {
      manageApiOrigin: REQUESTY_MANAGE_API_ORIGIN,
      keyIds,
    }),
  )
  return result ?? { error: "console_unavailable", deleted: [] }
}

/**
 * Decides whether the credential onboarding resolved to belongs to this run.
 * Ownership is provable only against an inventory read before any console write,
 * so a key the pre-run inventory already contained — a saved credential reused
 * by onboarding — is never owned, and an unreadable inventory proves nothing.
 * @param onboardingKey Key the onboarding credential resolved to.
 * @param preRunConsoleKeyIds Console key ids present before the run, or null when
 *   the inventory could not be read.
 * @returns True only when this run created the key.
 */
export function consoleKeyBelongsToRun(onboardingKey, preRunConsoleKeyIds) {
  if (!preRunConsoleKeyIds) return false
  return !preRunConsoleKeyIds.has(onboardingKey.id)
}

/**
 * Stage 1: the credential-free detection + guidance flow.
 * @param params Stage parameters.
 * @param params.page Options page.
 * @param params.evidenceDir Evidence screenshot directory.
 * @param params.session Console session read before any write; its inventory
 *   also proves cleanup ownership.
 * @param params.createdConsoleKeys Receives only the console keys this run
 *   created.
 * @param params.preRunConsoleKeyIds Console key ids that existed before the
 *   run; null when the inventory could not be read.
 * @returns The open dialog page (positioned at the manual form) so the
 *   credentialed stage can continue in it; caller closes it.
 */
async function runDetectionStage({
  page,
  evidenceDir,
  session,
  createdConsoleKeys,
  preRunConsoleKeyIds,
}) {
  console.log("  [UI 步骤 1] 自动识别 app.requesty.ai 并校验管理密钥引导...")

  await page
    .locator(`[data-testid="${accounts.addAccountButton}"]`)
    .first()
    .click()
  const dialog = page.locator(`[data-testid="${accounts.accountDialog}"]`)
  await dialog.waitFor({ state: "visible", timeout: 15_000 })

  const urlInput = page.locator(`[data-testid="${accounts.siteUrlInput}"]`)
  await urlInput.fill("")
  await urlInput.fill(REQUESTY_CONSOLE_URL)

  const detectButton = page.locator(
    `[data-testid="${accounts.autoDetectButton}"]`,
  )
  if (
    !/Create Requesty Management Key.*Detect/i.test(
      await detectButton.innerText(),
    )
  ) {
    throw new Error(
      "the entrypoint must explicitly disclose management-key creation",
    )
  }
  await detectButton.click()

  // Success leaves detection (the form phase removes the detect button) while
  // failure keeps it enabled or shows the error alert — any of the three ends
  // the wait; the assertions after it decide which outcome this was.
  await page.waitForFunction(
    (ids) => {
      const token = document.querySelector(
        `[data-testid="${ids.accessTokenInput}"]`,
      )
      if (token instanceof HTMLInputElement && token.value.length > 0)
        return true
      const error = document.querySelector(
        `[data-testid="${ids.autoDetectErrorMessage}"]`,
      )
      if (error && (error.textContent || "").trim()) return true
      const button = document.querySelector(
        `[data-testid="${ids.autoDetectButton}"]`,
      )
      return Boolean(button && !button.disabled)
    },
    accounts,
    { timeout: 90_000 },
  )
  const siteTypeText = await waitForSiteType(page, REQUESTY_SITE_TYPE)
  console.log(`  - 站点类型: ${siteTypeText}`)

  const tokenInput = page.locator(
    `[data-testid="${accounts.accessTokenInput}"]`,
  )
  await tokenInput.waitFor({ state: "visible", timeout: 10_000 })

  // Site-type identity must be explicit, not just a translated label.
  const siteTypeAttribute = await page
    .locator(`[data-testid="${accounts.siteTypeTrigger}"]`)
    .getAttribute("data-site-type")

  const tokenLabel = await page
    .locator("label")
    .filter({ hasText: "Requesty manage key" })
    .first()
    .innerText()
    .catch(() => "")

  const token = await tokenInput.inputValue()
  const username = await page
    .locator(`[data-testid="${accounts.usernameInput}"]`)
    .inputValue()
  const errorText = await page
    .locator(`[data-testid="${accounts.autoDetectErrorMessage}"]`)
    .innerText()
    .catch(() => "")
  const created = Boolean(token && username.trim() && !errorText)
  if (token) {
    // Account display names describe the organization. Credential metadata
    // must come from the calling key itself, including recovery after a
    // partially successful onboarding that retained its one-time plaintext.
    const onboardingKey = await page.evaluate(async (credential) => {
      const response = await fetch(
        "https://api-v2.requesty.ai/v1/manage/apikey/self",
        {
          headers: { Authorization: `Bearer ${credential}` },
          credentials: "omit",
        },
      )
      if (!response.ok)
        throw new Error("cannot identify the onboarding key for cleanup")
      const body = await response.json()
      if (typeof body.id !== "string" || !body.id) {
        throw new Error("onboarding key has no cleanup id")
      }
      if (typeof body.name !== "string" || !body.name.trim()) {
        throw new Error("onboarding key has no cleanup name")
      }
      return { id: body.id, name: body.name }
    }, token)
    // The dialog also prefills a saved account credential, so a non-empty token
    // proves nothing about ownership. Only a key absent from the pre-run
    // inventory was created by this run; revoking by name would delete whatever
    // credential the operator already had.
    if (!consoleKeyBelongsToRun(onboardingKey, preRunConsoleKeyIds)) {
      console.log(
        `  ℹ️ 未确认密钥归属，跳过控制台清理: ${onboardingKey.name}（运行前清单${preRunConsoleKeyIds ? "已包含该密钥" : "不可读"}）`,
      )
    } else {
      createdConsoleKeys.push(onboardingKey)
    }
  }
  await saveScreenshot(page, evidenceDir, "requesty-detection.png")
  if (siteTypeAttribute !== REQUESTY_SITE_TYPE || !tokenLabel) {
    throw new Error(
      "Requesty must select its own site type and manage-key field",
    )
  }
  if (session.signedIn && (!created || errorText)) {
    throw new Error(
      `signed-in automatic onboarding must fill a verified account: ${errorText}`,
    )
  }
  if (!created) {
    const guidance = dialog.locator("text=/API Keys page/").first()
    if (
      !(await guidance.isVisible()) ||
      !/Sign in to Requesty|automatically|may have been/i.test(errorText)
    ) {
      throw new Error(
        "failed onboarding must retain actionable manual-key guidance",
      )
    }
    if (/signed-in account could not be confirmed/i.test(errorText)) {
      throw new Error(
        "Requesty must not show the generic identity detection error",
      )
    }
  }
  console.log(
    created
      ? "Automatic onboarding verified"
      : "Explicit manual fallback verified",
  )
  return { dialog, autoCreate: { created, username } }
}

/**
 * Run the Requesty live UI suite.
 * @param options Suite options.
 * @param options.context CDP browser context.
 * @param options.extensionId Mounted extension id.
 * @param options.serviceWorker Extension service worker.
 * @param options.key Optional manage key. When set, the suite completes the
 *   onboarding, refreshes the account, round-trips a throwaway key through the
 *   native editor and renders the model catalogue.
 * @param options.evidenceDir Directory for evidence screenshots.
 */
export async function runRequestyUiTest({
  context,
  extensionId,
  serviceWorker,
  key = "",
  evidenceDir,
}) {
  console.log("\n🖥️ 开始执行 Requesty 扩展端到端 UI 交互验证 (CDP)...")

  const knownAccountIds = new Set(
    (await getAccounts(serviceWorker)).map((account) => account.id),
  )
  const ownedKeyNames = new Set()
  /** Console keys this run created; owned by id, never by name. */
  const createdConsoleKeys = []
  // Snapshot ownership before any console write: a saved credential reused by
  // onboarding must survive the suite, so only ids absent here are ours to revoke.
  const consoleSession = await readConsoleSessionState(context)
  const preRunConsoleKeyIds = consoleSession.keys
    ? new Set(consoleSession.keys.map((entry) => entry.id))
    : null
  let createdAccountId = null
  const page = await openExtensionPage({
    context,
    extensionId,
    route: `${OPTIONS_PAGE_PATH}#account`,
  })
  let stageError = null

  try {
    await dismissModals(page)

    // ---------------------------------------------------------------
    // Stage 1: detection + guidance (no credential required).
    // ---------------------------------------------------------------
    const { dialog, autoCreate } = await runDetectionStage({
      page,
      evidenceDir,
      session: consoleSession,
      createdConsoleKeys,
      preRunConsoleKeyIds,
    })

    if (!autoCreate.created && !key) {
      console.log(
        "  ℹ️ 未提供管理密钥 (REQUESTY_MANAGE_KEY)，跳过保存/刷新/密钥 CRUD/模型目录验证。",
      )
    } else {
      // ---------------------------------------------------------------
      // Stage 2: complete onboarding with an available credential.
      // ---------------------------------------------------------------
      console.log("  [UI 步骤 2] 完成保存账号...")
      // The manual footer (save button) only renders once the form is valid.
      if (!autoCreate.created) {
        await page
          .locator(`[data-testid="${accounts.accessTokenInput}"]`)
          .fill(key)
      }
      // The exchange-rate label is not associated with its input; the balance
      // section's first number input is the exchange rate field.
      await page
        .locator(
          `[data-testid="${accounts.accountFormSectionBalance}"] input[type="number"]`,
        )
        .first()
        .fill("7.2")
      const saveButton = page
        .locator(`[data-testid="${accounts.confirmAddButton}"]`)
        .first()
      await saveButton.waitFor({ state: "visible", timeout: 15_000 })
      await saveButton.click()
      await dialog.waitFor({ state: "hidden", timeout: 60_000 })

      const accountsNow = await getAccounts(serviceWorker)
      const created = accountsNow.find(
        (account) =>
          !knownAccountIds.has(account.id) &&
          String(account.site_url || "").includes("requesty"),
      )
      if (!created) {
        throw new Error(
          "the saved account should appear in account storage with a requesty URL",
        )
      }
      createdAccountId = created.id
      console.log(`  - 已保存账号: ${created.site_name} (${created.id})`)

      await page.reload()
      await page.waitForLoadState("domcontentloaded")
      await dismissModals(page)
      const accountRow = page.locator(
        `[data-testid="account-management-account-list-item-${created.id}"]`,
      )
      await accountRow.waitFor({ state: "visible", timeout: 15_000 })
      await saveScreenshot(page, evidenceDir, "requesty-account-card.png")

      // ---------------------------------------------------------------
      // Stage 3: refresh the account against the live API.
      // ---------------------------------------------------------------
      console.log("  [UI 步骤 3] 刷新账号余额（管理 API 读取）...")
      await accountRow
        .locator(`[data-testid="${accounts.rowMoreActionsButton}"]`)
        .first()
        .click()
      await page
        .locator(`[data-testid="${accounts.rowRefreshMenuItem}"]`)
        .first()
        .click()
      await page.waitForTimeout(4000)
      const cardText = await accountRow.innerText()
      if (/failed|失败/i.test(cardText)) {
        throw new Error(
          "the account refresh should succeed against the live API",
        )
      }
      console.log("  ✅ 刷新完成且无失败提示")

      // ---------------------------------------------------------------
      // Stage 4: native key editor round trip on a throwaway key.
      // ---------------------------------------------------------------
      const keyPage = await context.newPage()
      await keyPage.addInitScript(
        ([storageKey, value]) => window.localStorage.setItem(storageKey, value),
        [LANGUAGE_STORAGE_KEY, "en"],
      )
      await keyPage.goto(
        `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=${encodeURIComponent(created.id)}`,
      )
      await keyPage.waitForLoadState("domcontentloaded")
      await dismissModals(keyPage)
      try {
        const addBtn = keyPage
          .locator(`[data-testid="${keys.addTokenButton}"]`)
          .first()
        await addBtn.waitFor({ state: "visible", timeout: 30_000 })
        await requireCleanInventory(keyPage)

        const createdKeyName = `AAH E2E Requesty CDP ${randomUUID()}`
        ownedKeyNames.add(createdKeyName)
        console.log(
          `  [UI 步骤 4] 通过原生编辑器创建一次性密钥 [${createdKeyName}]...`,
        )

        await addBtn.click()
        await keyPage
          .locator(`[data-testid="${keys.nativeEditorLoading}"]`)
          .waitFor({ state: "detached", timeout: 60_000 })
        const submitBtn = keyPage
          .locator(`[data-testid="${keys.nativeEditorSubmitButton}"]`)
          .first()
        await submitBtn.waitFor({ state: "visible", timeout: 30_000 })

        await keyPage.getByLabel("Token Name").fill(createdKeyName)
        await limitInput(keyPage).fill("5")
        await submitNativeEditor(keyPage, submitBtn)

        const createdRow = keyRow(keyPage, createdKeyName)
        await createdRow.first().waitFor({ state: "visible", timeout: 30_000 })
        console.log("  ✅ 创建已落到密钥清单")
        await closeOneTimeSecretDialog(keyPage)

        // Edit: the monthly limit is the only editable scalar; verify via the
        // editor input so a spend figure cannot satisfy the assertion.
        await keyRowButton(createdRow, "Edit key").click()
        await submitBtn.waitFor({ state: "visible", timeout: 30_000 })
        await limitInput(keyPage).fill("7")
        await submitNativeEditor(keyPage, submitBtn)

        await keyRowButton(createdRow, "Edit key").click()
        await submitBtn.waitFor({ state: "visible", timeout: 30_000 })
        const readBackLimit = await limitInput(keyPage).inputValue()
        await submitNativeEditor(keyPage, submitBtn)
        if (Number(readBackLimit) !== 7) {
          throw new Error(
            `the monthly limit edit should read back as 7, got "${readBackLimit}"`,
          )
        }
        console.log("  ✅ 月限额编辑已读回 (5 → 7)")

        // Delete the throwaway key through the UI immediately.
        await keyRowButton(createdRow, "Delete key").click()
        await keyPage
          .locator(`[data-testid="${keys.nativeDeleteConfirmButton}"]`)
          .first()
          .click()
        await createdRow.first().waitFor({ state: "hidden", timeout: 30_000 })
        ownedKeyNames.delete(createdKeyName)
        console.log("  ✅ 一次性密钥已从清单删除")

        await saveScreenshot(keyPage, evidenceDir, "requesty-keys.png")
      } finally {
        try {
          if (ownedKeyNames.size) {
            await dismissModals(keyPage)
            await keyPage.reload()
            await keyPage
              .locator(`[data-testid="${keys.addTokenButton}"]`)
              .waitFor({ state: "visible", timeout: 30_000 })
            await requireCleanInventory(keyPage)
            for (const name of ownedKeyNames) {
              const row = keyRow(keyPage, name)
              if (!(await row.count())) continue
              await keyRowButton(row, "Delete key").click()
              await keyPage
                .locator(`[data-testid="${keys.nativeDeleteConfirmButton}"]`)
                .first()
                .click()
              await row.first().waitFor({ state: "hidden", timeout: 30_000 })
            }
            ownedKeyNames.clear()
          }
        } finally {
          await keyPage.close().catch(() => {})
        }
      }

      // ---------------------------------------------------------------
      // Stage 5: the model catalogue renders priced rows.
      // ---------------------------------------------------------------
      console.log("  [UI 步骤 5] 验证 #models 页面模型与价格渲染...")
      const modelResult = await testModelCatalogFlow({
        page,
        extensionId,
        accountName: created.site_name,
        accountId: created.id,
      })
      console.log(`  - 模型目录: ✅ ${modelResult.countLine}`)

      console.log("  ✅ Requesty UI 端到端全套流程校验通过")
    }
  } catch (error) {
    stageError = error
  }
  // Cleanup runs on every path: the throwaway key is handled in its own
  // finally, and the saved account must not outlive the run.
  let accountCleanupError = null
  try {
    if (createdAccountId) {
      await removeAccountFixture(serviceWorker, createdAccountId)
      const remaining = await getAccounts(serviceWorker)
      if (remaining.some((account) => account.id === createdAccountId)) {
        accountCleanupError = new Error(
          `failed to remove the temporary Requesty account ${createdAccountId}`,
        )
      } else {
        console.log("  🧹 临时账号已从存储移除")
      }
    }
  } finally {
    await page.close().catch(() => {})
  }
  // A key created by the console session is not owned by the key inventory, so
  // it is revoked separately, by id only; a console that cannot be read leaves
  // the key for the operator.
  let consoleKeyCleanupError = null
  if (createdConsoleKeys.length) {
    const cleanup = await deleteConsoleKeysByIds(
      context,
      createdConsoleKeys.map((entry) => entry.id),
    )
    if (cleanup.deleted?.length) {
      console.log(
        `  🧹 已删除自动创建的密钥: ${cleanup.deleted.map((entry) => entry.id).join(", ")}`,
      )
    } else {
      console.warn(
        `  ⚠️ 未能删除自动创建的密钥${cleanup.error ? ` (${cleanup.error})` : ""}；请在控制台手动删除。`,
      )
    }
  }
  if (preRunConsoleKeyIds?.size) {
    // The ownership rule above must hold end to end: every key that predated the
    // run, including a saved credential that onboarding reused, still exists.
    const remainingKeys = await readConsoleKeys(context)
    if (!remainingKeys) {
      console.warn("  ⚠️ 无法复核运行前的控制台密钥是否仍然存在，请手动确认。")
    } else {
      const survivingIds = new Set(remainingKeys.map((entry) => entry.id))
      const lost = [...preRunConsoleKeyIds].filter(
        (id) => !survivingIds.has(id),
      )
      if (lost.length) {
        consoleKeyCleanupError = new Error(
          `the suite no longer finds console keys that predated the run: ${lost.join(", ")}`,
        )
      } else {
        console.log("  ✅ 运行前的控制台密钥未被触碰")
      }
    }
  }
  if (accountCleanupError) {
    throw accountCleanupError
  }
  if (consoleKeyCleanupError) {
    throw consoleKeyCleanupError
  }
  if (stageError) {
    throw stageError
  }
}

/** The editor's monthly-limit field. */
function limitInput(page) {
  return page.getByLabel("Monthly limit (USD)")
}

function keyRow(page, name) {
  return page
    .locator(`[data-testid="${keys.nativeKeyRow}"]`)
    .filter({ hasText: name })
}

function keyRowButton(row, name) {
  return row.first().getByRole("button", { name, exact: true })
}

/**
 * Submits the native editor exactly once. Opening the editor triggers an
 * inventory reload and the save button stays disabled until it settles, so the
 * click waits for an enabled button instead of racing the reload. A retry after
 * a dispatched write could create a second key, so an editor that stays open is
 * a failure rather than a reason to click again.
 */
async function submitNativeEditor(page, submitBtn) {
  // Let the post-open inventory reload settle before the first submit.
  await page.waitForTimeout(2000)
  if (!(await submitBtn.isVisible().catch(() => false))) return
  await submitBtn.click()
  const closed = await submitBtn
    .waitFor({ state: "hidden", timeout: 30_000 })
    .then(() => true)
    .catch(() => false)
  if (!closed) {
    throw new Error(
      "the native editor submit never closed the dialog; never resubmit a dispatched write",
    )
  }
}

/**
 * Closes the one-time plaintext dialog opened after a create. The plaintext
 * is never printed; the throwaway key is deleted within the same run.
 */
async function closeOneTimeSecretDialog(page) {
  const closeButton = page
    .locator(
      `[data-testid="${TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton}"]`,
    )
    .first()
  if (!(await closeButton.isVisible().catch(() => false))) return
  await closeButton.click()
  const confirmClose = page
    .locator(
      `[data-testid="${TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyConfirmCloseButton}"]`,
    )
    .first()
  if (await confirmClose.isVisible().catch(() => false)) {
    await confirmClose.click()
  }
  await page
    .locator(
      `[data-testid="${TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton}"]`,
    )
    .first()
    .waitFor({ state: "hidden", timeout: 15_000 })
  await page.waitForTimeout(500)
}

/** Refuse to treat a failed inventory fetch as proof that owned keys are absent. */
async function requireCleanInventory(page) {
  // The keys route re-triggers a load shortly after mount; a transient fetch
  // error toast must not fail the run, so poll until the body is stable.
  const deadline = Date.now() + 20_000
  let lastBody = ""
  for (;;) {
    lastBody = await page.innerText("body")
    const matched = KEY_PAGE_LOAD_ERROR_MARKERS.some((marker) =>
      lastBody.includes(marker),
    )
    if (!matched) return
    if (Date.now() > deadline) {
      const matched = KEY_PAGE_LOAD_ERROR_MARKERS.filter((marker) =>
        lastBody.includes(marker),
      )
      throw new Error(
        `密钥管理页面加载失败 (markers: ${matched.join(", ")}): ${lastBody.slice(0, 800)}`,
      )
    }
    await page.waitForTimeout(1500)
  }
}
