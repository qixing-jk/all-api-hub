import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium } from "@playwright/test"
import { expect, it, vi } from "vitest"

import {
  PMPLAN_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  readPmplanAnnouncementStatus,
  requirePmplanAccount,
} from "~~/scripts/suites/pmplan/accountScope.mjs"
// @ts-expect-error Node-only live suite does not have declarations.
import { runPmplanPricing } from "~~/scripts/suites/pmplan/pricing.mjs"
// @ts-expect-error Node-only live suite does not have declarations.
import { runPmplanUpstream } from "~~/scripts/suites/pmplan/upstream.mjs"

const hostedAccount = {
  id: "hosted-account",
  site_type: SITE_TYPES.PMPLAN,
  site_url: `${PMPLAN_WEB_ORIGIN}/#/keys`,
  account_info: { id: 661 },
}

it("enforces the configured native identity before selecting any saved account", () => {
  vi.stubEnv("PMPLAN_USER_ID", "662")
  try {
    expect(() => requirePmplanAccount([hostedAccount], "661")).toThrow(
      /identity/,
    )
  } finally {
    vi.unstubAllEnvs()
  }
})

it("selects the hosted account among same-ID deployments and ignores invalid addresses", () => {
  expect(
    requirePmplanAccount(
      [
        {
          ...hostedAccount,
          id: "self-hosted",
          site_url: "https://self-hosted.example",
        },
        { ...hostedAccount, site_url: "invalid" },
        { ...hostedAccount, site_url: "https://user:secret@plan.pmcat.top" },
        { ...hostedAccount, account_info: { id: 662 } },
        { ...hostedAccount, site_type: SITE_TYPES.NEW_API },
        hostedAccount,
      ],
      "661",
    ),
  ).toEqual(hostedAccount)
})

it.each([
  { accounts: [] },
  { accounts: [hostedAccount, { ...hostedAccount, id: "duplicate" }] },
])(
  "requires a single matching account instead of choosing an arbitrary record",
  ({ accounts }) =>
    expect(() => requirePmplanAccount(accounts, 661)).toThrow(/exactly one/),
)

it("reads notices only for the selected account and deployment", async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const selected = {
      siteType: SITE_TYPES.PMPLAN,
      sourceScope: "account",
      accountId: hostedAccount.id,
      baseUrl: PMPLAN_WEB_ORIGIN,
      status: "error",
      lastCheckedAt: 42,
    }
    await page.evaluate(
      (sites) => {
        Object.defineProperty(globalThis, "chrome", {
          value: {
            storage: {
              local: {
                get: async (key: string) => ({
                  [key]: JSON.stringify({ sites }),
                }),
              },
            },
          },
        })
      },
      {
        otherAccount: {
          ...selected,
          accountId: "another-account",
          status: "success",
        },
        otherDeployment: {
          ...selected,
          baseUrl: "https://self-hosted.example",
          status: "success",
        },
        selected,
      },
    )
    expect(await readPmplanAnnouncementStatus(page, hostedAccount)).toEqual({
      status: "error",
      lastCheckedAt: 42,
    })
    expect(
      await readPmplanAnnouncementStatus(page, {
        ...hostedAccount,
        id: "missing",
      }),
    ).toBeUndefined()
  } finally {
    await browser.close()
  }
})

it.each([
  ["pricing", runPmplanPricing],
  ["upstream", runPmplanUpstream],
])(
  "%s rejects another deployment's same-ID account before UI work",
  async (_name, run) => {
    const browser = await chromium.launch({ headless: true })
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pmplan-scope-"))
    try {
      const context = await browser.newContext()
      const serviceWorker = await context.newPage()
      await serviceWorker.evaluate((siteType) => {
        Object.defineProperty(globalThis, "chrome", {
          value: {
            storage: {
              local: {
                get: async () => ({
                  site_accounts: {
                    accounts: [
                      {
                        id: "different-deployment",
                        site_type: siteType,
                        site_url: "https://self-hosted.example",
                        account_info: { id: 661 },
                      },
                    ],
                  },
                }),
              },
            },
          },
        })
      }, SITE_TYPES.PMPLAN)
      const methods: string[] = []
      const free = {
        name: "free",
        input_micro: 0,
        output_micro: 0,
        channel_count: 1,
      }
      const paid = { ...free, name: "paid", input_micro: 1, output_micro: 2 }
      const restricted = { ...paid, name: "restricted" }
      await context.route(`${PMPLAN_WEB_ORIGIN}/**`, async (route) => {
        methods.push(route.request().method())
        const pathname = new URL(route.request().url()).pathname
        const responses: Record<string, unknown> = {
          "/api/me": { user: { id: 661 } },
          "/api/keys": { keys: [] },
          "/api/models": { models: [free, paid] },
          "/api/model-square": { models: [free, paid, restricted], total: 3 },
        }
        if (pathname === "/")
          await route.fulfill({
            contentType: "text/html",
            body: "<p>Console fixture</p>",
          })
        else await route.fulfill({ json: responses[pathname] ?? {} })
      })
      await expect(
        run({
          context,
          serviceWorker,
          extensionId: "fixture",
          evidenceDir: directory,
          write: true,
        }),
      ).rejects.toThrow(/PM-Plan account.*(deployment|console)/)
      expect(methods.every((method) => method === "GET")).toBe(true)
      expect(context.pages()).toEqual([serviceWorker])
    } finally {
      await browser.close()
      for (const file of await fs.readdir(directory))
        await fs.unlink(path.join(directory, file))
      await fs.rmdir(directory)
    }
  },
)
