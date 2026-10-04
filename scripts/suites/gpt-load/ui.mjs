import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { withStoredValue } from "../../cdp/sandbox.mjs"
import { dismissModals } from "../../cdp/ui-driver.mjs"

/**
 * Live UI end-to-end checks for the gpt-load managed site.
 *
 * Drives the real dev extension (already mounted in the CDP browser) against a
 * real deployment, so every assertion crosses the extension/upstream boundary:
 * the settings form renders the stored configuration and validates it, the
 * channel workspace lists the deployment's actual groups, and a group the UI
 * creates is confirmed on the gateway before being deleted through the UI.
 *
 * The dev profile is shared with the operator's daily browsing, so preferences
 * are patched inside a sandbox that restores the original bytes, and the
 * cleanup always runs and preserves the original UI failure.
 */

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
)

/** Same key the E2E suite writes; a plain JSON string envelope. */
const USER_PREFERENCES_STORAGE_KEY = "user_preferences"
const LANGUAGE_STORAGE_KEY = "all-api-hub-i18nextLng"

const MANAGED_SITE_CHANNELS_TEST_IDS = {
  addChannelButton: "managed-site-channels-add-channel-button",
  searchInput: "managed-site-channels-search-input",
  deleteSelectedButton: "managed-site-channels-delete-selected-button",
  deleteChannelConfirmButton: "managed-site-channels-delete-confirm-button",
}

const CHANNEL_DIALOG_TEST_IDS = {
  nameInput: "channel-dialog-name-input",
  baseUrlInput: "channel-dialog-base-url-input",
  submitButton: "channel-dialog-submit-button",
}

/**
 * The multi-key secret-list renderer names each row's input
 * `<fieldId>-secret-input-<index>`, so the key field is addressed by its own
 * stable test id rather than by placeholder copy.
 */
const CHANNEL_DIALOG_KEY_INPUT = '[data-testid^="key-secret-input-"]'

const SETTINGS_ANCHOR_IDS = {
  baseUrl: "gpt-load-base-url",
  managementKey: "gpt-load-management-key",
  validate: "gpt-load-validate",
}

/** Read the shipped copy so an assertion follows the product's own wording. */
function readEnglishSetting(pathExpression) {
  const settings = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, "src", "locales", "en", "settings.json"),
      "utf8",
    ),
  )
  return pathExpression.split(".").reduce((node, key) => node?.[key], settings)
}

const OPTIONS_PAGE = (extensionId, params = {}, hash = "basic") => {
  const url = new URL(`chrome-extension://${extensionId}/options.html`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.hash = hash
  return url.toString()
}

const createApi = (baseUrl, managementKey) => {
  const root = baseUrl.replace(/\/+$/, "")
  const headers = {
    Authorization: `Bearer ${managementKey}`,
    Accept: "application/json",
  }

  return {
    async listGroups() {
      const response = await fetch(`${root}/api/groups?page=1&page_size=100`, {
        headers,
      })
      if (!response.ok) {
        throw new Error(`GET /api/groups -> HTTP ${response.status}`)
      }
      const payload = await response.json()
      return Array.isArray(payload?.data?.items) ? payload.data.items : []
    },
    async hasGroupNamed(name) {
      return (await this.listGroups()).some((group) => group?.name === name)
    },
    /** Seeds one group so an empty deployment still has a row to project. */
    async createGroup(name) {
      const response = await fetch(`${root}/api/groups`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          // The gateway rejects a non-canonical `Idempotency-Key`.
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name,
          price_multiplier: "1",
          channel_id: "openai_compatible",
          connection_type: "api_key",
          params: { base_url: "https://seed.example.invalid/v1" },
          models: [],
          credentials: `sk-seed-${Date.now().toString(36)}`,
          confirm_same_target: true,
        }),
      })
      if (!response.ok) {
        throw new Error(`POST /api/groups -> HTTP ${response.status}`)
      }
    },
    async deleteNamed(name) {
      const doomed = (await this.listGroups()).filter(
        (group) => group?.name === name,
      )
      // Report only the deletes the gateway actually accepted: this runs as
      // cleanup, so a failed request must not be logged as a reclaimed channel.
      let removed = 0
      for (const group of doomed) {
        const response = await fetch(`${root}/api/groups/${group.id}`, {
          method: "DELETE",
          headers: { ...headers, "content-type": "application/json" },
          body: "{}",
        })
        if (response.ok) {
          removed += 1
        } else {
          console.warn(
            `  ⚠️ 删除临时渠道失败 (${group.id}): HTTP ${response.status}`,
          )
        }
      }
      return removed
    },
  }
}

/**
 * Wait for a live region that was not there before an action.
 *
 * The notification toast shares `role="status"` with the pages' own live
 * notices, so the toast is identified by being new rather than by any
 * library-internal class or attribute.
 */
async function readNewLiveRegionText(page, locator, previousTexts, timeoutMs) {
  const previous = new Set(previousTexts)
  const deadline = Date.now() + timeoutMs
  let observed = []

  while (Date.now() < deadline) {
    observed = (await locator.allTextContents())
      .map((value) => value.trim())
      .filter(Boolean)
    const fresh = observed.find((text) => !previous.has(text))
    if (fresh) return { text: fresh, observed }
    await page.waitForTimeout(250)
  }

  return { text: "", observed }
}

async function openPage(context, extensionId, { params, hash }) {
  const page = await context.newPage()
  // Mirrors the E2E helper: the language lives in the page's localStorage.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [LANGUAGE_STORAGE_KEY, "en"],
  )
  await page.goto(OPTIONS_PAGE(extensionId, params, hash))
  await page.waitForLoadState("domcontentloaded")
  return page
}

/**
 * Run the gpt-load live UI suite.
 * @param options Suite options.
 * @param options.context CDP browser context.
 * @param options.extensionId Mounted extension id.
 * @param options.serviceWorker Extension service worker.
 * @param options.baseUrl Deployment root.
 * @param options.managementKey Gateway root management key (`AUTH_KEY`).
 */
export async function runGptLoadUiTest({
  context,
  extensionId,
  serviceWorker,
  baseUrl,
  managementKey,
}) {
  if (!baseUrl || !managementKey) {
    throw new Error("gpt-load UI 实测需要 baseUrl 与管理密钥 (AUTH_KEY)")
  }

  console.log("\n🖥️ 开始执行 gpt-load 扩展端到端 UI 交互验证...")
  const api = createApi(baseUrl, managementKey)
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "")
  const successCopy = readEnglishSetting("gptLoad.validation.success")
  const runPrefix = `AAH E2E gpt-load CDP ${Date.now().toString(36)}`
  const createdName = `${runPrefix} Channel`
  let seededName
  let createdThroughUi = false
  let uiFailed = false
  let uiError

  // A leftover from an interrupted earlier run would break the "appears once"
  // assertion below, so clear this run's prefix before it can exist.
  await api.deleteNamed(createdName)

  try {
    await withStoredValue(
      serviceWorker,
      USER_PREFERENCES_STORAGE_KEY,
      {
        managedSiteType: "gpt-load",
        gptLoad: { baseUrl: normalizedBaseUrl, managementKey },
        openChangelogOnUpdate: false,
      },
      async () => {
        // ---------------------------------------------------------------
        // 1. Settings: the form renders the stored config and validates it.
        // ---------------------------------------------------------------
        const settingsPage = await openPage(context, extensionId, {
          params: { anchor: "gpt-load" },
          hash: "basic",
        })
        try {
          await dismissModals(settingsPage)
          await settingsPage
            .locator("#gpt-load-base-url")
            .waitFor({ state: "visible", timeout: 30_000 })
          const renderedBaseUrl = await settingsPage
            .locator(`#${SETTINGS_ANCHOR_IDS.baseUrl}`)
            .locator("input")
            .inputValue()
          if (renderedBaseUrl.replace(/\/+$/, "") !== normalizedBaseUrl) {
            throw new Error(
              `设置页未能回显已保存的部署地址: ${renderedBaseUrl}`,
            )
          }
          console.log(`  ✅ 设置页回显网关地址: ${renderedBaseUrl}`)

          const liveRegions = settingsPage.locator('[role="status"]')
          const noticesBefore = (await liveRegions.allTextContents())
            .map((value) => value.trim())
            .filter(Boolean)

          const validateButton = settingsPage
            .locator(`#${SETTINGS_ANCHOR_IDS.validate}`)
            .getByRole("button")
          await validateButton.scrollIntoViewIfNeeded()
          await validateButton.click()

          const { text: toastText, observed } = await readNewLiveRegionText(
            settingsPage,
            liveRegions,
            noticesBefore,
            30_000,
          )
          console.log(`  [校验结果提示]: ${toastText}`)
          if (!toastText.includes(successCopy)) {
            throw new Error(
              `连接校验未返回成功提示 (期望包含 "${successCopy}")，实际提示: ${toastText || "(无新提示)"}；页面既有提示: ${observed.join(" | ")}`,
            )
          }
          console.log("  ✅ 设置页连接校验通过（admin 主体）")
        } finally {
          await settingsPage.close().catch(() => {})
        }

        // ---------------------------------------------------------------
        // 2. Channels: the table lists the deployment's real groups.
        // ---------------------------------------------------------------
        let deploymentNames = (await api.listGroups())
          .map((group) => group?.name)
          .filter(Boolean)
        if (deploymentNames.length === 0) {
          // An empty deployment still has to prove the list projection: seed one
          // disposable group through the API and remove it at the end.
          seededName = `${runPrefix} Seed`
          await api.createGroup(seededName)
          deploymentNames = [seededName]
        }

        const channelsPage = await openPage(context, extensionId, {
          params: {},
          hash: "managedSiteChannels",
        })
        try {
          await dismissModals(channelsPage)
          await channelsPage
            .locator(
              `[data-testid="${MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton}"]`,
            )
            .waitFor({ state: "visible", timeout: 30_000 })

          const search = channelsPage.locator(
            `[data-testid="${MANAGED_SITE_CHANNELS_TEST_IDS.searchInput}"]`,
          )
          await search.fill(deploymentNames[0])
          const listedRow = channelsPage
            .locator('[data-testid^="managed-site-channel-row-"]')
            .filter({ hasText: deploymentNames[0] })
          await listedRow.first().waitFor({ state: "visible", timeout: 30_000 })
          console.log(
            `  ✅ 渠道工作区列出部署上的真实分组: ${deploymentNames[0]}`,
          )

          // -------------------------------------------------------------
          // 3. Create through the UI, confirm on the gateway, then delete.
          // -------------------------------------------------------------
          await channelsPage
            .locator(
              `[data-testid="${MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton}"]`,
            )
            .click()
          await channelsPage
            .locator(`[data-testid="${CHANNEL_DIALOG_TEST_IDS.submitButton}"]`)
            .waitFor({ state: "visible", timeout: 30_000 })
          await channelsPage
            .locator(`[data-testid="${CHANNEL_DIALOG_TEST_IDS.nameInput}"]`)
            .fill(createdName)
          await channelsPage
            .locator(`[data-testid="${CHANNEL_DIALOG_TEST_IDS.baseUrlInput}"]`)
            .fill("https://upstream.example.invalid/v1")
          await channelsPage
            .locator(CHANNEL_DIALOG_KEY_INPUT)
            .first()
            .fill(`sk-gpt-load-cdp-${Date.now().toString(36)}`)
          await channelsPage
            .locator(`[data-testid="${CHANNEL_DIALOG_TEST_IDS.submitButton}"]`)
            .click()
          await channelsPage
            .locator(`[data-testid="${CHANNEL_DIALOG_TEST_IDS.submitButton}"]`)
            .waitFor({ state: "hidden", timeout: 60_000 })

          if (!(await api.hasGroupNamed(createdName))) {
            throw new Error(`UI 提交后网关侧未出现分组: ${createdName}`)
          }
          createdThroughUi = true
          console.log(`  ✅ UI 创建已落到网关: ${createdName}`)

          await channelsPage.goto(
            OPTIONS_PAGE(
              extensionId,
              { search: createdName },
              "managedSiteChannels",
            ),
          )
          await channelsPage.waitForLoadState("domcontentloaded")
          const createdRow = channelsPage
            .locator('[data-testid^="managed-site-channel-row-"]')
            .filter({ hasText: createdName })
          await createdRow
            .first()
            .waitFor({ state: "visible", timeout: 30_000 })

          const rowTestId = await createdRow.first().getAttribute("data-testid")
          const rowToken = rowTestId.replace("managed-site-channel-row-", "")
          await channelsPage
            .locator(
              `[data-testid="managed-site-channel-row-${rowToken}-select"]`,
            )
            .click()
          await channelsPage
            .locator(
              `[data-testid="${MANAGED_SITE_CHANNELS_TEST_IDS.deleteSelectedButton}"]`,
            )
            .click()
          await channelsPage
            .locator(
              `[data-testid="${MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton}"]`,
            )
            .click()
          await createdRow
            .first()
            .waitFor({ state: "detached", timeout: 60_000 })

          if (await api.hasGroupNamed(createdName)) {
            throw new Error(`UI 删除后网关侧仍存在分组: ${createdName}`)
          }
          createdThroughUi = false
          console.log("  ✅ UI 删除已在网关生效，现场已复原")
        } finally {
          await channelsPage.close().catch(() => {})
        }
      },
    )
  } catch (error) {
    uiFailed = true
    uiError = error
  }
  // The UI normally owns cleanup; this covers a failure between create and
  // delete so a live run never leaves a group behind.
  let cleanupError
  let cleanupFailed = false
  for (const [name, expectedPresent] of [
    [createdName, createdThroughUi],
    [seededName, false],
  ]) {
    if (!name) continue
    try {
      if (expectedPresent || (await api.hasGroupNamed(name))) {
        const removed = await api.deleteNamed(name)
        if (await api.hasGroupNamed(name)) {
          throw new Error(`gpt-load UI cleanup 未完成，仍存在分组: ${name}`)
        }
        console.log(`  🧹 兜底清理分组: 已删除 ${removed} 条`)
      }
    } catch (error) {
      cleanupFailed = true
      cleanupError ??= error
      console.warn(`  ⚠️ gpt-load UI cleanup 失败: ${name}`, error)
    }
  }
  if (uiFailed) throw uiError
  if (cleanupFailed) throw cleanupError

  console.log("\n  ✅ gpt-load live UI 实测全部完成，沙盒现场已复原。")
}
