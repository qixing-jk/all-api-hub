import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

/** Run the scripts' real finalizers without starting a browser or live writes. */
function runFinalizer(file: string, context: Record<string, unknown>) {
  const source = readFileSync(`scripts/${file}`, "utf8").replace(/\r\n/g, "\n")
  const start = source.lastIndexOf("} finally {") + "} finally {".length
  const end =
    file === "test-daya-e2e-live.mjs"
      ? source.indexOf("\n}\n\nasync function assertEventually", start)
      : source.lastIndexOf("\n}")
  return runInNewContext(
    `(async () => { try { throw originalError } finally { ${source.slice(start, end)} } })()`,
    { assert, path, console: { log: vi.fn() }, Date, ...context },
  )
}

describe("Daya live runner cleanup", () => {
  it("records successful editor inventory restoration and closes all resources", async () => {
    const originalError = new Error("workflow failed")
    const evidence = { cleanup: {} as Record<string, unknown> }
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const remove = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ code: 0 }) })
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          { id: 1, name: "existing" },
          { id: 2, name: "owned" },
        ],
      })
      .mockResolvedValueOnce({ items: [{ id: 1 }] })
    const process = { exitCode: 0 }
    await expect(
      runFinalizer("test-daya-key-editor-e2e-live.mjs", {
        originalError,
        evidence,
        fs: { writeFile },
        ui: { close },
        site: { close },
        dev: { close, context: { request: { delete: remove } } },
        process,
        mutate: true,
        originalIds: [1],
        runName: "owned",
        origin: "https://example.test",
        dir: "evidence",
        read,
      }),
    ).rejects.toBe(originalError)
    expect(remove).toHaveBeenCalledWith("https://example.test/api/v1/keys/2")
    expect(evidence.cleanup).toEqual({ originalInventoryRestored: true })
    expect(close).toHaveBeenCalledTimes(3)
    expect(writeFile).toHaveBeenCalled()
    expect(process.exitCode).toBe(0)
  })
  it.each(["read", "delete", "inventory"])(
    "preserves the editor failure, evidence and teardown when %s cleanup fails",
    async (failure) => {
      const originalError = new Error("editor workflow failed")
      const evidence = { cleanup: {} as Record<string, unknown> }
      const writeFile = vi.fn().mockResolvedValue(undefined)
      const ui = {
        close: vi.fn().mockRejectedValue(new Error("page already gone")),
      }
      const site = { close: vi.fn().mockResolvedValue(undefined) }
      const dev = {
        context: {
          request: {
            delete: vi.fn().mockRejectedValue(new Error("delete failed")),
          },
        },
        close: vi.fn().mockResolvedValue(undefined),
      }
      const process = { exitCode: 0 }
      await expect(
        runFinalizer("test-daya-key-editor-e2e-live.mjs", {
          originalError,
          evidence,
          fs: { writeFile },
          ui,
          site,
          dev,
          process,
          mutate: true,
          originalIds: [1],
          runName: "owned",
          origin: "https://example.test",
          dir: "evidence",
          read: async () => {
            if (failure === "read") throw new Error("inventory unavailable")
            return {
              items: [
                { id: 2, name: failure === "delete" ? "owned" : "unrelated" },
              ],
            }
          },
        }),
      ).rejects.toBe(originalError)
      expect(evidence.cleanup.error).toBeTruthy()
      expect(writeFile).toHaveBeenCalledWith(
        path.join("evidence", "evidence.json"),
        expect.any(String),
      )
      expect(ui.close).toHaveBeenCalled()
      expect(site.close).toHaveBeenCalled()
      expect(dev.close).toHaveBeenCalled()
      expect(process.exitCode).toBe(1)
    },
  )

  it("removes the temporary account even if key cleanup fails and preserves the test error", async () => {
    const originalError = new Error("workflow failed")
    const evidence = { cleanup: {} as Record<string, unknown> }
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const evaluate = vi.fn().mockResolvedValue(undefined)
    const ui = { close: vi.fn().mockResolvedValue(undefined) }
    const site = { close: vi.fn().mockResolvedValue(undefined) }
    const dev = {
      serviceWorker: { evaluate },
      close: vi.fn().mockResolvedValue(undefined),
    }
    const process = { exitCode: 0 }
    await expect(
      runFinalizer("test-daya-e2e-live.mjs", {
        originalError,
        evidence,
        fs: { writeFile },
        ui,
        site,
        dev,
        process,
        createdKeyName: "disposable",
        createdKeyId: 12,
        accountId: "temporary",
        accountName: "temporary account",
        stored: async () => [],
        request: async () => {
          throw new Error("key service unavailable")
        },
        checkinPage: undefined,
        succeeded: false,
        evidenceDir: "evidence",
        extensionId: "dev",
      }),
    ).rejects.toBe(originalError)
    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), "temporary")
    expect(evidence.cleanup.removedTemporaryAccount).toBe(true)
    expect(evidence.cleanup.error).toContain("key service unavailable")
    expect(writeFile).toHaveBeenCalled()
    expect(dev.close).toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
