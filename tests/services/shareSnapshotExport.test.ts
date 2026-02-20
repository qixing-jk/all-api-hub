import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exportShareSnapshot } from "~/services/shareSnapshots/shareSnapshots"
import type { ShareSnapshotPayload } from "~/services/shareSnapshots/types"

/**
 * Integration-ish tests for `exportShareSnapshot` decision logic.
 * Verifies clipboard-first behavior and download fallback without relying on
 * real canvas implementations in jsdom.
 */
vi.mock("i18next", () => {
  const translations: Record<string, string> = {
    "ui:app.name": "All API Hub",
    "shareSnapshots:labels.overview": "Overview",
    "shareSnapshots:labels.totalBalance": "Total balance",
    "shareSnapshots:labels.balance": "Balance",
    "shareSnapshots:labels.accounts": "Accounts",
    "shareSnapshots:labels.today": "Today",
    "shareSnapshots:labels.income": "Income",
    "shareSnapshots:labels.outcome": "Outcome",
    "shareSnapshots:labels.net": "Net",
    "shareSnapshots:labels.asOf": "As of",
    "shareSnapshots:labels.site": "Site",
  }

  return {
    default: {
      language: "en",
      t: (key: string) => translations[key] ?? key,
    },
  }
})

class ClipboardItemMock {
  items: Record<string, Blob>

  constructor(items: Record<string, Blob>) {
    this.items = items
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
      if (canvas.width > 0 && canvas.width < 256) return null
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
    "clipboard",
  )

  let lastAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    lastAnchor = null

    URL.createObjectURL = vi.fn(() => "blob:mock-url") as any
    URL.revokeObjectURL = vi.fn() as any

    document.createElement = vi.fn((tagName: string) => {
      const lower = tagName.toLowerCase()
      if (lower === "canvas") return createCanvasStub()
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
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor)
    } else {
      Reflect.deleteProperty(navigator, "clipboard")
    }
  })

  const payload: ShareSnapshotPayload = {
    kind: "account",
    currencyType: "USD",
    siteName: "Example Site",
    originUrl: "https://example.com",
    balance: 12.34,
    asOf: 1700000000000,
    backgroundSeed: 1,
  }

  it("uses clipboard when ClipboardItem+clipboard.write succeed (image + caption)", async () => {
    ;(window as any).ClipboardItem = ClipboardItemMock

    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
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
      const record = items?.[0]?.items ?? {}
      if (record["text/plain"]) {
        throw new Error("text payload not allowed")
      }
      return undefined
    })

    Object.defineProperty(navigator, "clipboard", {
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
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    const result = await exportShareSnapshot(payload)

    expect(result.method).toBe("download")
    expect(result.didCopyImage).toBe(false)
    expect(result.didCopyCaption).toBe(true)
    expect(lastAnchor).not.toBeNull()
    expect(vi.mocked(lastAnchor!.click)).toHaveBeenCalledTimes(1)
  })
})
