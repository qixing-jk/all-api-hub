import { mkdtempSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

import { runSafariSmoke } from "~~/e2e/safari/smoke.mjs"

it("records unavailable Safari as a failed check without running platform commands", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
  let calls = 0
  await expect(
    runSafariSmoke({
      platform: "win32",
      output,
      command: () => {
        calls++
        return ""
      },
    }),
  ).rejects.toThrow("macOS")
  expect(calls).toBe(0)
  expect(
    JSON.parse(readFileSync(path.join(output, "report.json"), "utf8")),
  ).toMatchObject({
    status: "failed",
    checks: [{ name: "macOS runtime", status: "failed" }],
  })
})
