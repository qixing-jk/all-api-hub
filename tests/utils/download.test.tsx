import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { downloadBlob } from "~/utils/browser/download"

describe("Blob downloads", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => "blob:download-test"),
        revokeObjectURL: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("keeps an attached, live URL for deferred browser consumption then releases it", () => {
    const blob = new Blob(["backup"], { type: "application/json" })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true)
      expect(this.download).toBe("backup.json")
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    })

    downloadBlob(blob, "backup.json")
    const clicked = document.querySelector('a[download="backup.json"]')
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked?.isConnected).toBe(true)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.runOnlyPendingTimers()
    expect(clicked?.isConnected).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:download-test",
    )
  })

  it("releases immediately and preserves errors when starting the download fails", () => {
    const error = new Error("Download unavailable")
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw error
    })
    expect(() => downloadBlob(new Blob(), "backup.json")).toThrow(error)
    expect(document.querySelector('a[download="backup.json"]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:download-test",
    )
  })
})
