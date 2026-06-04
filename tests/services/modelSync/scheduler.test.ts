import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import { ModelSyncService } from "~/services/models/modelSync/modelSyncService"
import {
  getModelSyncNextRun,
  modelSyncScheduler,
} from "~/services/models/modelSync/scheduler"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
} from "~/utils/browser/browserApi"

const { modelSyncListChannelsMock, modelSyncServiceConstructorMock } =
  vi.hoisted(() => ({
    modelSyncListChannelsMock: vi.fn(),
    modelSyncServiceConstructorMock: vi.fn(),
  }))

vi.mock("~/services/preferences/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
    managedSiteType: "new-api",
    newApi: {
      baseUrl: "",
      adminToken: "",
      userId: "",
    },
    managedSiteModelSync: {
      enabled: true,
      interval: 60_000,
      concurrency: 1,
      maxRetries: 1,
      rateLimit: { requestsPerMinute: 10, burst: 2 },
      allowedModels: [],
      globalChannelModelFilters: [],
    },
  },
  userPreferences: {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
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

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: vi.fn(),
}))

vi.mock("~/services/models/modelSync/modelSyncService", () => ({
  ModelSyncService: vi.fn(function (this: unknown, ...args: unknown[]) {
    modelSyncServiceConstructorMock(...args)
    return {
      listChannels: modelSyncListChannelsMock,
    }
  }),
}))

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  channelConfigStorage: {
    getAllConfigs: vi.fn().mockResolvedValue({}),
  },
}))

const mockedUserPreferences = userPreferences as unknown as {
  getPreferences: ReturnType<typeof vi.fn>
}

const mockedBrowserApi = {
  clearAlarm: clearAlarm as unknown as ReturnType<typeof vi.fn>,
  createAlarm: createAlarm as unknown as ReturnType<typeof vi.fn>,
  getAlarm: getAlarm as unknown as ReturnType<typeof vi.fn>,
  hasAlarmsAPI: hasAlarmsAPI as unknown as ReturnType<typeof vi.fn>,
}

const mockedGetManagedSiteServiceForType =
  getManagedSiteServiceForType as unknown as ReturnType<typeof vi.fn>

const mockedModelSyncService = ModelSyncService as unknown as ReturnType<
  typeof vi.fn
>

describe("modelSyncScheduler.setupAlarm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    mockedBrowserApi.getAlarm.mockResolvedValue(undefined)
    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
        enabled: true,
      },
    })
  })

  it("clears and recreates the canonical alarm when enabled and missing", async () => {
    mockedBrowserApi.getAlarm
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        name: "managedSiteModelSync",
        scheduledTime: Date.now() + 60_000,
        periodInMinutes: 1,
      })

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith(
      "managedSiteModelSync",
    )
    expect(mockedBrowserApi.createAlarm).toHaveBeenCalled()
  })

  it("preserves an existing alarm when the interval matches", async () => {
    mockedBrowserApi.getAlarm.mockResolvedValue({
      name: "managedSiteModelSync",
      scheduledTime: Date.now() + 60_000,
      periodInMinutes: 1,
    })

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).not.toHaveBeenCalled()
    expect(mockedBrowserApi.createAlarm).not.toHaveBeenCalled()
  })

  it("recreates the alarm when the interval changes", async () => {
    mockedBrowserApi.getAlarm
      .mockResolvedValueOnce({
        name: "managedSiteModelSync",
        scheduledTime: Date.now() + 60_000,
        periodInMinutes: 2,
      })
      .mockResolvedValueOnce({
        name: "managedSiteModelSync",
        scheduledTime: Date.now() + 60_000,
        periodInMinutes: 1,
      })

    await modelSyncScheduler.setupAlarm()

    expect(mockedBrowserApi.clearAlarm).toHaveBeenCalledWith(
      "managedSiteModelSync",
    )
    expect(mockedBrowserApi.createAlarm).toHaveBeenCalled()
  })
})

describe("model sync operation helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
    modelSyncListChannelsMock.mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })
  })

  it("returns next scheduled time from the alarm", async () => {
    const scheduledTime = Date.now() + 60_000
    mockedBrowserApi.getAlarm.mockResolvedValue({
      name: "managedSiteModelSync",
      scheduledTime,
      periodInMinutes: 1,
    })

    await expect(getModelSyncNextRun()).resolves.toEqual({
      success: true,
      data: {
        nextScheduledAt: new Date(scheduledTime).toISOString(),
        periodInMinutes: 1,
      },
    })
  })

  it("rejects model sync for Claude Code Hub because the backend does not support it", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    await expect(modelSyncScheduler.executeSync()).rejects.toThrow(
      "messages:claudecodehub.unsupportedModelSync",
    )
  })

  it("rejects model sync for AxonHub because model fetch and writeback are not supported", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.AXON_HUB,
      axonHub: {
        baseUrl: "https://axon.example.com",
        email: "admin@example.com",
        password: "admin-password",
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    await expect(modelSyncScheduler.executeSync()).rejects.toThrow(
      "messages:axonhub.unsupportedModelSync",
    )
    expect(mockedModelSyncService).not.toHaveBeenCalled()
  })

  it("throws the config-missing message when Claude Code Hub admin config is unavailable", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    await expect(modelSyncScheduler.listChannels()).rejects.toThrow(
      "messages:claudecodehub.configMissing",
    )

    expect(mockedGetManagedSiteServiceForType).not.toHaveBeenCalled()
  })

  it("delegates Claude Code Hub channel listing through the managed-site service", async () => {
    const managedConfig = {
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
    }
    const searchChannel = vi.fn().mockResolvedValue({
      items: [{ id: 42, name: "Claude Provider" }],
      total: 1,
      type_counts: { codex: 1 },
    })

    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: managedConfig.baseUrl,
        adminToken: managedConfig.adminToken,
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    mockedGetManagedSiteServiceForType.mockReturnValue({
      searchChannel,
    })

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [{ id: 42, name: "Claude Provider" }],
      total: 1,
      type_counts: { codex: 1 },
    })

    expect(mockedGetManagedSiteServiceForType).toHaveBeenCalledWith(
      SITE_TYPES.CLAUDE_CODE_HUB,
    )
    expect(searchChannel).toHaveBeenCalledWith(managedConfig, "")
  })

  it("returns the Claude Code Hub empty fallback when the managed-site service has no channel list", async () => {
    const managedConfig = {
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
    }
    const searchChannel = vi.fn().mockResolvedValue(null)

    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: managedConfig.baseUrl,
        adminToken: managedConfig.adminToken,
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    mockedGetManagedSiteServiceForType.mockReturnValue({
      searchChannel,
    })

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [],
      total: 0,
      type_counts: {},
    })

    expect(searchChannel).toHaveBeenCalledWith(managedConfig, "")
  })

  it("constructs model sync with the current runtime config object", async () => {
    const managedConfig = {
      baseUrl: "https://new-api.example.com",
      adminToken: "admin-token",
      userId: "42",
    }
    mockedUserPreferences.getPreferences.mockResolvedValue({
      managedSiteType: SITE_TYPES.NEW_API,
      newApi: managedConfig,
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    await modelSyncScheduler.listChannels()

    expect(mockedModelSyncService).toHaveBeenCalledTimes(1)
    expect(modelSyncServiceConstructorMock).toHaveBeenCalledWith(
      {
        siteType: SITE_TYPES.NEW_API,
        config: managedConfig,
      },
      expect.anything(),
      expect.any(Array),
      {},
      [],
    )
    expect(modelSyncListChannelsMock).toHaveBeenCalled()
  })
})
