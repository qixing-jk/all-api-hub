import { isValidElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { renderExtensionPageMock } = vi.hoisted(() => ({
  renderExtensionPageMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("~/entrypoints/shared/renderExtensionPage", () => ({
  renderExtensionPage: (...args: unknown[]) => renderExtensionPageMock(...args),
}))
vi.mock("~/entrypoints/options/App", () => ({ default: () => null }))
vi.mock("~/entrypoints/sidepanel/App", () => ({ default: () => null }))

describe("page entrypoints", () => {
  beforeEach(() => {
    vi.resetModules()
    renderExtensionPageMock.mockClear()
  })

  it("routes the options app through the shared locale-ready renderer", async () => {
    await import("~/entrypoints/options/main")

    expect(renderExtensionPageMock).toHaveBeenCalledOnce()
    const [pageType, app] = renderExtensionPageMock.mock.calls[0]!
    expect(pageType).toBe("options")
    expect(isValidElement(app)).toBe(true)
  })

  it("routes the side panel app through the shared locale-ready renderer", async () => {
    await import("~/entrypoints/sidepanel/main")

    expect(renderExtensionPageMock).toHaveBeenCalledOnce()
    const [pageType, app] = renderExtensionPageMock.mock.calls[0]!
    expect(pageType).toBe("sidepanel")
    expect(isValidElement(app)).toBe(true)
  })
})
