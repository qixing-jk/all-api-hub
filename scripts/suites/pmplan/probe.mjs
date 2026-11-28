import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"
import { PMPLAN_WEB_ORIGIN as origin } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import {
  preflightSession,
  probePageSession,
} from "../../cdp/session-preflight.mjs"

/** Probe native read routes and retain only response metadata, never raw bodies. */
export async function runPmplanProbe({ context, evidenceDir }) {
  const page = await context.newPage()
  return runScenarioWithCleanup({
    run: async () => {
      await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
      const preflight = await preflightSession({
        expectedIdentity: process.env.PMPLAN_USER_ID || undefined,
        probeTarget: () =>
          probePageSession(page, {
            endpoint: "/api/me",
            readIdentity: (body) =>
              Number.isSafeInteger(body.user?.id)
                ? String(body.user.id)
                : undefined,
          }),
      })
      assert.notEqual(
        preflight.status,
        "probe-failed",
        "PM-Plan login preflight: probe-failed",
      )
      if (preflight.status !== "ready")
        return {
          skipped: true,
          reason: `PM-Plan login preflight: ${preflight.status}`,
        }
      const reads = await page.evaluate(
        async (endpoints) => {
          const results = []
          for (const endpoint of endpoints) {
            const response = await fetch(endpoint, {
              credentials: "include",
              cache: "no-store",
              signal: AbortSignal.timeout(15000),
            })
            results.push({
              endpoint,
              status: response.status,
              body: await response.json(),
            })
          }
          return results
        },
        [
          "/api/bootstrap",
          "/api/me",
          "/api/keys",
          "/api/models",
          "/api/model-square",
          "/api/plans",
          "/api/usage?page=1",
          "/api/usage?page=2",
        ],
      )
      await fs.mkdir(evidenceDir, { recursive: true })
      await fs.writeFile(
        path.join(evidenceDir, "native-reads.json"),
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            preflight: { status: preflight.status },
            reads: reads.map(({ endpoint, status, body }) => ({
              endpoint,
              status,
              keyCount:
                endpoint === "/api/keys" && Array.isArray(body?.keys)
                  ? body.keys.length
                  : undefined,
              modelCount: Array.isArray(body?.models)
                ? body.models.length
                : undefined,
              logCount: Array.isArray(body?.logs)
                ? body.logs.length
                : undefined,
            })),
          },
          null,
          2,
        ),
      )
      reads.forEach((read) => assert.equal(read.status, 200, read.endpoint))
      const body = (endpoint) =>
        reads.find((read) => read.endpoint === endpoint).body
      const me = body("/api/me"),
        keys = body("/api/keys").keys,
        models = body("/api/models").models,
        square = body("/api/model-square")
      assert.equal(String(me.user.id), preflight.target.identity)
      assert.ok(
        Array.isArray(keys) &&
          keys.every(
            (key) =>
              Number.isSafeInteger(key.id) &&
              key.id > 0 &&
              typeof key.key_prefix === "string" &&
              !Object.hasOwn(key, "key"),
          ),
      )
      assert.ok(Array.isArray(models) && Array.isArray(square.models))
      assert.equal(
        square.available,
        square.models.filter((model) => model.available_now).length,
      )
      // /api/models checks access per channel; the square's merged tier map may
      // omit an unrestricted channel. Both endpoints still describe catalog models.
      const catalogNames = new Set(square.models.map((model) => model.name))
      assert.ok(
        models.every((model) => catalogNames.has(model.name)),
        "Account-available models must belong to the native catalog",
      )
      for (const scope of ["h5", "weekly", "monthly"]) {
        assert.ok(
          Number.isSafeInteger(me.usage[`${scope}_used`]) &&
            me.usage[`${scope}_used`] >= 0,
        )
        const cap = me.usage[`${scope}_limit`]
        assert.ok(cap === null || (Number.isSafeInteger(cap) && cap >= 0))
      }
      assert.equal(typeof me.checkin.checked_in_today, "boolean")
      assert.ok(Array.isArray(me.daily_usage) && Array.isArray(me.recent_usage))
      for (const endpoint of ["/api/usage?page=1", "/api/usage?page=2"])
        assert.ok(Array.isArray(body(endpoint).logs))
      return { ok: true }
    },
    finalizers: [() => page.close()],
    cleanupMessage: "PM-Plan probe cleanup failed",
    failureMessage: "PM-Plan probe and cleanup failed",
  })
}
