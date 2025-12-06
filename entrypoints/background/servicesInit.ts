import { autoCheckinScheduler } from "~/services/autoCheckin/scheduler"
import { autoRefreshService } from "~/services/autoRefreshService"
import { modelMetadataService } from "~/services/modelMetadata"
import { newApiModelSyncScheduler } from "~/services/newApiModelSync"
import { redemptionAssistService } from "~/services/redemptionAssist"
import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { initBackgroundI18n } from "~/utils/background-i18n"

let servicesInitialized = false
let initializingPromise: Promise<void> | null = null

/**
 * Initialize all long-lived background services used by the extension.
 *
 * Sequence notes:
 * - Guarded to avoid duplicate initialization; concurrent callers await one promise.
 * - i18n must be ready before downstream services log or emit user-facing messages.
 */
export async function initializeServices() {
  // 若已初始化，跳过
  if (servicesInitialized) {
    console.log("[Background] 各项服务已初始化，跳过")
    return
  }

  // 正在初始化则等待已有 Promise
  if (initializingPromise) {
    console.log("[Background] 各项服务正在初始化，等待中...")
    await initializingPromise
    return
  }

  // 标记为正在初始化（防止并发）
  initializingPromise = (async () => {
    console.log("[Background] 初始化服务...")
    await initBackgroundI18n()
    await modelMetadataService.initialize().catch((error) => {
      console.warn("[Background] Model metadata initialization failed:", error)
    })
    await autoRefreshService.initialize()
    await webdavAutoSyncService.initialize()
    await newApiModelSyncScheduler.initialize()
    await autoCheckinScheduler.initialize()
    await redemptionAssistService.initialize()

    servicesInitialized = true
    initializingPromise = null
  })()

  await initializingPromise
}
