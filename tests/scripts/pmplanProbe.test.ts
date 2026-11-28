import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium } from "@playwright/test"
import { expect, it, vi } from "vitest"

import { PMPLAN_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
// @ts-expect-error Node-only live suite does not have declarations.
import { runPmplanProbe } from "~~/scripts/suites/pmplan/probe.mjs"

it("accepts channel-level account access that the model square's tier map omits", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pmplan-probe-"))
  const browser = await chromium.launch({ headless: true })
  try {
    vi.stubEnv("PMPLAN_USER_ID", "661")
    const context = await browser.newContext()
    const model = {
      name: "unrestricted-channel-model",
      input_micro: 0,
      output_micro: 0,
      channel_count: 1,
    }
    const responses: Record<string, unknown> = {
      "/api/me": {
        user: { id: 661 },
        usage: {
          h5_used: 0,
          h5_limit: 1000000,
          weekly_used: 0,
          weekly_limit: 2000000,
          monthly_used: 0,
          monthly_limit: null,
        },
        checkin: { checked_in_today: false },
        daily_usage: [],
        recent_usage: [],
      },
      "/api/keys": { keys: [] },
      "/api/models": { models: [model] },
      "/api/model-square": {
        total: 1,
        available: 0,
        models: [{ ...model, available_now: false, tiers: ["standard"] }],
      },
      "/api/usage": { logs: [] },
    }
    const methods: string[] = []
    await context.route(`${PMPLAN_WEB_ORIGIN}/**`, async (route) => {
      methods.push(route.request().method())
      const pathname = new URL(route.request().url()).pathname
      if (pathname === "/")
        await route.fulfill({
          contentType: "text/html",
          body: "<p>Console fixture</p>",
        })
      else await route.fulfill({ json: responses[pathname] ?? {} })
    })
    await expect(
      runPmplanProbe({ context, evidenceDir: directory }),
    ).resolves.toEqual({ ok: true })
    expect(context.pages()).toEqual([])
    expect(methods.every((method) => method === "GET")).toBe(true)
  } finally {
    vi.unstubAllEnvs()
    await browser.close()
    for (const file of await fs.readdir(directory))
      await fs.unlink(path.join(directory, file))
    await fs.rmdir(directory)
  }
})
