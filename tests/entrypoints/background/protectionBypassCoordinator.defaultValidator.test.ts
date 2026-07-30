import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createProtectionBypassCoordinator,
  getProtectionBypassDecisionErrorCode,
} from "~/entrypoints/background/protectionBypassCoordinator"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const { getPreferencesStrict, searchChannel } = vi.hoisted(() => ({
  getPreferencesStrict: vi.fn(),
  searchChannel: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferencesStrict,
    },
  }
})

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: vi.fn(() => ({ searchChannel })),
}))

const allowedPolicy = {
  automaticMasterEnabled: true,
  automaticAccountRefreshEnabled: true,
  manualAccountRefreshEnabled: true,
  allowedSurfaces: {
    popup: true,
    options: true,
    sidepanel: true,
    content_script: true,
    background: true,
  },
  preferredMode: "tab" as const,
}

const resource = {
  origin: "https://example.invalid",
  userId: "1",
  channelId: 12,
}

async function executeDefaultResourceValidation(
  resourceOverride: Partial<typeof resource> = {},
) {
  const coordinator = createProtectionBypassCoordinator({
    readPolicy: vi.fn().mockResolvedValue(allowedPolicy),
    resolveCapability: vi.fn().mockResolvedValue({
      kind: "available",
      adapter: "tab",
    }),
    executeAuthorizedTask: vi.fn(
      async (_task, _source, authorizeAtAcquire, sendResponse) => {
        const decision = await authorizeAtAcquire()
        sendResponse(
          decision.kind === "allowed"
            ? { success: true }
            : {
                success: false,
                code: getProtectionBypassDecisionErrorCode(decision),
              },
        )
      },
    ),
  })
  const exactResource = { ...resource, ...resourceOverride }
  const execution = userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.VerifyProtection,
  )
  const response = vi.fn()

  response(
    await coordinator.execute({
      task: {
        kind: "new_api_session_read",
        params: {
          ...exactResource,
          action: "channel_key",
        },
      },
      execution,
    }),
  )

  return response
}

describe("default New API session-read resource validator", () => {
  beforeEach(() => {
    getPreferencesStrict.mockReset()
    searchChannel.mockReset()
    getPreferencesStrict.mockResolvedValue({
      newApi: {
        baseUrl: "https://example.invalid/admin/",
        adminToken: "placeholder-token",
        userId: " 1 ",
      },
    })
    searchChannel.mockResolvedValue({
      items: [{ id: resource.channelId }],
    })
  })

  it("strictly reloads preferences and accepts canonical origin, trimmed user ID, and exact channel", async () => {
    const response = await executeDefaultResourceValidation()

    expect(getPreferencesStrict).toHaveBeenCalledTimes(1)
    expect(searchChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.invalid/admin/",
        userId: " 1 ",
      }),
      "12",
    )
    expect(response).toHaveBeenCalledWith({ success: true })
  })

  it.each([
    ["origin", { origin: "https://other.example.invalid" }],
    ["user ID", { userId: "2" }],
  ] as const)(
    "fails closed on a current-config %s mismatch",
    async (_, patch) => {
      const response = await executeDefaultResourceValidation(patch)

      expect(searchChannel).not.toHaveBeenCalled()
      expect(response).toHaveBeenCalledWith({
        success: false,
        code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
      })
    },
  )

  it("fails closed when exact channel search does not return the requested ID", async () => {
    searchChannel.mockResolvedValue({ items: [{ id: 112 }] })

    const response = await executeDefaultResourceValidation()

    expect(searchChannel).toHaveBeenCalledWith(expect.anything(), "12")
    expect(response).toHaveBeenCalledWith({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
  })

  it.each([
    ["strict preference read", getPreferencesStrict],
    ["channel search", searchChannel],
  ] as const)("fails closed when %s throws", async (_, failingOperation) => {
    failingOperation.mockRejectedValueOnce(
      new Error("storage or adapter failed"),
    )

    const response = await executeDefaultResourceValidation()

    expect(response).toHaveBeenCalledWith({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
  })
})
