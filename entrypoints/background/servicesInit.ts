import { autoCheckinScheduler } from "~/services/autoCheckin/scheduler"
import { autoRefreshService } from "~/services/autoRefreshService"
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
 * - i18n must be ready before downstream services log or emit user-facing messages.
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
    await initBackgroundI18n()
    await modelMetadataService.initialize().catch((error) => {
      logger.warn("Model metadata initialization failed", error)
    })
    await autoRefreshService.initialize()
    await usageHistoryScheduler.initialize()
    await webdavAutoSyncService.initialize()
    await modelSyncScheduler.initialize()
    await autoCheckinScheduler.initialize()
    await redemptionAssistService.initialize()

    servicesInitialized = true
    initializingPromise = null
  })()

  await initializingPromise
}
