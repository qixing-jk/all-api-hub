import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { resolveConfig } from "vite"
import { expect, it, vi } from "vitest"

it("resolves the WXT React plugin without deprecated optimizer options", async () => {
  const require = createRequire(import.meta.resolve("@wxt-dev/module-react"))
  const { default: react } = await import(
    /* @vite-ignore */ pathToFileURL(require.resolve("@vitejs/plugin-react"))
      .href
  )
  const warn = vi.spyOn(console, "warn")
  try {
    await resolveConfig({ configFile: false, plugins: [react()] }, "serve")
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes("optimizeDeps.rollupOptions"),
      ),
    ).toEqual([])
  } finally {
    warn.mockRestore()
  }
})
