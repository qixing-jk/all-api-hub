import { runInNewContext } from "node:vm"
import { expect, it, vi } from "vitest"

import { runDevUi } from "~~/scripts/mobile/dev-ui.mjs"

it("temporarily enables CSP bypass for a verified dev page and restores it", async () => {
  const request = vi.fn(
    async (method: string, params?: Record<string, unknown>) =>
      method === "Runtime.evaluate"
        ? {
            result: {
              result: {
                value: runInNewContext(String(params?.expression), {
                  URL,
                  chrome: {
                    runtime: {
                      getManifest: () => ({ name: "All API Hub (dev) temp6" }),
                    },
                  },
                  document: {
                    scripts: [{ src: "http://127.0.0.1:52158/@vite/client" }],
                  },
                }),
              },
            },
          }
        : {},
  )
  const emit = vi.fn()
  await runDevUi({ request }, emit, 1)
  expect(request).toHaveBeenCalledWith("Page.setBypassCSP", { enabled: true })
  expect(request).toHaveBeenCalledWith("Page.reload")
  expect(request).toHaveBeenLastCalledWith("Page.setBypassCSP", {
    enabled: false,
  })
  expect(emit).toHaveBeenCalledWith({
    status: "dev-ui-connected",
    cspBypass: "session-only",
  })
})

it("rejects a release page before changing CSP", async () => {
  const request = vi.fn(async () => ({ result: { result: { value: false } } }))
  await expect(runDevUi({ request }, vi.fn(), 1)).rejects.toThrow(
    "WXT dev page",
  )
  expect(request).toHaveBeenCalledTimes(1)
})
