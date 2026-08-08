import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  captureNewApiOwnedSession,
  cleanupNewApiOwnedSession,
  getNewApiOwnedSessionStatus,
  refreshNewApiOwnedSession,
  touchNewApiOwnedSession,
} from "~/services/managedSites/newApiOwnedSession/client"
import { NEW_API_OWNED_SESSION_ACTIONS } from "~/services/managedSites/newApiOwnedSession/contracts"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"

const loggerWarnMock = vi.hoisted(() => vi.fn())

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeMessage: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({ warn: loggerWarnMock }),
}))

const bundle = {
  baseUrl: "https://managed.example.invalid",
  sessionId: "owned-session-placeholder",
  accessToken: "owned-token-placeholder",
  accessExpiresAt: 1_900_000_000,
}

describe("New API owned-session client", () => {
  beforeEach(() => {
    vi.mocked(sendRuntimeMessage).mockReset()
    loggerWarnMock.mockReset()
  })

  it("sends each ownership command without transport retries", async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true })

    await captureNewApiOwnedSession(bundle)
    await refreshNewApiOwnedSession(bundle)
    await touchNewApiOwnedSession(bundle.baseUrl, bundle.sessionId)

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(
      1,
      { action: NEW_API_OWNED_SESSION_ACTIONS.Capture, bundle },
      { maxAttempts: 1 },
    )
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(
      2,
      { action: NEW_API_OWNED_SESSION_ACTIONS.Refresh, bundle },
      { maxAttempts: 1 },
    )
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(
      3,
      {
        action: NEW_API_OWNED_SESSION_ACTIONS.Touch,
        baseUrl: bundle.baseUrl,
        sessionId: bundle.sessionId,
      },
      { maxAttempts: 1 },
    )
  })

  it("normalizes ownership status and cleanup responses", async () => {
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({ success: true, owned: true })
      .mockResolvedValueOnce({ success: true, status: "cleaned" })
      .mockResolvedValueOnce({ success: true })

    await expect(getNewApiOwnedSessionStatus(bundle.baseUrl)).resolves.toEqual({
      owned: true,
    })
    await expect(cleanupNewApiOwnedSession(bundle.baseUrl)).resolves.toEqual({
      status: "cleaned",
    })
    await expect(cleanupNewApiOwnedSession(bundle.baseUrl)).resolves.toEqual({
      status: "failed",
    })
  })

  it("returns safe fallbacks for missing and rejected runtime responses", async () => {
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error("worker unavailable"))

    await expect(getNewApiOwnedSessionStatus(bundle.baseUrl)).resolves.toEqual({
      owned: false,
    })
    await expect(cleanupNewApiOwnedSession(bundle.baseUrl)).resolves.toEqual({
      status: "failed",
    })
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "New API owned-session background request failed",
      expect.objectContaining({
        error: expect.objectContaining({ message: "worker unavailable" }),
      }),
    )
  })
})
