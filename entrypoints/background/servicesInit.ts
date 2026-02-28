import { autoRefreshService } from "~/services/accounts/autoRefreshService"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduler"
import { dailyBalanceHistoryScheduler } from "~/services/dailyBalanceHistory/scheduler"
import { modelMetadataService } from "~/services/modelMetadata"
import { modelSyncScheduler } from "~/services/modelSync"
import { redemptionAssistService } from "~/services/redemptionAssist"
import { usageHistoryScheduler } from "~/services/usageHistory/scheduler"
import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { initBackgroundI18n } from "~/utils/background-i18n"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to background service initialization.
 */
const logger = createLogger("BackgroundServicesInit")

let servicesInitialized = false
let initializingPromise: Promise<void> | null = null

/**
 * Initialize all long-lived background services used by the extension.
 *
 * Sequence notes:
 * - Guarded to avoid duplicate initialization; concurrent callers await one promise.
 * - Alarm listeners must be registered before the first await so MV3 service worker wake-up
 *   events (e.g. `chrome.alarms`) are not missed during async initialization.
 * - i18n should still be initialized early so downstream user-facing messages are localized.
 * - Each service handles its own retries; failures are logged but do not block others.
 */
export async function initializeServices() {
  // 若已初始化，跳过
  if (servicesInitialized) {
    logger.debug("各项服务已初始化，跳过")
    return
  }

  // 正在初始化则等待已有 Promise
  if (initializingPromise) {
    logger.debug("各项服务正在初始化，等待中...")
    await initializingPromise
    return
  }

  // 标记为正在初始化（防止并发）
  initializingPromise = (async () => {
    logger.info("初始化服务")

    try {
      // Start alarm-based schedulers first so their listeners are registered synchronously
      // during service worker startup (before any awaited work yields control).
      const alarmSchedulersInit = Promise.allSettled([
        usageHistoryScheduler.initialize(),
        webdavAutoSyncService.initialize(),
        modelSyncScheduler.initialize(),
        autoCheckinScheduler.initialize(),
        dailyBalanceHistoryScheduler.initialize(),
      ])

      await initBackgroundI18n().catch((error) => {
        logger.warn("Background i18n initialization failed", error)
      })

      const alarmResults = await alarmSchedulersInit
      const rejected = alarmResults.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      )
      if (rejected.length > 0) {
        logger.warn("Some alarm-based schedulers failed to initialize", {
          rejectedCount: rejected.length,
        })
      }

      await modelMetadataService.initialize().catch((error) => {
        logger.warn("Model metadata initialization failed", error)
      })

      await autoRefreshService.initialize()
      await redemptionAssistService.initialize()

      servicesInitialized = true
    } finally {
      initializingPromise = null
    }
  })()

  await initializingPromise
}
