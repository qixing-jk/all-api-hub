import { expect, it, vi } from "vitest"

import { firefoxAdapter, selectTarget } from "~~/scripts/mobile/adapters.mjs"

const transport = vi.hoisted(() => ({ connectRdp: vi.fn() }))
vi.mock("~~/scripts/mobile/protocol.mjs", () => transport)

it("awaits Firefox promise expressions and reports rejected evaluations", async () => {
  const listeners = new Set<(event: unknown) => void>()
  const send = (event: unknown) =>
    listeners.forEach((listener) => listener(event))
  const request = vi.fn(
    async (_actor: string, type: string, _options?: unknown) => {
      if (type === "listAddons")
        return { addons: [{ id: "dev", actor: "addon" }] }
      if (type === "getWatcher") return { actor: "watcher" }
      if (type === "watchTargets") {
        send({
          from: "watcher",
          type: "target-available-form",
          target: {
            url: "moz-extension://dev/background.js",
            actor: "frame",
            consoleActor: "console",
          },
        })
        return {}
      }
      if (type === "evaluateJSAsync") {
        send({
          from: "console",
          type: "evaluationResult",
          resultID: "result",
          topLevelAwaitRejected: true,
        })
        return { resultID: "result" }
      }
      if (type === "startListeners") {
        send({
          from: "console",
          type: "consoleAPICall",
          message: { arguments: ["marker"] },
        })
        send({ from: "unrelated", type: "consoleAPICall", message: {} })
      }
      return {}
    },
  )
  transport.connectRdp.mockResolvedValue({
    request,
    onEvent: (listener: (event: unknown) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: vi.fn(),
  })
  const adapter = await firefoxAdapter({ port: 1234 } as never, {
    extensionId: "dev",
  })
  try {
    const target = selectTarget(adapter.targets)
    await expect(
      adapter.evaluate(target, "Promise.reject('failed')"),
    ).rejects.toThrow("Firefox evaluation failed")
    expect(request).toHaveBeenCalledWith(
      "console",
      "evaluateJSAsync",
      expect.objectContaining({ mapped: { await: true }, eager: false }),
    )
    const events: unknown[] = []
    await adapter.logs(target, (event) => events.push(event), 1)
    expect(events).toHaveLength(1)
    expect(request).toHaveBeenCalledWith("console", "stopListeners", {
      listeners: ["ConsoleAPI", "PageError"],
    })
  } finally {
    adapter.close()
  }
})
