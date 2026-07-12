import { describe, expect, it, vi } from "vitest"

import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_V5_URL,
} from "~/features/AccountManagement/sponsors/constants"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import {
  installExtensionPageGuards,
  stubLlmMetadataIndex,
  stubSponsorRemoteCatalog,
} from "~~/e2e/utils/commonUserFlows"

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

  it("ignores configured console-error patterns", () => {
    const handlers: Record<string, (value: unknown) => void> = {}
    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers[event] = handler
      }),
    } as any

    installExtensionPageGuards(page, {
      ignoreConsoleErrorPatterns: [/ResizeObserver loop limit exceeded/],
    })

    expect(() =>
      handlers.console({
        type: () => "error",
        text: () => "ResizeObserver loop limit exceeded",
      }),
    ).not.toThrow()
  })
})

describe("E2E external route stubs", () => {
  it("stubs both metadata and sponsor catalog endpoints used by extension pages", async () => {
    const context = {
      route: vi.fn(),
    } as any

    await stubLlmMetadataIndex(context)

    expect(context.route).toHaveBeenCalledWith(
      MODEL_METADATA_URL,
      expect.any(Function),
    )
    expect(context.route).toHaveBeenCalledWith(
      SPONSOR_REMOTE_CATALOG_V5_URL,
      expect.any(Function),
    )
  })

  it("serves a deterministic empty sponsor catalog for E2E pages", async () => {
    const context = {
      route: vi.fn(),
    } as any

    await stubSponsorRemoteCatalog(context)

    const [, handler] = context.route.mock.calls[0]!
    const route = {
      fulfill: vi.fn(),
    }

    await handler(route)

    expect(route.fulfill).toHaveBeenCalledWith({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
        items: [],
      }),
    })
  })
})
