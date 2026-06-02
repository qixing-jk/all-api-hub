import { describe, expect, it, vi } from "vitest"

const { sendReleaseUpdateMessageMock } = vi.hoisted(() => ({
  sendReleaseUpdateMessageMock: vi.fn(),
}))

vi.mock("~/services/updates/messaging", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/updates/messaging")>()
  return {
    ...actual,
    sendReleaseUpdateMessage: sendReleaseUpdateMessageMock,
  }
})

vi.mock("~/utils/browser/browserApi", () => ({
  isMessageReceiverUnavailableError: (error: unknown) =>
    error instanceof Error &&
    error.message.includes("Receiving end does not exist"),
}))

describe("release update runtime client", () => {
  it("returns a parsed success response when the background request succeeds", async () => {
    sendReleaseUpdateMessageMock.mockResolvedValueOnce({
      success: true,
      data: {
        eligible: true,
        reason: "chromium-development",
        currentVersion: "3.31.0",
        latestVersion: "3.32.0",
        updateAvailable: true,
        releaseUrl:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.32.0",
        checkedAt: 1,
        lastError: null,
      },
    })

    const { requestReleaseUpdateStatus } = await import(
      "~/services/updates/runtime"
    )

    await expect(requestReleaseUpdateStatus()).resolves.toEqual({
      success: true,
      data: {
        eligible: true,
        reason: "chromium-development",
        currentVersion: "3.31.0",
        latestVersion: "3.32.0",
        updateAvailable: true,
        releaseUrl:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.32.0",
        checkedAt: 1,
        lastError: null,
      },
    })
    expect(sendReleaseUpdateMessageMock).toHaveBeenCalledWith(
      "releaseUpdate:getStatus",
    )
  })

  it("returns a failure response when the background request throws", async () => {
    sendReleaseUpdateMessageMock.mockRejectedValueOnce(
      new Error("No listeners available"),
    )

    const { requestReleaseUpdateStatus } = await import(
      "~/services/updates/runtime"
    )

    await expect(requestReleaseUpdateStatus()).resolves.toEqual({
      success: false,
      error: "No listeners available",
    })
  })

  it("retries transient receiver-missing failures before returning success", async () => {
    sendReleaseUpdateMessageMock
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockResolvedValueOnce({
        success: false,
        error: "Invalid response from background.",
      })

    const { requestReleaseUpdateCheckNow } = await import(
      "~/services/updates/runtime"
    )

    await expect(
      requestReleaseUpdateCheckNow({ maxAttempts: 2, delayMs: 1 }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid response from background.",
    })
    expect(sendReleaseUpdateMessageMock).toHaveBeenCalledTimes(2)
    expect(sendReleaseUpdateMessageMock).toHaveBeenLastCalledWith(
      "releaseUpdate:checkNow",
    )
  })
})
