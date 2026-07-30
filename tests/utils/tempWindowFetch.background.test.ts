import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import * as tempWindowFetchClient from "~/utils/browser/tempWindowFetch"
import {
  tempWindowFetch,
  tempWindowGetRenderedTitle,
  tempWindowTriggerCheckinPageAction,
  tempWindowTurnstileFetch,
} from "~/utils/browser/tempWindowFetch"

const { executeProtectionBypassTaskMock, sendRuntimeMessageMock } = vi.hoisted(
  () => ({
    executeProtectionBypassTaskMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }),
)

const testExecution = {
  version: 2,
  kind: "automatic",
  feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
  surface: PROTECTION_BYPASS_SURFACES.Background,
} as const

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionBackground: () => true,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/entrypoints/background/protectionBypassCoordinator", () => ({
  protectionBypassCoordinator: {
    execute: executeProtectionBypassTaskMock,
  },
}))

describe("tempWindowFetch helpers (background context)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps provider-specific OpenRouter transport out of the generic facade", () => {
    expect(tempWindowFetchClient).not.toHaveProperty(
      "tempWindowOpenRouterManagementKeyAction",
    )
    expect(tempWindowFetchClient).not.toHaveProperty(
      "cancelTempWindowOpenRouterManagementKeyAction",
    )

    const genericTypeSource = readFileSync(
      new URL("../../src/types/tempWindowFetch.ts", import.meta.url),
      "utf8",
    )
    const genericClientSource = readFileSync(
      new URL("../../src/utils/browser/tempWindowFetch.ts", import.meta.url),
      "utf8",
    )
    expect(genericTypeSource).not.toMatch(/OpenRouterManagementKey/)
    expect(genericClientSource).not.toMatch(/OpenRouterManagementKey/)
  })

  it("passes the exact fetch envelope to the background Coordinator", async () => {
    const coordinatorResponse = { success: true, data: "fetch-result" }
    executeProtectionBypassTaskMock.mockResolvedValueOnce(coordinatorResponse)

    const response = await tempWindowFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.invalid",
      fetchUrl: "https://example.invalid/api/test",
      fetchOptions: { method: "GET" },
    })

    expect(executeProtectionBypassTaskMock).toHaveBeenCalledOnce()
    expect(executeProtectionBypassTaskMock).toHaveBeenCalledWith({
      execution: testExecution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
        params: {
          originUrl: "https://example.invalid",
          fetchUrl: "https://example.invalid/api/test",
          fetchOptions: { method: "GET" },
        },
      },
    })
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(response).toBe(coordinatorResponse)
  })

  it("passes the profile-isolated task kind through the same Coordinator API", async () => {
    const coordinatorResponse = { success: true, data: "isolated-result" }
    executeProtectionBypassTaskMock.mockResolvedValueOnce(coordinatorResponse)

    const response = await tempWindowFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.invalid",
      fetchUrl: "https://example.invalid/api/test",
      tempContextTaskKind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
    })

    expect(executeProtectionBypassTaskMock).toHaveBeenCalledWith({
      execution: testExecution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
        params: {
          originUrl: "https://example.invalid",
          fetchUrl: "https://example.invalid/api/test",
          tempContextTaskKind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
        },
      },
    })
    expect(response).toBe(coordinatorResponse)
  })

  it("passes the exact Turnstile envelope to the background Coordinator", async () => {
    const coordinatorResponse = {
      success: true,
      data: "turnstile-result",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    }
    executeProtectionBypassTaskMock.mockResolvedValueOnce(coordinatorResponse)

    const response = await tempWindowTurnstileFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/checkin",
      fetchUrl: "https://example.invalid/api/checkin",
      fetchOptions: { method: "POST" },
    })

    expect(executeProtectionBypassTaskMock).toHaveBeenCalledWith({
      execution: testExecution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
        params: {
          originUrl: "https://example.invalid",
          pageUrl: "https://example.invalid/checkin",
          fetchUrl: "https://example.invalid/api/checkin",
          fetchOptions: { method: "POST" },
        },
      },
    })
    expect(response).toBe(coordinatorResponse)
  })

  it("passes the exact native page-action envelope to the background Coordinator", async () => {
    const coordinatorResponse = {
      success: true,
      reason: "clicked",
      identity: { userId: "example-user", user: { id: "example-user" } },
    }
    executeProtectionBypassTaskMock.mockResolvedValueOnce(coordinatorResponse)

    const response = await tempWindowTriggerCheckinPageAction({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "example-user",
      requestId: "request-native-action",
    })

    expect(executeProtectionBypassTaskMock).toHaveBeenCalledWith({
      execution: testExecution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction,
        params: {
          originUrl: "https://example.invalid",
          pageUrl: "https://example.invalid/console/personal",
          siteType: "new-api",
          expectedUserId: "example-user",
          requestId: "request-native-action",
        },
      },
    })
    expect(response).toBe(coordinatorResponse)
  })

  it("passes the exact rendered-title envelope and validates its response", async () => {
    const coordinatorResponse = { success: true, title: "Example title" }
    executeProtectionBypassTaskMock.mockResolvedValueOnce(coordinatorResponse)

    const response = await tempWindowGetRenderedTitle({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.invalid",
      requestId: "request-rendered-title",
    })

    expect(executeProtectionBypassTaskMock).toHaveBeenCalledWith({
      execution: testExecution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
        params: {
          originUrl: "https://example.invalid",
          requestId: "request-rendered-title",
        },
      },
    })
    expect(response).toBe(coordinatorResponse)
  })

  it("returns an explicit error for a malformed Coordinator title response", async () => {
    executeProtectionBypassTaskMock.mockResolvedValueOnce({
      success: true,
      title: 123,
    })

    await expect(
      tempWindowGetRenderedTitle({
        protectionBypassExecution: testExecution,
        originUrl: "https://example.invalid",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid tempWindowGetRenderedTitle response",
    })
  })
})
