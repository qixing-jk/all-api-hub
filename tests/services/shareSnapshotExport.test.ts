import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exportShareSnapshot } from "~/services/sharing/shareSnapshots"
import {
  SHARE_SNAPSHOT_EXPORT_METHODS,
  SHARE_SNAPSHOT_KINDS,
} from "~/services/sharing/shareSnapshots/constants"
import { MESH_GRADIENT_NOISE_TILE_SIZE } from "~/services/sharing/shareSnapshots/meshGradient"
import { buildShareSnapshotPayload } from "~~/tests/test-utils/factories"

/**
 * Integration-ish tests for `exportShareSnapshot` decision logic.
 * Verifies clipboard-first behavior and download fallback without relying on
 * real canvas implementations in jsdom.
 */
type ClipboardItemData = string | Blob | Promise<string | Blob>

class ClipboardItemMock {
  private readonly items: Record<string, ClipboardItemData>

  constructor(items: Record<string, ClipboardItemData>) {
    this.items = items
  }

  getType(type: string) {
    return this.items[type]
  }
}

const createMockCanvas2dContext = (): CanvasRenderingContext2D => {
  const gradient = { addColorStop: () => {} }

  const ctx = {
    fillStyle: "",
    font: "",
    filter: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    textAlign: "left",
    textBaseline: "top",
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    fillRect: () => {},
    clearRect: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    getImageData: () => {
      throw new Error("readback blocked")
    },
    measureText: (text: string) => ({ width: Math.max(0, text.length) * 10 }),
    fillText: () => {},
  }

  return ctx as unknown as CanvasRenderingContext2D
}

const createCanvasStub = () => {
  const ctx = createMockCanvas2dContext()
  const canvas: any = {
    width: 0,
    height: 0,
    getContext: (type: string) => {
      if (type !== "2d") return null
      // Noise tiles are small canvases. Return null to skip grain generation.
      if (
        canvas.width === MESH_GRADIENT_NOISE_TILE_SIZE &&
        canvas.height === MESH_GRADIENT_NOISE_TILE_SIZE
      )
        return null
      return ctx
    },
    toBlob: (cb: (blob: Blob | null) => void, type?: string) => {
      cb(new Blob(["stub"], { type: type ?? "image/png" }))
    },
  }
  return canvas as HTMLCanvasElement
}

describe("exportShareSnapshot", () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalCreateElement = document.createElement as unknown as (
    tagName: string,
  ) => HTMLElement
  const originalClipboardItem = (window as any).ClipboardItem
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    SHARE_SNAPSHOT_EXPORT_METHODS.Clipboard,
  )

  let lastAnchor: HTMLAnchorElement | null = null
  let canvasMode: "ok" | "no-context" | "no-blob" = "ok"

  beforeEach(() => {
    lastAnchor = null
    canvasMode = "ok"

    URL.createObjectURL = vi.fn(() => "blob:mock-url") as any
    URL.revokeObjectURL = vi.fn() as any

    document.createElement = vi.fn((tagName: string) => {
      const lower = tagName.toLowerCase()
      if (lower === "canvas") {
        if (canvasMode === "no-context") {
          return {
            width: 0,
            height: 0,
            getContext: () => null,
          } as unknown as HTMLCanvasElement
        }

        if (canvasMode === "no-blob") {
          const canvas = createCanvasStub() as any
          canvas.toBlob = (cb: (blob: Blob | null) => void) => cb(null)
          return canvas
        }

        return createCanvasStub()
      }
      if (lower === "a") {
        const anchor = originalCreateElement.call(
          document,
          "a",
        ) as HTMLAnchorElement
        anchor.click = vi.fn()
        lastAnchor = anchor
        return anchor
      }
      return originalCreateElement.call(document, tagName)
    }) as any
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    document.createElement = originalCreateElement as any
    ;(window as any).ClipboardItem = originalClipboardItem
    if (originalClipboardDescriptor) {
      Object.defineProperty(
        navigator,
        SHARE_SNAPSHOT_EXPORT_METHODS.Clipboard,
        originalClipboardDescriptor,
      )
    } else {
      Reflect.deleteProperty(navigator, SHARE_SNAPSHOT_EXPORT_METHODS.Clipboard)
    }
  })

  const payload = buildShareSnapshotPayload({
    kind: SHARE_SNAPSHOT_KINDS.Account,
    currencyType: "USD",
    siteName: "Example Site",
    originUrl: "https://example.com",
    balance: 12.34,
    asOf: 1700000000000,
    backgroundSeed: 1,
  })

  it("uses clipboard when ClipboardItem+clipboard.write succeed (image + caption)", async () => {
    ;(window as any).ClipboardItem = ClipboardItemMock

    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, SHARE_SNAPSHOT_EXPORT_METHODS.Clipboard, {
      configurable: true,
      value: { write },
    })

    const result = await exportShareSnapshot(payload)

    expect(result.method).toBe("clipboard")
    expect(result.didCopyImage).toBe(true)
    expect(result.didCopyCaption).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(lastAnchor).toBeNull()
  })

  it("falls back to image-only clipboard when caption write fails", async () => {
    ;(window as any).ClipboardItem = ClipboardItemMock

    const write = vi.fn().mockImplementation(async (items: any[]) => {
      const item = items?.[0]
      if (item?.getType?.("text/plain")) {
        throw new Error("text payload not allowed")
      }
      return undefined
    })

    Object.defineProperty(navigator, SHARE_SNAPSHOT_EXPORT_METHODS.Clipboard, {
      configurable: true,
      value: { write },
    })

    const result = await exportShareSnapshot(payload)

    expect(result.method).toBe("clipboard")
    expect(result.didCopyImage).toBe(true)
    expect(result.didCopyCaption).toBe(false)
    expect(write).toHaveBeenCalledTimes(2)
    expect(lastAnchor).toBeNull()
  })

  it("falls back to download when clipboard image write is unsupported and still copies caption when possible", async () => {
    vi.useFakeTimers()
    try {
      Object.defineProperty(
        navigator,
        SHARE_SNAPSHOT_EXPORT_METHODS.Clipboard,
        {
          configurable: true,
          value: {
            writeText: vi.fn().mockResolvedValue(undefined),
          },
        },
      )

      const result = await exportShareSnapshot(payload)

      expect(result.method).toBe("download")
      expect(result.didCopyImage).toBe(false)
      expect(result.didCopyCaption).toBe(true)
      expect(lastAnchor).not.toBeNull()
      expect(vi.mocked(lastAnchor!.click)).toHaveBeenCalledTimes(1)
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()

      const REVOKE_DELAY_MS = 1000
      vi.advanceTimersByTime(REVOKE_DELAY_MS)
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns a download result without caption copy when text clipboard support is unavailable", async () => {
    Object.defineProperty(navigator, SHARE_SNAPSHOT_EXPORT_METHODS.Clipboard, {
      configurable: true,
      value: {},
    })

    const result = await exportShareSnapshot(payload)

    expect(result.method).toBe("download")
    expect(result.didCopyImage).toBe(false)
    expect(result.didCopyCaption).toBe(false)
    expect(lastAnchor).not.toBeNull()
  })

  it("fails with a stable error when the browser cannot create a 2d canvas context", async () => {
    canvasMode = "no-context"

    await expect(exportShareSnapshot(payload)).rejects.toThrow(
      "Canvas not supported",
    )
  })

  it("fails with a stable error when PNG encoding returns no blob", async () => {
    canvasMode = "no-blob"

    await expect(exportShareSnapshot(payload)).rejects.toThrow(
      "Failed to encode PNG",
    )
  })
})
