import path from "node:path"
import { pathToFileURL } from "node:url"
import { expect, it, vi } from "vitest"

const { waitForDocPageReady } = await import(
  pathToFileURL(path.resolve("scripts/doc-screenshot-readiness.mjs")).href
)

it("propagates a browser readiness timeout rather than allowing capture", async () => {
  const waitForFunction = vi
    .fn()
    .mockRejectedValue(new Error("page still pending"))
  await expect(
    waitForDocPageReady({ waitForFunction }, { timeout: 500 }),
  ).rejects.toThrow("page still pending")
})

it("passes the timeout as Playwright options rather than as the browser predicate argument", async () => {
  const waitForFunction = vi.fn().mockResolvedValue(undefined)
  await waitForDocPageReady({ waitForFunction }, { timeout: 500 })
  expect(waitForFunction).toHaveBeenCalledWith(
    expect.any(Function),
    undefined,
    { timeout: 500 },
  )
})
