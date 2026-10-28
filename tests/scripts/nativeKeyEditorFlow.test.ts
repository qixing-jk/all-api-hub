import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { chromium, type Browser, type Page } from "@playwright/test"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"

import { createUiCapture } from "~~/scripts/cdp/ui-driver.mjs"
import { testAccountCardFlow } from "~~/scripts/flows/account-card.mjs"
import {
  openNativeKeyEditor,
  submitNativeKeyEditor,
  waitForNativeKeyEditor,
} from "~~/scripts/flows/native-key-editor.mjs"
import { deleteManagedSiteChannelRow } from "~~/scripts/suites/managed-site/ui.mjs"

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})

it("opens the native editor through an eligible action and waits for a caller-selected control", async () => {
  await page.setContent(`
    <button id="open" onclick="document.querySelector('section').hidden=false">Create key</button>
    <section data-testid="key-management-native-editor" hidden>
      <label>Budget<input id="budget" value="12"></label>
    </section>
  `)
  const editor = await openNativeKeyEditor(page, {
    trigger: page.getByRole("button", { name: "Create key" }),
    readyField: page.locator("#budget"),
    timeoutMs: 1000,
  })
  expect(await editor.getByLabel("Budget").inputValue()).toBe("12")
})

it("allows the caller to record an upstream create ID before waiting for editor closure", async () => {
  await page.setContent(`
    <section data-testid="key-management-native-editor">
      <button data-testid="key-management-native-editor-submit-button"
        onclick="this.dataset.dispatched='true'">Save</button>
    </section>
  `)
  await submitNativeKeyEditor(page, { waitForClose: false, timeoutMs: 150 })
  expect(await page.getByRole("button").getAttribute("data-dispatched")).toBe(
    "true",
  )
})
afterAll(async () => browser?.close())
beforeEach(async () => {
  page = await browser.newPage()
})
afterEach(async () => page?.close())

it("waits for the actual native field after the editor loading shell disappears", async () => {
  await page.setContent(`
    <section data-testid="key-management-native-editor">
      <span data-testid="key-management-native-editor-loading">Loading</span>
    </section>
    <script>
      setTimeout(() => {
        document.querySelector('section').innerHTML =
          '<label>Monthly limit (USD)<input value="7"></label>'
      }, 50)
    </script>
  `)

  const editor = await waitForNativeKeyEditor(page, {
    readyField: "Monthly limit (USD)",
    timeoutMs: 1000,
  })

  expect(await editor.getByLabel("Monthly limit (USD)").inputValue()).toBe("7")
})

it("fails when the expected editor is absent instead of reporting a successful save", async () => {
  await page.setContent("<p>The editor was never opened</p>")
  await expect(
    submitNativeKeyEditor(page, { timeoutMs: 150 }),
  ).rejects.toThrow()
})

it("waits for an enabled submit, dispatches once and preserves the one-time-secret dialog", async () => {
  await page.setContent(`
    <section data-testid="key-management-native-editor">
      <button data-testid="key-management-native-editor-submit-button" disabled>Save</button>
    </section>
    <script>
      window.submits = 0
      const button = document.querySelector('button')
      button.onclick = () => {
        window.submits++
        document.querySelector('section').remove()
        document.body.insertAdjacentHTML('beforeend', '<div role="dialog">One-time secret</div>')
      }
      setTimeout(() => { button.disabled = false }, 50)
    </script>
  `)
  await submitNativeKeyEditor(page, { timeoutMs: 1000 })
  expect(
    await page.evaluate(
      () => (window as unknown as { submits: number }).submits,
    ),
  ).toBe(1)
  expect(await page.getByRole("dialog").textContent()).toBe("One-time secret")
})

it("reports an uncertain save without replaying the dispatched write", async () => {
  await page.setContent(`
    <section data-testid="key-management-native-editor">
      <button data-testid="key-management-native-editor-submit-button"
        onclick="this.dataset.submits = String(Number(this.dataset.submits || 0) + 1)">Save</button>
    </section>
  `)
  await expect(submitNativeKeyEditor(page, { timeoutMs: 500 })).rejects.toThrow(
    "do not replay",
  )
  expect(await page.getByRole("button").getAttribute("data-submits")).toBe("1")
})

it("does not mistake an empty editor shell for the provider's required field", async () => {
  await page.setContent(
    '<section data-testid="key-management-native-editor">No native fields</section>',
  )
  await expect(
    waitForNativeKeyEditor(page, { readyField: "Budget", timeoutMs: 150 }),
  ).rejects.toThrow()
})

it("waits for the exact account card rather than passing on a same-name account", async () => {
  await page.route("https://extension.fixture/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<div data-testid="account-management-account-list-item-other">Shared name</div>',
    }),
  )
  const originalGoto = page.goto.bind(page)
  page.goto = (() => originalGoto("https://extension.fixture/")) as Page["goto"]
  await expect(
    testAccountCardFlow({
      page,
      extensionId: "fixture",
      accountName: "Shared name",
      accountId: "expected",
      timeoutMs: 150,
    }),
  ).rejects.toThrow()
})

it("captures an actual locator checkpoint using its browser page", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aah-ui-capture-test-"))
  const filename = path.join(directory, "editor.png")
  const screenshots: string[] = []
  try {
    await page.setContent(
      '<section style="width:200px;height:100px">Native editor</section>',
    )
    const capture = createUiCapture({ page, directory, screenshots })
    await capture("editor", page.locator("section"))
    expect(screenshots).toEqual(["editor.png"])
    expect((await readFile(filename)).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  } finally {
    await unlink(filename).catch(() => {})
    await rmdir(directory)
  }
})

it("deletes the caller-selected managed channel row and leaves another row intact", async () => {
  await page.setContent(`
    <div data-testid="managed-site-channel-row-owned">Owned
      <button data-testid="managed-site-channel-row-owned-select" onclick="window.selected='owned';document.querySelector('#delete-selected').disabled=false">Select</button>
    </div>
    <div data-testid="managed-site-channel-row-other">Existing</div>
    <button id="delete-selected" data-testid="managed-site-channels-delete-selected-button" disabled>Delete selected</button>
    <button data-testid="managed-site-channels-delete-confirm-button"
      onclick="document.querySelector('[data-testid=managed-site-channel-row-'+window.selected+']').remove()">Confirm</button>
  `)
  await deleteManagedSiteChannelRow(
    page,
    page.getByTestId("managed-site-channel-row-owned"),
  )
  expect(await page.getByTestId("managed-site-channel-row-owned").count()).toBe(
    0,
  )
  expect(await page.getByTestId("managed-site-channel-row-other").count()).toBe(
    1,
  )
})

it("refuses managed deletion when the caller's row identity is ambiguous", async () => {
  await page.setContent(
    '<div data-testid="managed-site-channel-row-one">Same</div><div data-testid="managed-site-channel-row-two">Same</div>',
  )
  await expect(
    deleteManagedSiteChannelRow(page, page.locator("div")),
  ).rejects.toThrow("one identified row")
  expect(await page.locator("div").count()).toBe(2)
})

it("refuses managed deletion while the workspace already has a selection", async () => {
  await page.setContent(`
    <div data-testid="managed-site-channel-row-owned">Owned
      <button data-testid="managed-site-channel-row-owned-select">Select</button>
    </div>
    <button data-testid="managed-site-channels-delete-selected-button">Delete selected</button>
    <button data-testid="managed-site-channels-delete-confirm-button">Confirm</button>
  `)
  await expect(
    deleteManagedSiteChannelRow(
      page,
      page.getByTestId("managed-site-channel-row-owned"),
      { timeoutMs: 150 },
    ),
  ).rejects.toThrow("existing selection")
})
