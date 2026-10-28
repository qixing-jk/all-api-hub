import type { Page } from "@playwright/test"
import { describe, expect, it, vi } from "vitest"

import {
  configureExtensionPage,
  createUiCapture,
  dismissModals,
  openExtensionPage,
} from "~~/scripts/cdp/ui-driver.mjs"

describe("dismissModals", () => {
  it("leaves a non-dismissible dialog intact for the calling flow to detect", async () => {
    const dialog = {
      count: vi.fn(async () => 1),
      first: () => dialog,
      isVisible: vi.fn(async () => true),
    }
    const page = {
      locator: (selector: string) =>
        selector.includes("button") ? { count: async () => 0 } : dialog,
      keyboard: { press: vi.fn(async () => {}) },
      waitForTimeout: vi.fn(async () => {}),
      evaluate: vi.fn(async () => {}),
    }

    await dismissModals(page as unknown as Page)

    expect(page.keyboard.press).toHaveBeenCalledWith("Escape")
    expect(page.evaluate).not.toHaveBeenCalled()
  })
})

it("records the real fallback filename while retaining screenshot masks", async () => {
  const screenshots: string[] = []
  const mask = {} as never
  const screenshot = vi.fn(async () => Buffer.from("png"))
  const page = { screenshot } as unknown as Page
  const unstable = {
    page: () => page,
    screenshot: vi.fn(async () => {
      throw new Error("unstable card")
    }),
  }
  const capture = createUiCapture({
    page,
    directory: "evidence",
    screenshots,
    mask: [mask],
    fallbackToPage: true,
    timeoutMs: 8000,
  })
  await capture("balance", unstable as never)
  expect(screenshots).toEqual(["balance-page.png"])
  expect(screenshot).toHaveBeenCalledWith(
    expect.objectContaining({
      path: expect.stringMatching(/balance-page\.png$/),
      animations: "disabled",
      mask: [mask],
    }),
  )
})

it("falls back to the locator's own page rather than another tab's screenshot", async () => {
  const wrongScreenshot = vi.fn(async () => Buffer.from("wrong"))
  const correctScreenshot = vi.fn(async () => Buffer.from("correct"))
  const owner = { screenshot: correctScreenshot }
  const locator = {
    page: () => owner,
    screenshot: async () => {
      throw new Error("moving row")
    },
  }
  const capture = createUiCapture({
    page: { screenshot: wrongScreenshot } as unknown as Page,
    directory: "evidence",
    fallbackToPage: true,
  })
  await capture("account", locator as never)
  expect(correctScreenshot).toHaveBeenCalledOnce()
  expect(wrongScreenshot).not.toHaveBeenCalled()
})

it("does not record a screenshot that could not be captured", async () => {
  const screenshots: string[] = []
  const page = {
    screenshot: vi.fn(async () => {
      throw new Error("closed")
    }),
  } as unknown as Page
  const capture = createUiCapture({ page, directory: "evidence", screenshots })
  await expect(capture("keys.png")).rejects.toThrow("closed")
  expect(screenshots).toEqual([])
})

it("prepares the requested viewport, language and targeted update-log handler", async () => {
  const script = vi.fn()
  const viewport = vi.fn()
  const closeUpdate = vi.fn(async () => {})
  const handler = vi.fn(async (_locator, callback) => callback())
  const page = {
    setViewportSize: viewport,
    addInitScript: script,
    getByTestId: () => ({ click: closeUpdate }),
    addLocatorHandler: handler,
  } as unknown as Page
  await configureExtensionPage(page, {
    language: "en",
    viewport: { width: 1440, height: 1000 },
    dismissUpdateLog: true,
  })
  expect(viewport).toHaveBeenCalledWith({ width: 1440, height: 1000 })
  expect(script).toHaveBeenCalledWith(expect.any(Function), {
    key: "all-api-hub-i18nextLng",
    language: "en",
  })
  expect(handler).toHaveBeenCalledOnce()
  expect(closeUpdate).toHaveBeenCalledOnce()
})

it("closes only its newly opened page when route navigation fails", async () => {
  const failure = new Error("extension route failed")
  const close = vi.fn(async () => {})
  const page = {
    goto: async () => {
      throw failure
    },
    close,
  } as unknown as Page
  const context = { newPage: async () => page }
  await expect(
    openExtensionPage({
      context: context as never,
      extensionId: "fixture",
      autoDismissModals: false,
    }),
  ).rejects.toBe(failure)
  expect(close).toHaveBeenCalledOnce()
})
