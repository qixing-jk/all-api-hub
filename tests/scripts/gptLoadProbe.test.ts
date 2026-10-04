import { afterEach, describe, expect, it, vi } from "vitest"

// @ts-expect-error This Node-only CLI module has no TypeScript declarations.
import { runGptLoadProbe } from "~~/scripts/suites/gpt-load/probe.mjs"

const options = {
  baseUrl: "https://probe.example.invalid",
  managementKey: "fake-key",
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status })

afterEach(() => vi.unstubAllGlobals())

describe("gpt-load protocol probe", () => {
  it.each([
    [500, { items: [] }, { pagination: { total_items: 0 } }],
    [200, {}, { pagination: { total_items: 0 } }],
    [200, { items: [] }, {}],
  ])(
    "rejects unavailable or malformed inventory (%s)",
    async (status, catalog, groups) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(response({ principal_type: "admin" }))
          .mockResolvedValueOnce(response(catalog, status))
          .mockResolvedValueOnce(response(groups)),
      )
      expect(await runGptLoadProbe(options)).toMatchObject({ ok: false })
    },
  )

  it.each(["mismatch", "throw"])(
    "cleans up after a failed readback (%s)",
    async (failure) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response({ principal_type: "admin" }))
        .mockResolvedValueOnce(response({ items: [] }))
        .mockResolvedValueOnce(response({ pagination: { total_items: 0 } }))
        .mockResolvedValueOnce(response({ group_id: 123 }))
      if (failure === "throw")
        fetchMock.mockRejectedValueOnce(new Error("offline"))
      else fetchMock.mockResolvedValueOnce(response({ name: "wrong" }))
      fetchMock.mockResolvedValueOnce(response({}))
      vi.stubGlobal("fetch", fetchMock)
      try {
        expect(
          await runGptLoadProbe({ ...options, allowWrite: true }),
        ).toMatchObject({ ok: false })
      } catch (error) {
        expect(error).toMatchObject({ message: "offline" })
      }
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${options.baseUrl}/api/groups/123`,
        expect.objectContaining({ method: "DELETE" }),
      )
    },
  )
})
