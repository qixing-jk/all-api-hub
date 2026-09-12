import { afterEach, describe, expect, it, vi } from "vitest"

import {
  readGithubGistRawFile,
  requestGithubGistJson,
} from "~/services/webdav/githubGistHttp"
import { CLOUD_SYNC_ERROR_CODES } from "~/types/cloudSync"

describe("GitHub Gist request deadlines", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    ["API", "fetch"],
    ["API", "body"],
    ["raw", "fetch"],
    ["raw", "body"],
  ])(
    "aborts a stalled %s %s and reports a network failure",
    async (kind, stage) => {
      vi.useFakeTimers()
      let signal: AbortSignal | undefined
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url, init) => {
          signal = init.signal
          const stalled = () =>
            new Promise<never>((_resolve, reject) => {
              signal!.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true },
              )
            })
          if (stage === "fetch") return stalled()
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: stalled,
            text: stalled,
          }
        }),
      )
      const request =
        kind === "API"
          ? requestGithubGistJson({ path: "/gists/test", token: "test-token" })
          : readGithubGistRawFile(
              "https://gist.githubusercontent.com/test/raw/file",
              "test-token",
            )
      const rejected = expect(request).rejects.toMatchObject({
        code: CLOUD_SYNC_ERROR_CODES.NETWORK,
      })
      await vi.advanceTimersByTimeAsync(30_000)
      await rejected
      expect(signal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("clears the deadline after a successful request", async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"id":"gist"}')),
    )
    await expect(
      requestGithubGistJson({ path: "/gists/test", token: "test-token" }),
    ).resolves.toEqual({ id: "gist" })
    expect(vi.getTimerCount()).toBe(0)
  })
})
