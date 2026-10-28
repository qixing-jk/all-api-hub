import { chromium, type Browser, type Page } from "@playwright/test"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"

import {
  assertAccountDetectionOutcome,
  detectAccountSiteType,
  openAccountAddDialog,
  testAutoDetectFlow,
} from "~~/scripts/flows/auto-detect.mjs"

let browser: Browser
let page: Page
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})
beforeEach(async () => {
  page = await browser.newPage()
})
afterEach(async () => {
  await page.close()
})
afterAll(async () => {
  await browser.close()
})

async function form(detected: string) {
  await page.setContent(`
    <button data-testid="account-management-add-account-button" onclick="document.querySelector('[role=dialog]').hidden=false">Add Account</button>
    <div role="dialog" data-testid="account-management-account-dialog" hidden>
      <input id="site-url" data-testid="account-management-site-url-input">
      <p>Rix-Api setup guide</p>
      <button data-testid="account-management-auto-detect-button" onclick="this.dataset.calls=String(Number(this.dataset.calls||0)+1);setTimeout(()=>{ document.querySelector('#type').dataset.siteType='${detected}';document.querySelector('#type').hidden=false }, 30)">Detect</button>
      <button id="type" data-testid="account-management-site-type-trigger" data-site-type="unknown" hidden>Rix guide</button>
      <button onclick="document.querySelector('[role=dialog]').hidden=true">Cancel</button>
    </div>
  `)
}

it("rejects a wrong identity even when the detected type matches", async () => {
  await form("Rix-Api")
  await openAccountAddDialog({ page, targetUrl: "https://rix.fixture" })
  await page
    .locator("#type")
    .evaluate((element) => element.setAttribute("data-site-type", "Rix-Api"))
  await expect(
    assertAccountDetectionOutcome({
      page,
      expectedType: "Rix-Api",
      fields: { siteUrlInput: "https://another-account.fixture" },
      saveState: "absent",
      timeoutMs: 200,
    }),
  ).rejects.toThrow()
})

it("accepts expected guidance only with the declared missing credential and save state", async () => {
  await form("Rix-Api")
  await openAccountAddDialog({ page, targetUrl: "https://rix.fixture" })
  await page.locator("#type").evaluate((element) => {
    element.setAttribute("data-site-type", "Rix-Api")
    const input = document.createElement("input")
    input.dataset.testid = "account-management-access-token-input"
    const guide = document.createElement("p")
    guide.textContent = "Enter a management token"
    element.parentElement!.append(input, guide)
  })
  const options = {
    page,
    expectedType: "Rix-Api",
    fields: { accessTokenInput: "" },
    guidance: "Enter a management token",
    saveState: "absent" as const,
    timeoutMs: 200,
  }
  await assertAccountDetectionOutcome(options)
  await page
    .getByTestId("account-management-access-token-input")
    .fill("wrong-dashboard-token")
  await expect(assertAccountDetectionOutcome(options)).rejects.toThrow()
})

it("rejects detection errors even when the site type already matches", async () => {
  await form("Rix-Api")
  await openAccountAddDialog({ page, targetUrl: "https://rix.fixture" })
  await page
    .getByTestId("account-management-auto-detect-button")
    .evaluate((button) => {
      button.onclick = () => {
        document
          .querySelector("#type")!
          .setAttribute("data-site-type", "Rix-Api")
        const error = document.createElement("p")
        error.dataset.testid = "account-management-auto-detect-error-message"
        error.textContent = "Session identity could not be read"
        document.querySelector('[role="dialog"]')!.append(error)
      }
    })
  await expect(
    detectAccountSiteType({ page, expectedType: "Rix-Api", timeoutMs: 1000 }),
  ).rejects.toThrow("Session identity could not be read")
})

it("does not accept a provider name in guidance as successful site identification", async () => {
  await form("new-api")
  await expect(
    testAutoDetectFlow({
      page,
      targetUrl: "https://rix.fixture",
      expectedType: "Rix-Api",
      timeoutMs: 150,
    }),
  ).rejects.toThrow()
})

it("executes detection once and accepts the machine site type independently of display copy", async () => {
  await form("Rix-Api")
  const result = await testAutoDetectFlow({
    page,
    targetUrl: "https://rix.fixture",
    expectedType: "Rix-Api",
    timeoutMs: 1000,
  })
  expect(result.ok).toBe(true)
  expect(
    await page
      .getByTestId("account-management-auto-detect-button")
      .getAttribute("data-calls"),
  ).toBe("1")
  expect(
    await page.getByTestId("account-management-account-dialog").isVisible(),
  ).toBe(false)
})

it.each(["idle", "removed"])(
  "waits for detection completion after the type matches (%s button)",
  async (completion) => {
    await form("Rix-Api")
    await openAccountAddDialog({ page, targetUrl: "https://rix.fixture" })
    await page
      .getByTestId("account-management-auto-detect-button")
      .evaluate((button, completion) => {
        button.onclick = () => {
          button.setAttribute("aria-busy", "true")
          document
            .querySelector("#type")!
            .setAttribute("data-site-type", "Rix-Api")
          setTimeout(() => {
            document.body.dataset.detectionFinished = "true"
            if (completion === "removed") button.remove()
            else button.removeAttribute("aria-busy")
          }, 150)
        }
      }, completion)
    await detectAccountSiteType({
      page,
      expectedType: "Rix-Api",
      timeoutMs: 1000,
    })
    expect(
      await page.locator("body").getAttribute("data-detection-finished"),
    ).toBe("true")
  },
)
