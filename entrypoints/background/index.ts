import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { setupRuntimeMessageListeners } from "~/entrypoints/background/runtimeMessages"
import { setupTempWindowListeners } from "~/entrypoints/background/tempWindowPool"
import { accountStorage } from "~/services/accountStorage"
import { changelogOnUpdateState } from "~/services/changelogOnUpdateState"
import { migrateAccountsConfig } from "~/services/configMigration/account/accountDataMigration"
import {
  hasNewOptionalPermissions,
  setLastSeenOptionalPermissions,
} from "~/services/permissions/optionalPermissionState"
import {
  hasPermissions,
  OPTIONAL_PERMISSIONS,
} from "~/services/permissions/permissionManager"
import { tagStorage } from "~/services/tags/tagStorage"
import { userPreferences } from "~/services/userPreferences"
import { getManifest, onInstalled, onStartup } from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
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

export default defineBackground(() => {
  logger.debug("Hello background", { id: browser.runtime.id })

  // Apply dev-only branding early so the toolbar action is visually distinguishable.
  void applyDevActionBranding()

  /**
   * 设置各种事件监听器
   */
  setupRuntimeMessageListeners()
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

        if (details.reason === "install" && OPTIONAL_PERMISSIONS.length > 0) {
          logger.info("First install detected, opening permissions onboarding")
          openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, {
            tab: "permissions",
            onboarding: "permissions",
          })
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
            } else {
              logger.info(
                "Update detected with new optional permissions; prompting user to re-confirm",
              )
              openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, {
                tab: "permissions",
                onboarding: "permissions",
                reason: "new-permissions",
              })
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
