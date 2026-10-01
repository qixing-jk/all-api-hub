import { afterEach, describe, expect, it, vi } from "vitest"

import { runKimiProbe } from "~~/scripts/suites/kimi/probe.mjs"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Kimi protocol probe", () => {
  it.each([false, true])(
    "does not claim cleanup when deletion fails (HTTP succeeds=%s)",
    async (ok) => {
      vi.spyOn(console, "log").mockImplementation(() => {})
      const bodies = [
        {
          code: 0,
          data: {
            uid: "user",
            organizations: [{ organization: { id: "org" } }],
          },
        },
        { code: 0, data: { cur: 1, today_consume: 0 } },
        {
          code: 0,
          data: [{ id: "project", name: "Default", is_default: true }],
        },
        { code: 0, data: { key: "key", auth: "sk-created" } },
        { code: 0, data: [{ key: "key" }] },
        { code: 403, message: "denied" },
      ]
      const fetchMock = vi.fn()
      bodies.forEach((body, index) =>
        fetchMock.mockResolvedValueOnce({
          ok: index === 5 ? ok : true,
          status: index === 5 && !ok ? 403 : 200,
          json: async () => body,
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(runKimiProbe({ token: "session" })).rejects.toThrow()
      expect(console.log).not.toHaveBeenCalledWith(
        "  - 临时测试密钥已及时清理删除。",
      )
    },
  )
})
