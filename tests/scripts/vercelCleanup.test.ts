import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { expect, it, vi } from "vitest"

// Exercise the runner's real finalizer without starting a browser or live writes.
function finalize(overrides: Record<string, unknown> = {}) {
  const source = readFileSync(
    ".scratch/vercel-parity-audit/verify-workflows.mjs",
    "utf8",
  ).replace(/\r\n/g, "\n")
  const start = source.indexOf("\n} finally {") + "\n} finally {".length
  const api = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      payload: {
        apiKeys: [
          { id: "owned", name: "run-owned" },
          { id: "existing", name: "existing" },
        ],
      },
    })
    .mockResolvedValueOnce({ status: 204 })
    .mockResolvedValueOnce({
      status: 200,
      payload: { apiKeys: [{ id: "existing", name: "existing" }] },
    })
  const context = {
    assert,
    accountId: "account",
    disposableId: undefined,
    keyName: "run-owned",
    creationAttempted: true,
    result: { checks: [] },
    api,
    fs: { writeFile: vi.fn().mockResolvedValue(undefined) },
    out: "evidence",
    page: { close: vi.fn().mockResolvedValue(undefined) },
    browser: { close: vi.fn().mockResolvedValue(undefined) },
    process: { exitCode: 0, argv: [] },
    console: { log: vi.fn() },
    ...overrides,
  }
  return {
    context,
    run: () =>
      runInNewContext(
        `(async () => { ${source.slice(start, source.lastIndexOf("\n}"))} })()`,
        context,
      ),
  }
}

it("finds the run's disposable key after creation succeeds but its first read fails", async () => {
  const { context, run } = finalize()
  await run()
  expect(context.api).toHaveBeenCalledWith("/v1/api-keys/owned", "DELETE")
  expect(context.api).not.toHaveBeenCalledWith(
    "/v1/api-keys/existing",
    "DELETE",
  )
  expect(context.fs.writeFile).toHaveBeenCalled()
  expect(context.browser.close).toHaveBeenCalled()
})

it("retains cleanup failure evidence and closes the browser", async () => {
  const { context, run } = finalize({
    disposableId: "owned",
    api: vi.fn().mockRejectedValue(new Error("offline")),
  })
  await run()
  expect(context.result).toMatchObject({ cleanupError: "offline" })
  expect(context.fs.writeFile).toHaveBeenCalled()
  expect(context.browser.close).toHaveBeenCalled()
  expect(context.process.exitCode).toBe(1)
})

it("closes the browser even when evidence cannot be written", async () => {
  const { context, run } = finalize({
    creationAttempted: false,
    fs: { writeFile: vi.fn().mockRejectedValue(new Error("disk full")) },
  })
  await expect(run()).rejects.toThrow("disk full")
  expect(context.browser.close).toHaveBeenCalled()
})
