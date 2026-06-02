import { beforeEach, describe, expect, it, vi } from "vitest"

type RuntimeMessageHandler = (input?: { data?: unknown }) => Promise<unknown>
type OnMessageMock = ReturnType<
  typeof vi.fn<(type: string, handler: RuntimeMessageHandler) => () => void>
>

describe("typed runtime messaging setup", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("registers model sync typed listeners once and wraps handler errors", async () => {
    const onModelSyncMessage: OnMessageMock = vi.fn(() => vi.fn())
    const getPreferences = vi.fn().mockRejectedValue(new Error("boom"))

    vi.doMock("~/services/models/modelSync/messaging", () => ({
      onModelSyncMessage,
    }))
    vi.doMock("~/services/models/modelSync/storage", () => ({
      managedSiteModelSyncStorage: {
        getChannelUpstreamModelOptions: vi.fn(),
        getLastExecution: vi.fn(),
        getPreferences,
        saveChannelUpstreamModelOptions: vi.fn(),
        saveLastExecution: vi.fn(),
      },
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { managedSiteModelSync: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        clearAlarm: vi.fn(),
        createAlarm: vi.fn(),
        getAlarm: vi.fn(),
        hasAlarmsAPI: vi.fn(),
        onAlarm: vi.fn(),
      }
    })

    const scheduler = await import("~/services/models/modelSync/scheduler")

    scheduler.setupManagedSiteModelSyncMessagingListeners()
    scheduler.setupManagedSiteModelSyncMessagingListeners()

    expect(onModelSyncMessage).toHaveBeenCalledTimes(10)
    const getPreferencesHandler = onModelSyncMessage.mock.calls.find(
      ([type]) => type === "modelSync:getPreferences",
    )?.[1]
    expect(getPreferencesHandler).toBeTypeOf("function")
    await expect(getPreferencesHandler!()).resolves.toEqual({
      success: false,
      error: "boom",
    })
  })

  it("registers account key repair typed listeners once and wraps handler errors", async () => {
    const onAccountKeyRepairMessage: OnMessageMock = vi.fn(() => vi.fn())
    const storageGet = vi.fn().mockRejectedValue(new Error("repair failed"))

    vi.doMock(
      "~/services/accounts/accountKeyAutoProvisioning/messaging",
      () => ({
        AccountKeyRepairMessageTypes: {
          Start: "accountKeyRepair:start",
          GetProgress: "accountKeyRepair:getProgress",
        },
        onAccountKeyRepairMessage,
      }),
    )
    vi.doMock("@plasmohq/storage", () => ({
      Storage: class {
        get = storageGet
        set = vi.fn()
      },
    }))

    const repair = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    repair.setupAccountKeyRepairMessagingListeners()
    repair.setupAccountKeyRepairMessagingListeners()

    expect(onAccountKeyRepairMessage).toHaveBeenCalledTimes(2)
    const getProgressHandler = onAccountKeyRepairMessage.mock.calls.find(
      ([type]) => type === "accountKeyRepair:getProgress",
    )?.[1]
    expect(getProgressHandler).toBeTypeOf("function")
    await expect(getProgressHandler!()).resolves.toEqual({
      success: false,
      error: "repair failed",
    })
  })

  it("registers auto check-in typed listeners once and wraps handler errors", async () => {
    const onAutoCheckinMessage: OnMessageMock = vi.fn(() => vi.fn())
    const getStatus = vi.fn().mockRejectedValue(new Error("check-in failed"))

    vi.doMock("~/services/checkin/autoCheckin/messaging", () => ({
      onAutoCheckinMessage,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { autoCheckin: {} },
      userPreferences: { getPreferences: vi.fn(), savePreferences: vi.fn() },
    }))
    vi.doMock("~/services/checkin/autoCheckin/storage", () => ({
      AUTO_CHECKIN_STATUS_STORAGE_LOCK: "all-api-hub:auto-checkin-status",
      autoCheckinStorage: {
        getStatus,
        saveStatus: vi.fn(),
      },
    }))

    const scheduler = await import("~/services/checkin/autoCheckin/scheduler")

    scheduler.setupAutoCheckinMessagingListeners()
    scheduler.setupAutoCheckinMessagingListeners()

    expect(onAutoCheckinMessage).toHaveBeenCalledTimes(10)
    const getStatusHandler = onAutoCheckinMessage.mock.calls.find(
      ([type]) => type === "autoCheckin:getStatus",
    )?.[1]
    expect(getStatusHandler).toBeTypeOf("function")
    await expect(getStatusHandler!()).resolves.toEqual({
      success: false,
      error: "check-in failed",
    })
  })
})
