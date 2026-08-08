import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchApiResponse } from "~/services/apiTransport/request"
import {
  handleNewApiOwnedSessionRequest,
  newApiOwnedSessionLifecycle,
  revokeNewApiOwnedSession,
} from "~/services/managedSites/newApiOwnedSession/background"
import { NEW_API_OWNED_SESSION_ACTIONS } from "~/services/managedSites/newApiOwnedSession/contracts"
import type { NewApiOwnedSessionReceipt } from "~/services/managedSites/newApiOwnedSession/lifecycle"
import { AuthTypeEnum } from "~/types"

const mocks = vi.hoisted(() => ({
  alarmListener: undefined as
    | ((alarm: { name: string }) => void | Promise<void>)
    | undefined,
  clearAlarm: vi.fn(async () => true),
  createAlarm: vi.fn(async () => {}),
  getSessionStorageValues: vi.fn(async () => ({})),
  hasSessionStorageArea: vi.fn(() => false),
  loggerWarn: vi.fn(),
  setSessionStorageValues: vi.fn(async () => false),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiResponse: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  clearAlarm: mocks.clearAlarm,
  createAlarm: mocks.createAlarm,
  getSessionStorageValues: mocks.getSessionStorageValues,
  hasSessionStorageArea: mocks.hasSessionStorageArea,
  onAlarm: vi.fn(
    (listener: (alarm: { name: string }) => void | Promise<void>) => {
      mocks.alarmListener = listener
      return () => {}
    },
  ),
  setSessionStorageValues: mocks.setSessionStorageValues,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({ warn: mocks.loggerWarn }),
}))

const receipt: NewApiOwnedSessionReceipt = {
  version: 1,
  origin: "https://managed.example",
  sessionId: "owned/session-placeholder",
  accessToken: "owned-token-placeholder",
  accessExpiresAt: 1_900_000_000,
  lastUsedAt: 1_800_000_000_000,
  cleanupAt: 1_800_000_600_000,
}

describe("revokeNewApiOwnedSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasSessionStorageArea.mockReturnValue(false)
    mocks.getSessionStorageValues.mockResolvedValue({})
    mocks.setSessionStorageValues.mockResolvedValue(false)
    mocks.clearAlarm.mockResolvedValue(true)
    mocks.createAlarm.mockResolvedValue(undefined)
  })

  it("deletes only the captured SID without broad session revocation", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {},
      body: "",
    })

    await expect(revokeNewApiOwnedSession(receipt)).resolves.toEqual({
      status: "cleaned",
    })
    expect(fetchApiResponse).toHaveBeenCalledWith(
      {
        baseUrl: receipt.origin,
        accountId: `managed-site:new-api-owned-session:${receipt.origin}`,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: receipt.accessToken,
        },
      },
      expect.objectContaining({
        endpoint: "/api/user/sessions/owned%2Fsession-placeholder",
        options: { method: "DELETE" },
      }),
    )
    expect(
      JSON.stringify(vi.mocked(fetchApiResponse).mock.calls),
    ).not.toContain("revoke-others")
  })

  it.each([
    [404, "cleaned"],
    [401, "unavailable"],
    [500, "retry"],
  ] as const)("maps HTTP %s to %s", async (status, expected) => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ok: false,
      status,
      headers: {},
      body: "",
    })

    await expect(revokeNewApiOwnedSession(receipt)).resolves.toEqual({
      status: expected,
    })
  })

  it("maps a transport failure to a bounded retry", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(new Error("network failed"))

    await expect(revokeNewApiOwnedSession(receipt)).resolves.toEqual({
      status: "retry",
    })
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Exact New API owned-session cleanup failed",
      expect.objectContaining({ status: "transport-error" }),
    )
  })
})

describe("New API owned-session background commands", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasSessionStorageArea.mockReturnValue(false)
    mocks.getSessionStorageValues.mockResolvedValue({})
    mocks.setSessionStorageValues.mockResolvedValue(false)
    mocks.clearAlarm.mockResolvedValue(true)
    mocks.createAlarm.mockResolvedValue(undefined)
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {},
      body: "",
    })
  })

  it("routes every validated ownership command through the lifecycle", async () => {
    const baseUrl = "https://commands.example.invalid"
    const bundle = {
      baseUrl,
      sessionId: "owned-command-session",
      accessToken: "owned-command-token",
      accessExpiresAt: Math.floor((Date.now() + 15 * 60_000) / 1000),
    }

    await expect(
      handleNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Capture,
        bundle,
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      handleNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Refresh,
        bundle: { ...bundle, accessToken: "rotated-command-token" },
      }),
    ).resolves.toEqual({ success: true, owned: true })
    await expect(
      handleNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Touch,
        baseUrl,
        sessionId: bundle.sessionId,
      }),
    ).resolves.toEqual({ success: true, owned: true })
    await expect(
      handleNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.GetStatus,
        baseUrl,
      }),
    ).resolves.toEqual({ success: true, owned: true })
    await expect(
      handleNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.Cleanup,
        baseUrl,
      }),
    ).resolves.toEqual({ success: true, status: "cleaned" })

    expect(mocks.setSessionStorageValues).toHaveBeenCalled()
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it("reads an owned receipt from storage.session when available", async () => {
    const origin = "https://stored.example.invalid"
    const storedReceipt = {
      ...receipt,
      origin,
      sessionId: "stored-owned-session",
    }
    mocks.hasSessionStorageArea.mockReturnValue(true)
    mocks.getSessionStorageValues.mockResolvedValue({
      new_api_owned_session_receipts_v1: {
        version: 1,
        receipts: {
          [`${origin}\nstored-owned-session`]: storedReceipt,
        },
      },
    })

    await expect(
      handleNewApiOwnedSessionRequest({
        action: NEW_API_OWNED_SESSION_ACTIONS.GetStatus,
        baseUrl: origin,
      }),
    ).resolves.toEqual({ success: true, owned: true })
    expect(mocks.getSessionStorageValues).toHaveBeenCalledWith(
      "new_api_owned_session_receipts_v1",
    )
  })

  it("reports alarm reconciliation failures without leaking the rejection", async () => {
    mocks.hasSessionStorageArea.mockReturnValue(true)
    mocks.getSessionStorageValues.mockResolvedValue({})
    await newApiOwnedSessionLifecycle.initialize()
    mocks.getSessionStorageValues.mockRejectedValue(
      new Error("session storage unavailable"),
    )

    mocks.alarmListener?.({ name: "new-api-owned-session-cleanup" })
    await vi.waitFor(() => {
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        "New API owned-session alarm cleanup failed",
        expect.objectContaining({
          error: expect.objectContaining({
            message: "session storage unavailable",
          }),
        }),
      )
    })
  })
})
