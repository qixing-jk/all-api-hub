import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { setupRuntimeMessageListeners } from "~/entrypoints/background/runtimeMessages"
import {
  cleanupTempContextsOnSuspend,
  setupTempWindowListeners,
} from "~/entrypoints/background/tempWindowPool"
import { accountStorage } from "~/services/accounts/accountStorage"
import { migrateAccountsConfig } from "~/services/accounts/migrations/accountDataMigration"
import { setupExternalReadApi } from "~/services/integrations/externalReadApi"
import {
  hasNewOptionalPermissions,
  setLastSeenOptionalPermissions,
} from "~/services/permissions/optionalPermissionState"
import {
  hasPermissions,
  OPTIONAL_PERMISSIONS,
} from "~/services/permissions/permissionManager"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import {
  getManifest,
  onInstalled,
  onStartup,
  onSuspend,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

import { applyActionClickBehavior } from "./actionClickBehavior"
import { setupContextMenus } from "./contextMenus"
import {
  initializeCookieInterceptors,
  setupCookieInterceptorListeners,
} from "./cookieInterceptor"
import { applyDevActionBranding } from "./devActionBranding"
import { initializeServices } from "./servicesInit"

/**
 * Unified logger scoped to the background entrypoint and lifecycle hooks.
 */
const logger = createLogger("BackgroundEntrypoint")

/**
 * Test-mode builds should not auto-open install/update permission onboarding,
 * otherwise E2E suites inherit unrelated tabs/dialogs from the background
 * lifecycle before they can drive a target page.
 */
function shouldAutoOpenPermissionsOnboarding(): boolean {
  return import.meta.env.MODE !== "test"
}

export default defineBackground(() => {
  logger.debug("Hello background", { id: browser.runtime.id })

  // Apply dev-only branding early so the toolbar action is visually distinguishable.
  void applyDevActionBranding()

  /**
   * 设置各种事件监听器
   */
  setupRuntimeMessageListeners()
  setupExternalReadApi()
  setupTempWindowListeners()
  setupCookieInterceptorListeners()
  setupContextMenus()

  /**
   * 监听插件安装/更新事件
   * 进行配置迁移和服务初始化
   */
  onInstalled(async (details) => {
    logger.info("插件安装/更新，初始化自动刷新服务和 WebDAV 自动同步服务")

    try {
      // Important: await initialization so MV3 service workers keep the install/update event alive.
      // If the worker stops early, alarm-based schedulers may not restore their schedules, which
      // can break features like auto check-in after updates.
      await initializeServices()

      if (details.reason === "install" || details.reason === "update") {
        logger.info("Triggering config migration", { reason: details.reason })

        // Migrate user preferences.
        await userPreferences.getPreferences()
        logger.info("User preferences migration completed")

        // Migrate legacy tag strings into global tag store + tagIds.
        await tagStorage.ensureLegacyMigration()
        logger.info("Tag store migration completed")

        // Load all accounts and migrate
        const accounts = await accountStorage.getAllAccounts()
        const { accounts: migrated, migratedCount } =
          migrateAccountsConfig(accounts)

        if (migratedCount > 0) {
          // Save migrated accounts back
          const config = await accountStorage.exportData()
          await accountStorage.importData({ ...config, accounts: migrated })
          logger.info("Account migration completed", { migratedCount })
        }

        if (
          details.reason === "install" &&
          OPTIONAL_PERMISSIONS.length > 0 &&
          shouldAutoOpenPermissionsOnboarding()
        ) {
          logger.info("First install detected, opening permissions onboarding")
          openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, {
            tab: "permissions",
            onboarding: "permissions",
          })
        } else if (
          details.reason === "install" &&
          OPTIONAL_PERMISSIONS.length > 0
        ) {
          logger.info(
            "First install detected in test build; skipping permissions onboarding auto-open",
          )
        }

        if (details.reason === "update") {
          const { version } = getManifest()
          if (version) {
            await changelogOnUpdateState.setPendingVersion(version)
          }
        }

        if (details.reason === "update" && OPTIONAL_PERMISSIONS.length > 0) {
          const hasNew = await hasNewOptionalPermissions()
          if (hasNew) {
            const allGranted = await hasPermissions(OPTIONAL_PERMISSIONS)
            if (allGranted) {
              // No missing permissions; refresh snapshot quietly.
              await setLastSeenOptionalPermissions()
              logger.info(
                "New optional permissions detected but already granted; snapshot refreshed without prompting",
              )
            } else if (shouldAutoOpenPermissionsOnboarding()) {
              logger.info(
                "Update detected with new optional permissions; prompting user to re-confirm",
              )
              openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, {
                tab: "permissions",
                onboarding: "permissions",
                reason: "new-permissions",
              })
            } else {
              logger.info(
                "Update detected with new optional permissions in test build; skipping onboarding auto-open",
              )
            }
          } else {
            // Keep snapshot fresh on update when nothing new to prompt
            await setLastSeenOptionalPermissions()
          }
        }
      }
    } catch (error) {
      logger.error("Failed to handle install/update initialization flow", error)
    }
  })

  /**
   * 监听浏览器启动事件
   *
   * Notes:
   * - Chrome may clear alarms on browser restart; re-initializing here ensures alarm schedules
   *   (auto check-in / model sync / WebDAV auto-sync / usage-history sync) are restored promptly.
   * - Awaiting prevents the MV3 service worker from going idle before schedules are reconciled.
   */
  onStartup(async () => {
    logger.info("浏览器启动，恢复后台服务与 alarms 调度")
    try {
      await initializeServices()
    } catch (error) {
      logger.error("Failed to initialize services on startup", error)
    }
  })

  onSuspend(() => {
    // runtime.onSuspend cannot rely on awaited async work, so start the temp-context
    // sweep best-effort without changing the normal delayed request-release flow.
    void cleanupTempContextsOnSuspend().catch((error) => {
      logger.warn("Failed to cleanup temp contexts on suspend", error)
    })
  })

  main()
})

/**
 * Entrypoint invoked at background startup.
 * Ensures services are initialized before installing cookie interceptors so that downstream requests have localization and config ready.
 */
async function main() {
  await initializeServices()

  const prefs = await userPreferences.getPreferences()
  await applyActionClickBehavior(prefs.actionClickBehavior ?? "popup")

  await initializeCookieInterceptors()
}
