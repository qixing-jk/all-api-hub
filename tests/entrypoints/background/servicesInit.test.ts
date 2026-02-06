import { beforeEach, describe, expect, it, vi } from "vitest"

type InitMock = ReturnType<typeof vi.fn>

describe("initializeServices alarm bootstrap ordering", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("starts alarm-based schedulers before awaiting i18n", async () => {
    const alarmInitCalled = {
      usageHistory: false,
      webdav: false,
      modelSync: false,
      autoCheckin: false,
    }

    let i18nObservedAllAlarmInits = false
    let resolveI18n: (() => void) | undefined
    const i18nPromise = new Promise<void>((resolve) => {
      resolveI18n = () => resolve()
    })

    const usageInit: InitMock = vi.fn(async () => {
      alarmInitCalled.usageHistory = true
    })
    const webdavInit: InitMock = vi.fn(async () => {
      alarmInitCalled.webdav = true
    })
    const modelSyncInit: InitMock = vi.fn(async () => {
      alarmInitCalled.modelSync = true
    })
    const autoCheckinInit: InitMock = vi.fn(async () => {
      alarmInitCalled.autoCheckin = true
    })

    const modelMetadataInit: InitMock = vi.fn(async () => {})
    const autoRefreshInit: InitMock = vi.fn(async () => {})
    const redemptionAssistInit: InitMock = vi.fn(async () => {})

    vi.doMock("~/services/usageHistory/scheduler", () => ({
      usageHistoryScheduler: { initialize: usageInit },
    }))
    vi.doMock("~/services/webdav/webdavAutoSyncService", () => ({
      webdavAutoSyncService: { initialize: webdavInit },
    }))
    vi.doMock("~/services/modelSync", () => ({
      modelSyncScheduler: { initialize: modelSyncInit },
    }))
    vi.doMock("~/services/autoCheckin/scheduler", () => ({
      autoCheckinScheduler: { initialize: autoCheckinInit },
    }))
    vi.doMock("~/services/modelMetadata", () => ({
      modelMetadataService: { initialize: modelMetadataInit },
    }))
    vi.doMock("~/services/autoRefreshService", () => ({
      autoRefreshService: { initialize: autoRefreshInit },
    }))
    vi.doMock("~/services/redemptionAssist", () => ({
      redemptionAssistService: { initialize: redemptionAssistInit },
    }))
    vi.doMock("~/utils/background-i18n", () => ({
      initBackgroundI18n: vi.fn(() => {
        i18nObservedAllAlarmInits =
          alarmInitCalled.usageHistory &&
          alarmInitCalled.webdav &&
          alarmInitCalled.modelSync &&
          alarmInitCalled.autoCheckin
        return i18nPromise
      }),
    }))

    const { initializeServices } = await import(
      "~/entrypoints/background/servicesInit"
    )

    const initPromise = initializeServices()

    expect(usageInit).toHaveBeenCalledTimes(1)
    expect(webdavInit).toHaveBeenCalledTimes(1)
    expect(modelSyncInit).toHaveBeenCalledTimes(1)
    expect(autoCheckinInit).toHaveBeenCalledTimes(1)
    expect(i18nObservedAllAlarmInits).toBe(true)

    resolveI18n?.()
    await initPromise

    expect(modelMetadataInit).toHaveBeenCalledTimes(1)
    expect(autoRefreshInit).toHaveBeenCalledTimes(1)
    expect(redemptionAssistInit).toHaveBeenCalledTimes(1)
  })
})
