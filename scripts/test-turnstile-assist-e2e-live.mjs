/* global chrome */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { expect } from "@playwright/test"

import { connectDevExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { withStoredValue } from "./cdp/sandbox.mjs"
import { dismissModals, openExtensionPage } from "./cdp/ui-driver.mjs"
import { startTurnstileTestServer } from "./fixtures/turnstile-server.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
assert.ok(
  process.argv.includes("--isolate"),
  "Use --isolate for the Turnstile browser test",
)
applyIsolateFlag(process.argv.slice(2))
const port = Number(process.env.AAH_TURNSTILE_PORT || 8787)
const evidenceDir = path.resolve(
  `.scratch/turnstile-channels/live-${Date.now()}`,
)
await fs.mkdir(evidenceDir, { recursive: true })
const servers = []
let dev
let optionsPage
const ownedPages = new Set()
try {
  for (let offset = 0; offset < 3; offset++)
    servers.push(await startTurnstileTestServer({ port: port + offset }))
  dev = await connectDevExtension()
  dev.context.setDefaultNavigationTimeout(120000)
  async function useActualFocus(page) {
    const session = await dev.context.newCDPSession(page)
    await session.send("Emulation.setFocusEmulationEnabled", {
      enabled: false,
    })
    await session.detach()
  }
  // Existing extension tabs must not acknowledge reminders via CDP's emulated focus.
  for (const page of dev.context.pages()) {
    if (page.url().startsWith(`chrome-extension://${dev.extensionId}/`))
      await useActualFocus(page)
  }

  const onPage = (page) => {
    page.on("framenavigated", () => {
      if (servers.some((server) => page.url().startsWith(server.origin)))
        ownedPages.add(page)
    })
  }
  dev.context.on("page", onPage)
  await withStoredValue(
    dev.serviceWorker,
    "user_preferences",
    {
      language: "en",
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: { checkin: true },
        tempContextMode: "window",
        turnstileAssistPresentation: "page",
      },
    },
    async () => {
      optionsPage = await openExtensionPage({
        context: dev.context,
        extensionId: dev.extensionId,
        route: "options.html?tab=refresh#basic",
      })
      const form = optionsPage.getByTestId("shield-dev-trigger-form")
      await expect(form).toBeVisible({ timeout: 60000 })
      await dismissModals(optionsPage)
      await useActualFocus(optionsPage)
      async function start(label, origin = servers[0].origin, delay = 0) {
        await form.getByRole("combobox").click()
        await optionsPage
          .getByRole("option", { name: label, exact: true })
          .click()
        await form.getByRole("textbox").fill(`${origin}/`)
        await form.getByRole("spinbutton").fill(String(delay))
        await form
          .getByRole("button", { name: "Trigger after delay", exact: true })
          .click()
        console.log(`Started ${label}`)
      }
      await start("Turnstile: automatic success")
      await expect(form.getByRole("status")).toContainText("200", {
        timeout: 45000,
      })
      console.log(
        "PASS: official automatic widget → token wait → local Siteverify → UI success",
      )

      const reminderSettings = optionsPage.locator("#shield-turnstile-assist")
      await expect(reminderSettings.getByRole("switch")).toHaveCount(2)
      await expect(
        reminderSettings.getByRole("switch", {
          name: "In-page reminders",
          exact: true,
        }),
      ).toBeChecked()
      await expect(
        reminderSettings.getByRole("switch", {
          name: "Browser notifications",
          exact: true,
        }),
      ).not.toBeChecked()
      await reminderSettings.scrollIntoViewIfNeeded()
      await optionsPage.screenshot({
        path: path.join(evidenceDir, "settings.png"),
        animations: "disabled",
      })
      async function focusedVerificationUrl() {
        return dev.serviceWorker.evaluate(async () => {
          const windows = await chrome.windows.getAll({ populate: true })
          return (
            windows
              .find((w) => w.focused && w.state !== "minimized")
              ?.tabs?.find((tab) => tab.active)?.url ?? ""
          )
        })
      }
      async function expectPreference(value) {
        await expect
          .poll(() =>
            dev.serviceWorker.evaluate(async () => {
              const raw = (await chrome.storage.local.get("user_preferences"))
                .user_preferences
              return (typeof raw === "string" ? JSON.parse(raw) : raw)
                ?.tempWindowFallback?.turnstileAssistPresentation
            }),
          )
          .toBe(value)
      }
      const pageSwitch = reminderSettings.getByRole("switch", {
        name: "In-page reminders",
        exact: true,
      })
      const systemSwitch = reminderSettings.getByRole("switch", {
        name: "Browser notifications",
        exact: true,
      })
      await pageSwitch.click()
      await expectPreference("quiet")
      await pageSwitch.click()
      await expectPreference("page")
      await systemSwitch.click()
      await expect
        .poll(async () =>
          (await systemSwitch.isChecked())
            ? "enabled"
            : (await optionsPage.getByRole("dialog").isVisible())
              ? "dialog"
              : "pending",
        )
        .not.toBe("pending")
      if (await systemSwitch.isChecked()) {
        await expectPreference("both")
        await pageSwitch.click()
        await expectPreference("notify")
        await pageSwitch.click()
        await expectPreference("both")
        await systemSwitch.click()
      } else {
        const dialog = optionsPage.getByRole("dialog")
        const titleBox = await dialog.getByRole("heading").boundingBox()
        const closeBox = await dialog
          .getByRole("button", { name: "Close", exact: true })
          .boundingBox()
        assert.ok(titleBox && closeBox)
        assert.ok(
          titleBox.x + titleBox.width <= closeBox.x,
          "The permission title leaves space for the close button",
        )
        await optionsPage.screenshot({
          path: path.join(evidenceDir, "permission-dialog.png"),
          animations: "disabled",
        })
        await optionsPage
          .getByRole("dialog")
          .getByRole("button", { name: "Cancel", exact: true })
          .click()
        await expect(systemSwitch).not.toBeChecked()
      }
      await expectPreference("page")
      console.log(
        "PASS: independent switches persist; missing permission requires an explicit dialog",
      )
      // Exercise both the focused extension toast host and the content-script host.
      for (const target of ["extension", "web", "settings"]) {
        const origin = servers[target !== "extension" ? 1 : 0].origin
        let reminderPage = optionsPage
        if (target !== "extension") {
          reminderPage = await dev.context.newPage()
          ownedPages.add(reminderPage)
          await reminderPage.goto(`${servers[2].origin}/?scenario=automatic`)
          await useActualFocus(reminderPage)
          await expect
            .poll(
              () =>
                dev.serviceWorker.evaluate(async (url) => {
                  const tab = (await chrome.tabs.query({})).find(
                    (tab) => tab.url === url,
                  )
                  if (!tab) return false
                  try {
                    return Boolean(
                      await chrome.tabs.sendMessage(tab.id, {
                        action: "getRenderedTitle",
                      }),
                    )
                  } catch {
                    return false
                  }
                }, reminderPage.url()),
              { timeout: 20000 },
            )
            .toBe(true)
        }
        await optionsPage.bringToFront()
        await start(
          "Turnstile: manual verification",
          origin,
          target === "extension" ? 0 : 2,
        )
        await reminderPage.bringToFront()
        await expect
          .poll(() => reminderPage.evaluate(() => document.hasFocus()))
          .toBe(true)
        const open = reminderPage.getByRole("button", {
          name: "Open verification window",
          exact: true,
        })
        await expect(open).toBeVisible({ timeout: 30000 })
        await expect(
          reminderPage.getByText("All API Hub · Verification reminder", {
            exact: true,
          }),
        ).toBeVisible()
        await expect(
          reminderPage.getByRole("button", {
            name: "Reminder settings",
            exact: true,
          }),
        ).toBeVisible()
        assert.equal(
          await reminderPage.evaluate(() => document.hasFocus()),
          true,
          "Reminder preserves the user's current page",
        )
        await reminderPage.screenshot({
          path: path.join(evidenceDir, `reminder-${target}.png`),
        })
        if (target === "settings") {
          const existing = new Set(dev.context.pages())
          await reminderPage
            .getByRole("button", { name: "Reminder settings", exact: true })
            .click()
          let settingsPage
          await expect
            .poll(
              () => {
                settingsPage = dev.context
                  .pages()
                  .find(
                    (page) =>
                      !page.isClosed() &&
                      page
                        .url()
                        .startsWith(
                          `chrome-extension://${dev.extensionId}/options.html`,
                        ) &&
                      new URL(page.url()).searchParams.get("anchor") ===
                        "shield-turnstile-assist",
                  )
                return Boolean(settingsPage)
              },
              { timeout: 15000 },
            )
            .toBe(true)
          if (!existing.has(settingsPage)) ownedPages.add(settingsPage)
          await dismissModals(settingsPage)
          const settingsPanel = settingsPage.locator("#shield-turnstile-assist")
          await expect(settingsPanel.getByRole("switch")).toHaveCount(2, {
            timeout: 60000,
          })
          await expect(settingsPanel).toBeInViewport()
          await settingsPage.screenshot({
            path: path.join(evidenceDir, "settings-destination.png"),
            animations: "disabled",
          })
          for (const page of ownedPages) {
            if (
              !page.isClosed() &&
              page !== reminderPage &&
              page.url().startsWith(origin)
            )
              await page.close()
          }
          await reminderPage.close()
          if (!existing.has(settingsPage)) await settingsPage.close()
          console.log(
            "PASS: web reminder settings action opens the extension and targets both reminder switches",
          )
          continue
        }
        await open.click()
        let challengePage
        await expect
          .poll(
            async () => {
              const url = await focusedVerificationUrl()
              challengePage = [...ownedPages].find(
                (page) =>
                  !page.isClosed() &&
                  page.url() === url &&
                  url.startsWith(origin),
              )
              return Boolean(challengePage)
            },
            { timeout: 10000 },
          )
          .toBe(true)
        const box = await challengePage.locator("#challenge").boundingBox()
        assert.ok(box)
        await challengePage.mouse.click(box.x + 20, box.y + box.height / 2)
        await expect(form.getByRole("status")).toContainText("200", {
          timeout: 45000,
        })
        await expect(open).not.toBeVisible({ timeout: 10000 })
        // Do not reuse an already-solved dummy widget in the next scenario.
        await challengePage.close()
        console.log(
          `PASS: ${target} page reminder → click → verification → reminder cleanup`,
        )
        if (target === "web") await reminderPage.close()
      }
      await optionsPage.bringToFront()
      await start("Turnstile: three-site queue")
      const completed = new Set()
      for (let index = 0; index < 3; index++) {
        await optionsPage.bringToFront()
        const reminders = optionsPage.getByRole("button", {
          name: "Open verification window",
          exact: true,
        })
        await expect(reminders.first()).toBeVisible({ timeout: 30000 })
        assert.equal(
          await optionsPage.evaluate(() => document.hasFocus()),
          true,
        )
        await reminders.first().click()
        let current
        await expect
          .poll(
            async () => {
              const url = await focusedVerificationUrl()
              current = [...ownedPages].find(
                (page) =>
                  !page.isClosed() &&
                  !completed.has(page) &&
                  page.url() === url,
              )
              return Boolean(current)
            },
            { timeout: 10000 },
          )
          .toBe(true)
        assert.ok(current, "The clicked request reaches the user")
        // The official widget's iframe lives inside a closed shadow root.
        // Click the known local fixture container with a trusted browser gesture.
        const challenge = current.locator("#challenge")
        await expect(challenge).toBeVisible({ timeout: 20000 })
        const box = await challenge.boundingBox()
        assert.ok(box, "Official interactive test widget is visible")
        // The official dummy interactive widget accepts a real browser gesture.
        await current.mouse.click(box.x + 20, box.y + box.height / 2)
        completed.add(current)
        await expect(reminders).toHaveCount(2 - index, { timeout: 10000 })
        console.log(`Completed official interactive widget ${index + 1}`)
      }
      await expect(form.getByRole("status")).toContainText("200", {
        timeout: 45000,
      })
      console.log(
        "PASS: three official interactive widgets open only through their reminders",
      )
      await optionsPage.screenshot({
        path: path.join(evidenceDir, "result.png"),
        timeout: 15000,
        animations: "disabled",
      })
    },
  )
  dev.context.off("page", onPage)
} catch (error) {
  console.error(error)
  if (optionsPage && !optionsPage.isClosed()) {
    console.error(
      "Development trigger feedback:",
      await optionsPage
        .getByTestId("shield-dev-trigger-form")
        .innerText()
        .catch(() => "unavailable"),
    )
    await optionsPage
      .screenshot({
        path: path.join(evidenceDir, "failure.png"),
        timeout: 15000,
        animations: "disabled",
      })
      .catch(() => {})
  }
  throw error
} finally {
  await optionsPage?.close().catch(() => {})
  for (const page of ownedPages) await page.close().catch(() => {})
  await dev?.close()
  await Promise.all(servers.map((server) => server.close()))
}
