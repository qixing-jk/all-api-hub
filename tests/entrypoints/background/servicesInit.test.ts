import { beforeEach, describe, expect, it, vi } from "vitest"

type InitMock = ReturnType<typeof vi.fn>

const {
  usageInitMock,
  webdavInitMock,
  modelSyncInitMock,
  autoCheckinInitMock,
  dailyBalanceInitMock,
  modelMetadataInitMock,
  autoRefreshInitMock,
  redemptionAssistInitMock,
  releaseUpdateInitMock,
  initBackgroundI18nMock,
} = vi.hoisted(() => ({
  usageInitMock: vi.fn(),
  webdavInitMock: vi.fn(),
  modelSyncInitMock: vi.fn(),
  autoCheckinInitMock: vi.fn(),
  dailyBalanceInitMock: vi.fn(),
  modelMetadataInitMock: vi.fn(),
  autoRefreshInitMock: vi.fn(),
  redemptionAssistInitMock: vi.fn(),
  releaseUpdateInitMock: vi.fn(),
  initBackgroundI18nMock: vi.fn(),
}))

vi.mock("~/services/history/usageHistory/scheduler", () => ({
  usageHistoryScheduler: { initialize: usageInitMock },
}))

vi.mock("~/services/webdav/webdavAutoSyncService", () => ({
  webdavAutoSyncService: { initialize: webdavInitMock },
}))

vi.mock("~/services/models/modelSync", () => ({
  modelSyncScheduler: { initialize: modelSyncInitMock },
}))

vi.mock("~/services/checkin/autoCheckin/scheduler", () => ({
  autoCheckinScheduler: { initialize: autoCheckinInitMock },
}))

vi.mock("~/services/history/dailyBalanceHistory/scheduler", () => ({
  dailyBalanceHistoryScheduler: { initialize: dailyBalanceInitMock },
}))

vi.mock("~/services/models/modelMetadata", () => ({
  modelMetadataService: { initialize: modelMetadataInitMock },
}))

vi.mock("~/services/accounts/autoRefreshService", () => ({
  autoRefreshService: { initialize: autoRefreshInitMock },
}))

vi.mock("~/services/redemption/redemptionAssist", () => ({
  redemptionAssistService: { initialize: redemptionAssistInitMock },
}))

vi.mock("~/services/updates/releaseUpdateService", () => ({
  releaseUpdateService: { initialize: releaseUpdateInitMock },
}))

vi.mock("~/utils/i18n/background", () => ({
  initBackgroundI18n: initBackgroundI18nMock,
}))

describe("initializeServices alarm bootstrap ordering", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("starts alarm-based schedulers before awaiting i18n", async () => {
    const { initializeServices } = await import(
      "~/entrypoints/background/servicesInit"
    )

    const alarmInitCalled = {
      usageHistory: false,
      webdav: false,
      modelSync: false,
      autoCheckin: false,
      dailyBalance: false,
      releaseUpdate: false,
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
    const dailyBalanceInit: InitMock = vi.fn(async () => {
      alarmInitCalled.dailyBalance = true
    })
    const releaseUpdateInit: InitMock = vi.fn(async () => {
      alarmInitCalled.releaseUpdate = true
    })

    const modelMetadataInit: InitMock = vi.fn(async () => {})
    const autoRefreshInit: InitMock = vi.fn(async () => {})
    const redemptionAssistInit: InitMock = vi.fn(async () => {})

    usageInitMock.mockImplementation(usageInit)
    webdavInitMock.mockImplementation(webdavInit)
    modelSyncInitMock.mockImplementation(modelSyncInit)
    autoCheckinInitMock.mockImplementation(autoCheckinInit)
    dailyBalanceInitMock.mockImplementation(dailyBalanceInit)
    releaseUpdateInitMock.mockImplementation(releaseUpdateInit)
    modelMetadataInitMock.mockImplementation(modelMetadataInit)
    autoRefreshInitMock.mockImplementation(autoRefreshInit)
    redemptionAssistInitMock.mockImplementation(redemptionAssistInit)

    initBackgroundI18nMock.mockImplementation(() => {
      i18nObservedAllAlarmInits =
        alarmInitCalled.usageHistory &&
        alarmInitCalled.webdav &&
        alarmInitCalled.modelSync &&
        alarmInitCalled.autoCheckin &&
        alarmInitCalled.dailyBalance &&
        alarmInitCalled.releaseUpdate
      return i18nPromise
    })

    const initPromise = initializeServices()

    expect(usageInit).toHaveBeenCalledTimes(1)
    expect(webdavInit).toHaveBeenCalledTimes(1)
    expect(modelSyncInit).toHaveBeenCalledTimes(1)
    expect(autoCheckinInit).toHaveBeenCalledTimes(1)
    expect(dailyBalanceInit).toHaveBeenCalledTimes(1)
    expect(releaseUpdateInit).toHaveBeenCalledTimes(1)
    expect(i18nObservedAllAlarmInits).toBe(true)

    resolveI18n?.()
    await initPromise

    expect(modelMetadataInit).toHaveBeenCalledTimes(1)
    expect(autoRefreshInit).toHaveBeenCalledTimes(1)
    expect(redemptionAssistInit).toHaveBeenCalledTimes(1)
  })

  it("deduplicates concurrent initialization and skips re-initialization after success", async () => {
    const { initializeServices } = await import(
      "~/entrypoints/background/servicesInit"
    )

    let resolveI18n: (() => void) | undefined
    initBackgroundI18nMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveI18n = resolve
        }),
    )

    usageInitMock.mockResolvedValue(undefined)
    webdavInitMock.mockResolvedValue(undefined)
    modelSyncInitMock.mockResolvedValue(undefined)
    autoCheckinInitMock.mockResolvedValue(undefined)
    dailyBalanceInitMock.mockResolvedValue(undefined)
    releaseUpdateInitMock.mockResolvedValue(undefined)
    modelMetadataInitMock.mockResolvedValue(undefined)
    autoRefreshInitMock.mockResolvedValue(undefined)
    redemptionAssistInitMock.mockResolvedValue(undefined)

    const first = initializeServices()
    const second = initializeServices()

    expect(usageInitMock).toHaveBeenCalledTimes(1)
    expect(webdavInitMock).toHaveBeenCalledTimes(1)
    expect(modelSyncInitMock).toHaveBeenCalledTimes(1)
    expect(autoCheckinInitMock).toHaveBeenCalledTimes(1)
    expect(dailyBalanceInitMock).toHaveBeenCalledTimes(1)
    expect(releaseUpdateInitMock).toHaveBeenCalledTimes(1)
    expect(initBackgroundI18nMock).toHaveBeenCalledTimes(1)

    resolveI18n?.()
    await Promise.all([first, second])

    expect(modelMetadataInitMock).toHaveBeenCalledTimes(1)
    expect(autoRefreshInitMock).toHaveBeenCalledTimes(1)
    expect(redemptionAssistInitMock).toHaveBeenCalledTimes(1)

    await initializeServices()

    expect(usageInitMock).toHaveBeenCalledTimes(1)
    expect(webdavInitMock).toHaveBeenCalledTimes(1)
    expect(modelSyncInitMock).toHaveBeenCalledTimes(1)
    expect(autoCheckinInitMock).toHaveBeenCalledTimes(1)
    expect(dailyBalanceInitMock).toHaveBeenCalledTimes(1)
    expect(releaseUpdateInitMock).toHaveBeenCalledTimes(1)
    expect(initBackgroundI18nMock).toHaveBeenCalledTimes(1)
    expect(modelMetadataInitMock).toHaveBeenCalledTimes(1)
    expect(autoRefreshInitMock).toHaveBeenCalledTimes(1)
    expect(redemptionAssistInitMock).toHaveBeenCalledTimes(1)
  })

  it("continues initializing non-alarm services when i18n and an alarm scheduler fail", async () => {
    const { initializeServices } = await import(
      "~/entrypoints/background/servicesInit"
    )

    initBackgroundI18nMock.mockRejectedValueOnce(new Error("i18n failed"))
    usageInitMock.mockResolvedValue(undefined)
    webdavInitMock.mockRejectedValueOnce(new Error("webdav failed"))
    modelSyncInitMock.mockResolvedValue(undefined)
    autoCheckinInitMock.mockResolvedValue(undefined)
    dailyBalanceInitMock.mockResolvedValue(undefined)
    releaseUpdateInitMock.mockResolvedValue(undefined)
    modelMetadataInitMock.mockResolvedValue(undefined)
    autoRefreshInitMock.mockResolvedValue(undefined)
    redemptionAssistInitMock.mockResolvedValue(undefined)

    await expect(initializeServices()).resolves.toBeUndefined()

    expect(usageInitMock).toHaveBeenCalledTimes(1)
    expect(webdavInitMock).toHaveBeenCalledTimes(1)
    expect(modelSyncInitMock).toHaveBeenCalledTimes(1)
    expect(autoCheckinInitMock).toHaveBeenCalledTimes(1)
    expect(dailyBalanceInitMock).toHaveBeenCalledTimes(1)
    expect(releaseUpdateInitMock).toHaveBeenCalledTimes(1)
    expect(initBackgroundI18nMock).toHaveBeenCalledTimes(1)
    expect(modelMetadataInitMock).toHaveBeenCalledTimes(1)
    expect(autoRefreshInitMock).toHaveBeenCalledTimes(1)
    expect(redemptionAssistInitMock).toHaveBeenCalledTimes(1)
  })
})
