import type { Page, Response } from "@playwright/test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { withGithubGistCleanup } from "~~/e2e/utils/realSite/githubGistCleanup"

/** Emit creation responses independently of UI assertions and response-body timing. */
function createPage() {
  let listener: ((response: Response) => void) | undefined
  const page = {
    on: vi.fn((_event, handler) => {
      listener = handler
    }),
    off: vi.fn(() => {
      listener = undefined
    }),
  } as unknown as Page
  return {
    page,
    respond: (body: Promise<unknown>, method = "POST", ok = true) => {
      listener?.({
        url: () => "https://api.github.com/gists",
        request: () => ({ method: () => method }),
        ok: () => ok,
        json: () => body,
      } as unknown as Response)
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("Gist real-site resource cleanup", () => {
  it("cleans a created resource when the UI fails before showing its link", async () => {
    const { page, respond } = createPage()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 204 })
      .mockResolvedValueOnce({ status: 404 })
    vi.stubGlobal("fetch", fetchMock)
    const failure = new Error("UI readback failed")
    await expect(
      withGithubGistCleanup(page, "secret-token", async () => {
        respond(Promise.resolve({ id: "created-id" }))
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/gists/created-id",
      expect.objectContaining({ method: "DELETE" }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(page.off).toHaveBeenCalledWith("response", expect.any(Function))
  })

  it("awaits delayed response bodies before cleanup", async () => {
    const { page, respond } = createPage()
    const fetchMock = vi.fn().mockResolvedValue({ status: 404 })
    vi.stubGlobal("fetch", fetchMock)
    let resolveBody!: (body: unknown) => void
    const body = new Promise((resolve) => {
      resolveBody = resolve
    })
    const result = withGithubGistCleanup(page, "token", async () => {
      respond(body)
    })
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    resolveBody({ id: "delayed-id" })
    await result
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("accepts verified deletion after losing the DELETE response", async () => {
    const { page, respond } = createPage()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockResolvedValueOnce({ status: 404 })
    vi.stubGlobal("fetch", fetchMock)
    await withGithubGistCleanup(page, "token", async () => {
      respond(Promise.resolve({ id: "created-id" }))
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("reports failed cleanup alongside the original failure after bounded retries", async () => {
    const { page, respond } = createPage()
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 })
    vi.stubGlobal("fetch", fetchMock)
    const failure = new Error("original failure")
    const error = await withGithubGistCleanup(page, "token", async () => {
      respond(Promise.resolve({ id: "created-id" }))
      throw failure
    }).catch((error) => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0]).toBe(failure)
    expect(error.errors[1].message).toContain("Could not verify cleanup")
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it("ignores reads and unsuccessful creation responses", async () => {
    const { page, respond } = createPage()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await withGithubGistCleanup(page, "token", async () => {
      respond(Promise.resolve({ id: "existing-id" }), "GET")
      respond(Promise.resolve({ id: "uncreated-id" }), "POST", false)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports missing cleanup IDs without deleting an unknown resource", async () => {
    const { page, respond } = createPage()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      withGithubGistCleanup(page, "token", async () => {
        respond(Promise.resolve({ id: "../unrelated" }))
      }),
    ).rejects.toThrow("Could not capture")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
