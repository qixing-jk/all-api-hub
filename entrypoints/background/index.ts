import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { setupRuntimeMessageListeners } from "~/entrypoints/background/runtimeMessages"
import { setupTempWindowListeners } from "~/entrypoints/background/tempWindowPool"
import { accountStorage } from "~/services/accountStorage"
import { tagStorage } from "~/services/accountTags/tagStorage"
import { migrateAccountsConfig } from "~/services/configMigration/account/accountDataMigration"
import {
  hasNewOptionalPermissions,
  setLastSeenOptionalPermissions,
} from "~/services/permissions/optionalPermissionState"
import {
  hasPermissions,
  OPTIONAL_PERMISSIONS,
} from "~/services/permissions/permissionManager"
import { userPreferences } from "~/services/userPreferences"
import { createTab, getManifest, onInstalled } from "~/utils/browserApi"
import { getDocsChangelogUrl } from "~/utils/docsLinks"
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
  onInstalled((details) => {
    logger.info("插件安装/更新，初始化自动刷新服务和 WebDAV 自动同步服务")

    void (async () => {
      await initializeServices()

      if (details.reason === "install" || details.reason === "update") {
        logger.info("Triggering config migration", { reason: details.reason })

        // Migrate user preferences
        // Keep the hydrated snapshot so we can reuse it later in the update flow
        // without performing another storage read.
        const prefs = await userPreferences.getPreferences()
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

        if (
          details.reason === "update" &&
          (prefs.openChangelogOnUpdate ?? true)
        ) {
          const { version } = getManifest()
          const changelogUrl = getDocsChangelogUrl(version)
          await createTab(changelogUrl, true)
        }
      }
    })()
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
