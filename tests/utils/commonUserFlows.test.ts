import { describe, expect, it, vi } from "vitest"

import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"

describe("installExtensionPageGuards", () => {
  it("throws on extension console errors, including resource-load failures", () => {
    const handlers: Record<string, (value: unknown) => void> = {}
    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers[event] = handler
      }),
    } as any

    installExtensionPageGuards(page)

    expect(() =>
      handlers.console({
        type: () => "error",
        text: () => "Failed to load resource: net::ERR_FILE_NOT_FOUND",
      }),
    ).toThrowError("Failed to load resource: net::ERR_FILE_NOT_FOUND")
  })

  it("ignores non-error console messages", () => {
    const handlers: Record<string, (value: unknown) => void> = {}
    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers[event] = handler
      }),
    } as any

    installExtensionPageGuards(page)

    expect(() =>
      handlers.console({
        type: () => "warning",
        text: () => "non-blocking warning",
      }),
    ).not.toThrow()
  })
})
