import type { BrowserContext, Worker } from "@playwright/test"
import { describe, expect, it, vi } from "vitest"

import {
  consoleKeyBelongsToRun,
  runRequestyUiTest,
} from "~~/scripts/suites/requesty/ui.mjs"

const { openExtensionPage } = vi.hoisted(() => ({ openExtensionPage: vi.fn() }))
vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({
  openExtensionPage,
  dismissModals: vi.fn(),
}))
vi.mock("~~/scripts/cdp/sandbox.mjs", () => ({ getAccounts: async () => [] }))

it("reports incomplete credential coverage only after closing both pages", async () => {
  const locator = (selector: string): any => ({
    first: () => locator(selector),
    filter: () => locator(selector),
    locator,
    click: vi.fn(),
    fill: vi.fn(),
    waitFor: vi.fn(),
    getAttribute: async () => "requesty",
    inputValue: async () => "",
    isVisible: async () => true,
    innerText: async () =>
      selector.includes("auto-detect-button")
        ? "Create Requesty Management Key and Detect"
        : selector === "label"
          ? "Requesty manage key"
          : "Sign in to Requesty",
  })
  const page = {
    locator,
    waitForFunction: vi.fn(),
    screenshot: vi.fn(),
    close: vi.fn(async () => {}),
  }
  openExtensionPage.mockResolvedValue(page)
  const consolePage = {
    goto: vi.fn(),
    waitForFunction: vi.fn(),
    evaluate: async () => ({ signedIn: false, keys: null }),
    close: vi.fn(async () => {}),
  }
  const result = await runRequestyUiTest({
    context: { newPage: async () => consolePage } as unknown as BrowserContext,
    extensionId: "test",
    serviceWorker: {} as Worker,
    evidenceDir: "test-results/requesty-unit",
  })
  expect(page.close).toHaveBeenCalledOnce()
  expect(consolePage.close).toHaveBeenCalledOnce()
  expect(result).toEqual({
    skipped: true,
    reason: expect.stringMatching(/management key/i),
  })
})

describe("Requesty live UI console key ownership", () => {
  const reusedCredential = { id: "key-shared", name: "All API Hub" }

  it("never claims a key the pre-run inventory already contained", () => {
    // The dialog prefills a saved management credential, so onboarding can hand
    // back a key this run did not create; revoking it would break the operator's
    // account. The old check matched by name and deleted keys with that name.
    const preRunIds = new Set(["key-shared", "key-other"])

    expect(consoleKeyBelongsToRun(reusedCredential, preRunIds)).toBe(false)
  })

  it("claims a key that the pre-run inventory did not contain", () => {
    const preRunIds = new Set(["key-other"])

    expect(consoleKeyBelongsToRun(reusedCredential, preRunIds)).toBe(true)
    expect(consoleKeyBelongsToRun(reusedCredential, new Set())).toBe(true)
  })

  it("claims nothing when the pre-run inventory could not be read", () => {
    // An unreadable inventory cannot prove ownership, and deleting on that
    // assumption is the destructive failure this guards against.
    expect(consoleKeyBelongsToRun(reusedCredential, null)).toBe(false)
  })
})
