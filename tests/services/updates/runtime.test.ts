import { describe, expect, it, vi } from "vitest"

const { sendRuntimeActionMessageMock } = vi.hoisted(() => ({
  sendRuntimeActionMessageMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeActionMessage: sendRuntimeActionMessageMock,
}))

describe("release update runtime client", () => {
  it("returns a parsed success response when the background request succeeds", async () => {
    sendRuntimeActionMessageMock.mockResolvedValueOnce({
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
  })

  it("returns a failure response when the background request throws", async () => {
    sendRuntimeActionMessageMock.mockRejectedValueOnce(
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
})
