import { beforeEach, describe, expect, it, vi } from "vitest"

import { initializeServices } from "~/entrypoints/background/servicesInit"

type InitMock = ReturnType<typeof vi.fn>

const {
  usageInitMock,
  webdavInitMock,
  modelSyncInitMock,
  autoCheckinInitMock,
  modelMetadataInitMock,
  autoRefreshInitMock,
  redemptionAssistInitMock,
  initBackgroundI18nMock,
} = vi.hoisted(() => ({
  usageInitMock: vi.fn(),
  webdavInitMock: vi.fn(),
  modelSyncInitMock: vi.fn(),
  autoCheckinInitMock: vi.fn(),
  modelMetadataInitMock: vi.fn(),
  autoRefreshInitMock: vi.fn(),
  redemptionAssistInitMock: vi.fn(),
  initBackgroundI18nMock: vi.fn(),
}))

vi.mock("~/services/usageHistory/scheduler", () => ({
  usageHistoryScheduler: { initialize: usageInitMock },
}))

vi.mock("~/services/webdav/webdavAutoSyncService", () => ({
  webdavAutoSyncService: { initialize: webdavInitMock },
}))

vi.mock("~/services/modelSync", () => ({
  modelSyncScheduler: { initialize: modelSyncInitMock },
}))

vi.mock("~/services/autoCheckin/scheduler", () => ({
  autoCheckinScheduler: { initialize: autoCheckinInitMock },
}))

vi.mock("~/services/modelMetadata", () => ({
  modelMetadataService: { initialize: modelMetadataInitMock },
}))

vi.mock("~/services/autoRefreshService", () => ({
  autoRefreshService: { initialize: autoRefreshInitMock },
}))

vi.mock("~/services/redemptionAssist", () => ({
  redemptionAssistService: { initialize: redemptionAssistInitMock },
}))

vi.mock("~/utils/background-i18n", () => ({
  initBackgroundI18n: initBackgroundI18nMock,
}))

describe("initializeServices alarm bootstrap ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    usageInitMock.mockImplementation(usageInit)
    webdavInitMock.mockImplementation(webdavInit)
    modelSyncInitMock.mockImplementation(modelSyncInit)
    autoCheckinInitMock.mockImplementation(autoCheckinInit)
    modelMetadataInitMock.mockImplementation(modelMetadataInit)
    autoRefreshInitMock.mockImplementation(autoRefreshInit)
    redemptionAssistInitMock.mockImplementation(redemptionAssistInit)

    initBackgroundI18nMock.mockImplementation(() => {
      i18nObservedAllAlarmInits =
        alarmInitCalled.usageHistory &&
        alarmInitCalled.webdav &&
        alarmInitCalled.modelSync &&
        alarmInitCalled.autoCheckin
      return i18nPromise
    })

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
