import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { expect, it } from "vitest"

it("retains API requests and runtime errors from page and worker probes", async () => {
  const source = readFileSync("scripts/test-emrank-e2e-live.mjs", "utf8")
  const start = source.indexOf("const readFetchProbe =")
  const end = source.indexOf("await ui.evaluate(installFetchProbe)", start)
  const entries = [
    { url: "https://emrank.tech/api/keys", status: 200 },
    { url: "https://emrank.tech/assets/app.js" },
    { error: "Script error" },
    { unhandled: "Rejected promise" },
  ]
  const target = { evaluate: async () => entries }
  const result = await runInNewContext(
    `${source.slice(start, end)}; readFetchProbe()`,
    { ui: target, dev: { serviceWorker: target } },
  )
  expect(result).toEqual({
    page: [entries[0], entries[2], entries[3]],
    worker: [entries[0], entries[2], entries[3]],
  })
})
