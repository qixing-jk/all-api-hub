import { afterEach, expect, it, vi } from "vitest"

import { chromiumAdapter } from "~~/scripts/mobile/adapters.mjs"

const transport = vi.hoisted(() => ({ connectCdp: vi.fn() }))
vi.mock("~~/scripts/mobile/protocol.mjs", () => transport)
afterEach(() => vi.unstubAllGlobals())

it("captures browser security errors as well as JavaScript console output", async () => {
  const listeners = new Set<(event: unknown) => void>()
  const request = vi.fn(async (method: string) => {
    if (method === "Log.enable")
      listeners.forEach((listener) =>
        listener({
          method: "Log.entryAdded",
          params: { entry: { source: "security", text: "CSP blocked script" } },
        }),
      )
    return {}
  })
  const close = vi.fn()
  transport.connectCdp.mockResolvedValue({
    request,
    close,
    onEvent: (listener: (event: unknown) => void) => listeners.add(listener),
  })
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "page",
          type: "page",
          url: "chrome-extension://dev/options.html",
          webSocketDebuggerUrl: "ws://localhost/page",
        },
      ],
    })),
  )
  const adapter = await chromiumAdapter({ base: "http://localhost" } as never, {
    extensionId: "dev",
  })
  const target = adapter.targets[0]
  if (!target) throw new Error("No test target")
  const events: unknown[] = []
  await adapter.logs(target, (event) => events.push(event), 1)
  expect(events).toEqual([
    {
      method: "Log.entryAdded",
      params: { entry: { source: "security", text: "CSP blocked script" } },
    },
  ])
  expect(close).toHaveBeenCalled()
})
