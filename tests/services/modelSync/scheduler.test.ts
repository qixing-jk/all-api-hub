import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { CLAUDE_CODE_HUB } from "~/constants/siteType"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"
import * as managedSiteUtils from "~/services/managedSites/utils/managedSite"
import {
  handleManagedSiteModelSyncMessage,
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

vi.mock("~/services/preferences/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
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

describe("handleManagedSiteModelSyncMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedBrowserApi.hasAlarmsAPI.mockReturnValue(true)
  })

  it("returns next scheduled time from the alarm", async () => {
    const scheduledTime = Date.now() + 60_000
    mockedBrowserApi.getAlarm.mockResolvedValue({
      name: "managedSiteModelSync",
      scheduledTime,
      periodInMinutes: 1,
    })

    const sendResponse = vi.fn()
    await handleManagedSiteModelSyncMessage(
      { action: RuntimeActionIds.ModelSyncGetNextRun },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        nextScheduledAt: new Date(scheduledTime).toISOString(),
        periodInMinutes: 1,
      },
    })
  })

  it("rejects model sync for Claude Code Hub because the backend does not support it", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: CLAUDE_CODE_HUB,
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

  it("throws the config-missing message when Claude Code Hub admin config is unavailable", async () => {
    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: CLAUDE_CODE_HUB,
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    const getManagedSiteAdminConfigSpy = vi
      .spyOn(managedSiteUtils, "getManagedSiteAdminConfig")
      .mockReturnValue(null)

    await expect(modelSyncScheduler.listChannels()).rejects.toThrow(
      "messages:claudecodehub.configMissing",
    )

    expect(getManagedSiteAdminConfigSpy).toHaveBeenCalled()
    expect(mockedGetManagedSiteServiceForType).not.toHaveBeenCalled()
  })

  it("delegates Claude Code Hub channel listing through the managed-site service", async () => {
    const managedConfig = {
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
      userId: "admin",
    }
    const searchChannel = vi.fn().mockResolvedValue({
      items: [{ id: 42, name: "Claude Provider" }],
      total: 1,
      type_counts: { codex: 1 },
    })

    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: managedConfig.baseUrl,
        adminToken: managedConfig.adminToken,
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    const getManagedSiteAdminConfigSpy = vi
      .spyOn(managedSiteUtils, "getManagedSiteAdminConfig")
      .mockReturnValue(managedConfig)

    mockedGetManagedSiteServiceForType.mockReturnValue({
      searchChannel,
    })

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [{ id: 42, name: "Claude Provider" }],
      total: 1,
      type_counts: { codex: 1 },
    })

    expect(getManagedSiteAdminConfigSpy).toHaveBeenCalled()
    expect(mockedGetManagedSiteServiceForType).toHaveBeenCalledWith(
      CLAUDE_CODE_HUB,
    )
    expect(searchChannel).toHaveBeenCalledWith(
      managedConfig.baseUrl,
      managedConfig.adminToken,
      managedConfig.userId,
      "",
    )
  })

  it("returns the Claude Code Hub empty fallback when the managed-site service has no channel list", async () => {
    const managedConfig = {
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
      userId: "admin",
    }
    const searchChannel = vi.fn().mockResolvedValue(null)

    mockedUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteType: CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: managedConfig.baseUrl,
        adminToken: managedConfig.adminToken,
      },
      managedSiteModelSync: {
        ...(DEFAULT_PREFERENCES as any).managedSiteModelSync,
      },
    })

    vi.spyOn(managedSiteUtils, "getManagedSiteAdminConfig").mockReturnValue(
      managedConfig,
    )

    mockedGetManagedSiteServiceForType.mockReturnValue({
      searchChannel,
    })

    await expect(modelSyncScheduler.listChannels()).resolves.toEqual({
      items: [],
      total: 0,
      type_counts: {},
    })

    expect(searchChannel).toHaveBeenCalledWith(
      managedConfig.baseUrl,
      managedConfig.adminToken,
      managedConfig.userId,
      "",
    )
  })
})
