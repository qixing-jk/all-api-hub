import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium } from "@playwright/test"
import { expect, it } from "vitest"

// @ts-expect-error Node-only live suite does not have declarations.
import { runPmplanUi } from "~~/scripts/suites/pmplan/ui.mjs"

it.each([false, true])(
  "preserves another tab's new key when the PM-Plan suite fails (write=%s)",
  async (write) => {
    const browser = await chromium.launch({ headless: true })
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "pmplan-ownership-"),
    )
    try {
      const context = await browser.newContext()
      const otherPage = await context.newPage()
      let keyStatus = "active"
      const deletes: string[] = []
      await context.route("https://plan.pmcat.top/**", async (route) => {
        const request = route.request()
        const pathname = new URL(request.url()).pathname
        if (pathname === "/api/me") {
          await otherPage.evaluate(async () => {
            await fetch("/api/keys", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expires_at: null, models: [] }),
            })
          })
          await route.fulfill({ status: 401, json: { error: "expired" } })
        } else if (pathname === "/api/keys" && request.method() === "POST") {
          await route.fulfill({ json: { id: 999, key: "sk-pm-other-tab" } })
        } else if (pathname === "/api/keys") {
          await route.fulfill({
            json: { keys: [{ id: 999, status: keyStatus }] },
          })
        } else if (request.method() === "DELETE") {
          deletes.push(pathname)
          keyStatus = "revoked"
          await route.fulfill({ json: { ok: true } })
        } else {
          await route.fulfill({
            contentType: "text/html",
            body: "<p>Console</p>",
          })
        }
      })
      await otherPage.goto("https://plan.pmcat.top/")
      await expect(
        runPmplanUi({
          context,
          serviceWorker: {},
          extensionId: "fixture",
          evidenceDir: directory,
          write,
        }),
      ).rejects.toThrow("401")
      expect(deletes).toEqual([])
      expect(keyStatus).toBe("active")
      expect(otherPage.isClosed()).toBe(false)
      expect(context.pages()).toEqual([otherPage])
    } finally {
      await browser.close()
      for (const file of await fs.readdir(directory))
        await fs.unlink(path.join(directory, file))
      await fs.rmdir(directory)
    }
  },
)
