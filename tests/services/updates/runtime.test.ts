import { describe, expect, it, vi } from "vitest"

const { sendRuntimeActionMessageMock } = vi.hoisted(() => ({
  sendRuntimeActionMessageMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeActionMessage: sendRuntimeActionMessageMock,
}))

describe("release update runtime client", () => {
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
