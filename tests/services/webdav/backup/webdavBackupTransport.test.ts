import { afterEach, describe, expect, it, vi } from "vitest"

import { commitWebdavBackup } from "~/services/webdav/backup/webdavBackupTransport"

const targetUrl =
  "https://example.test/dav/all-api-hub-backup/all-api-hub-1-0.json"
const content = '{"version":"4.0","accounts":{"accounts":[]}}'
const previousContent =
  '{"version":"4.0","accounts":{"accounts":[{"id":"previous"}]}}'

/** Build DAV resource statuses without relying on a DOM in the worker tests. */
function multistatus(status: number) {
  return new Response(
    `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${targetUrl}</d:href><d:status>HTTP/1.1 ${status} Result</d:status></d:response></d:multistatus>`,
    { status: 207 },
  )
}

/** Simulate stored files independently from the client's reported upload result. */
function createGateway(
  override?: (request: {
    url: string
    method: string
    files: Map<string, string>
    body: string
  }) => Response | Promise<Response> | undefined,
) {
  const files = new Map([[targetUrl, previousContent]])
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      const body = String(init?.body ?? "")
      const overridden = await override?.({ url, method, files, body })
      if (overridden) return overridden

      switch (method) {
        case "MKCOL":
          return new Response(null, { status: 405 })
        case "PROPFIND":
          return new Response(null, { status: 405 })
        case "PUT":
          files.set(url, body)
          return new Response(null, { status: 201 })
        case "GET":
          return new Response(files.get(url) ?? "", {
            status: files.has(url) ? 200 : 404,
          })
        case "DELETE":
          files.delete(url)
          return new Response(null, { status: 204 })
        case "MOVE": {
          files.set(targetUrl, files.get(url)!)
          files.delete(url)
          return new Response(null, { status: 201 })
        }
        default:
          throw new Error(`Unexpected method ${method}`)
      }
    },
  )
  vi.stubGlobal("fetch", fetch)
  return {
    files,
    fetch,
    requests: (method: string, url?: string) =>
      fetch.mock.calls.filter(
        ([input, init]) =>
          init?.method === method &&
          (url === undefined || String(input) === url),
      ),
    tempFiles: () =>
      [...files.entries()].filter(([url]) => url.includes(".tmp.")),
  }
}

const upload = () =>
  commitWebdavBackup({ targetUrl, username: "test", password: "test", content })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("WebDAV verified commit", () => {
  it("bounds final-file post-processing retries and keeps the recovery copy", async () => {
    vi.useFakeTimers()
    const gateway = createGateway(({ url, method }) => {
      if (method === "MOVE") return new Response(null, { status: 405 })
      if (method === "GET" && url === targetUrl)
        return new Response(null, { status: 425 })
    })
    const result = expect(upload()).rejects.toThrow(
      "messages:webdav.uploadStillProcessing",
    )
    await vi.runAllTimersAsync()
    await result
    expect(gateway.requests("GET", targetUrl)).toHaveLength(10)
    expect(gateway.requests("PUT", targetUrl)).toHaveLength(1)
    expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
  })

  it("requires final-file readback even when a MOVE 207 body cannot be read", async () => {
    const gateway = createGateway(({ method }) => {
      if (method !== "MOVE") return
      const response = multistatus(200)
      vi.spyOn(response, "text").mockRejectedValue(
        new TypeError("body interrupted"),
      )
      return response
    })
    await expect(upload()).rejects.toMatchObject({ statusCode: 207 })
    expect(gateway.requests("GET", targetUrl)).toHaveLength(1)
    expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
  })

  it("verifies the canonical file after a successful MOVE without using cached content", async () => {
    const gateway = createGateway()
    await expect(upload()).resolves.toBe(true)
    expect(gateway.files.get(targetUrl)).toBe(content)
    expect(gateway.requests("PUT", targetUrl)).toHaveLength(0)
    expect(gateway.requests("GET", targetUrl)).toEqual([
      [targetUrl, expect.objectContaining({ cache: "no-store" })],
    ])
  })

  it("rejects a successful MOVE acknowledgement that did not update the canonical file", async () => {
    const gateway = createGateway(({ method }) =>
      method === "MOVE" ? new Response(null, { status: 201 }) : undefined,
    )
    await expect(upload()).rejects.toThrow(
      "messages:webdav.uploadVerificationFailed",
    )
    expect(gateway.files.get(targetUrl)).toBe(previousContent)
    expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
  })

  it.each([405, 501])(
    "falls back from MOVE %s to PUT and verifies the canonical file",
    async (status) => {
      const gateway = createGateway(({ method }) =>
        method === "MOVE" ? new Response(null, { status }) : undefined,
      )
      await expect(upload()).resolves.toBe(true)
      expect(gateway.files.get(targetUrl)).toBe(content)
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(1)
      expect(gateway.requests("DELETE", targetUrl)).toHaveLength(0)
      expect(gateway.requests("GET", targetUrl).length).toBeGreaterThan(0)
      await vi.waitFor(() => expect(gateway.tempFiles()).toEqual([]))
    },
  )

  it.each([401, 403, 412])(
    "does not bypass MOVE %s even when the canonical file matches",
    async (status) => {
      const gateway = createGateway(({ method, files }) => {
        if (method !== "MOVE") return
        files.set(targetUrl, content)
        return new Response(null, { status })
      })
      await expect(upload()).rejects.toMatchObject({ statusCode: status })
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(0)
      expect(gateway.requests("DELETE", targetUrl)).toHaveLength(0)
    },
  )

  it.each([401, 403, 412])(
    "honors terminal resource status %s inside MOVE 207",
    async (status) => {
      const gateway = createGateway(({ method, files }) => {
        if (method !== "MOVE") return
        files.set(targetUrl, content)
        return multistatus(status)
      })
      await expect(upload()).rejects.toMatchObject({ statusCode: status })
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(0)
    },
  )

  it.each([405, 500])(
    "does not infer success or trigger a write fallback from MOVE 207 with resource status %s",
    async (status) => {
      const gateway = createGateway(({ method }) =>
        method === "MOVE" ? multistatus(status) : undefined,
      )
      await expect(upload()).rejects.toMatchObject({ statusCode: 207 })
      expect(gateway.files.get(targetUrl)).toBe(previousContent)
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(0)
      expect(gateway.requests("DELETE", targetUrl)).toHaveLength(0)
      expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
    },
  )

  it.each([
    "",
    "<invalid>",
    '<multistatus xmlns="DAV:"><response><status>HTTP/1.1 200 OK</status></response></multistatus>',
  ])(
    "does not trust ambiguous MOVE 207 without matching canonical data: %s",
    async (body) => {
      createGateway(({ method }) =>
        method === "MOVE" ? new Response(body, { status: 207 }) : undefined,
      )
      await expect(upload()).rejects.toMatchObject({ statusCode: 207 })
    },
  )

  it.each([207, 404, 500, 502, "network"] as const)(
    "reconciles an applied MOVE with an ambiguous %s response before further writes",
    async (status) => {
      const gateway = createGateway(({ method, files }) => {
        if (method !== "MOVE") return
        files.set(targetUrl, content)
        if (status === "network") throw new TypeError("response lost")
        return status === 207
          ? multistatus(200)
          : new Response(null, { status })
      })
      await expect(upload()).resolves.toBe(true)
      expect(gateway.requests("MOVE")).toHaveLength(1)
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(0)
      expect(gateway.requests("DELETE", targetUrl)).toHaveLength(0)
    },
  )

  it.each([404, 502, "network"] as const)(
    "preserves the verified temporary file when MOVE %s cannot be reconciled",
    async (status) => {
      const gateway = createGateway(({ method }) => {
        if (method !== "MOVE") return
        if (status === "network") throw new TypeError("response lost")
        return new Response(null, { status })
      })
      await expect(upload()).rejects.toBeInstanceOf(Error)
      expect(gateway.files.get(targetUrl)).toBe(previousContent)
      expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(0)
    },
  )

  it.each([409, 500])(
    "retains the existing overwrite MOVE %s workaround and verifies its result",
    async (status) => {
      let attempts = 0
      const gateway = createGateway(({ method }) =>
        method === "MOVE" && attempts++ === 0
          ? new Response(null, { status })
          : undefined,
      )
      await expect(upload()).resolves.toBe(true)
      expect(gateway.requests("MOVE")).toHaveLength(2)
      expect(gateway.requests("DELETE", targetUrl)).toHaveLength(1)
      expect(gateway.files.get(targetUrl)).toBe(content)
      expect(gateway.requests("GET", targetUrl).length).toBeGreaterThan(0)
    },
  )

  it.each([403, 503])(
    "does not delete the destination when overwrite reconciliation cannot read it (%s)",
    async (status) => {
      const gateway = createGateway(({ method, url }) => {
        if (method === "MOVE") return new Response(null, { status: 500 })
        if (method === "GET" && url === targetUrl)
          return new Response(null, { status })
      })
      await expect(upload()).rejects.toBeInstanceOf(Error)
      expect(gateway.requests("DELETE", targetUrl)).toHaveLength(0)
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(0)
      expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
    },
  )

  it("preserves the verified temporary file when the retry fails after deleting the old backup", async () => {
    let attempts = 0
    const gateway = createGateway(({ method }) =>
      method === "MOVE"
        ? new Response(null, { status: attempts++ === 0 ? 409 : 502 })
        : undefined,
    )
    await expect(upload()).rejects.toMatchObject({ statusCode: 502 })
    expect(gateway.files.has(targetUrl)).toBe(false)
    expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
  })

  it("does not retry MOVE when DELETE 207 leaves the old destination in place", async () => {
    const gateway = createGateway(({ url, method }) => {
      if (method === "MOVE") return new Response(null, { status: 409 })
      if (method === "DELETE" && url === targetUrl) return multistatus(500)
    })
    await expect(upload()).rejects.toMatchObject({ statusCode: 207 })
    expect(gateway.requests("MOVE")).toHaveLength(1)
    expect(gateway.files.get(targetUrl)).toBe(previousContent)
  })

  it("reconciles DELETE 207 by checking that the destination is absent before retrying MOVE", async () => {
    let attempts = 0
    const gateway = createGateway(({ url, method, files }) => {
      if (method === "MOVE" && attempts++ === 0)
        return new Response(null, { status: 409 })
      if (method === "DELETE" && url === targetUrl) {
        files.delete(url)
        return multistatus(204)
      }
    })
    await expect(upload()).resolves.toBe(true)
    expect(gateway.files.get(targetUrl)).toBe(content)
  })

  it.each([207, 500, "network"] as const)(
    "reconciles a direct PUT with an ambiguous %s response using the stored payload",
    async (status) => {
      const gateway = createGateway(({ url, method, files, body }) => {
        if (method === "MOVE") return new Response(null, { status: 405 })
        if (method !== "PUT" || url !== targetUrl) return
        files.set(url, body)
        if (status === "network") throw new TypeError("response lost")
        return status === 207
          ? multistatus(200)
          : new Response(null, { status })
      })
      await expect(upload()).resolves.toBe(true)
      expect(gateway.files.get(targetUrl)).toBe(content)
      expect(gateway.requests("PUT", targetUrl)).toHaveLength(1)
    },
  )

  it.each(["mismatch", "network", 403] as const)(
    "fails when direct PUT cannot be verified: %s",
    async (failure) => {
      const gateway = createGateway(({ url, method }) => {
        if (method === "MOVE") return new Response(null, { status: 405 })
        if (method === "PUT" && url === targetUrl) {
          if (failure === "network") throw new TypeError("upload interrupted")
          return new Response(null, {
            status: failure === "mismatch" ? 201 : failure,
          })
        }
      })
      await expect(upload()).rejects.toBeInstanceOf(Error)
      expect(gateway.files.get(targetUrl)).toBe(previousContent)
      expect(gateway.tempFiles().map(([, value]) => value)).toEqual([content])
    },
  )

  it.each([405, "network", "pending"] as const)(
    "does not delay or fail a verified direct upload for cleanup failure: %s",
    async (failure) => {
      const gateway = createGateway(({ method }) => {
        if (method === "MOVE") return new Response(null, { status: 405 })
        if (method !== "DELETE") return
        if (failure === "network") throw new TypeError("cleanup failed")
        if (failure === "pending") return new Promise<Response>(() => {})
        return new Response(null, { status: failure })
      })
      await expect(upload()).resolves.toBe(true)
      expect(gateway.files.get(targetUrl)).toBe(content)
    },
  )

  it("deletes an unverified temporary payload and leaves the canonical file untouched", async () => {
    const gateway = createGateway(({ url, method }) =>
      method === "GET" && url !== targetUrl
        ? new Response("truncated", { status: 200 })
        : undefined,
    )
    await expect(upload()).rejects.toThrow(
      "messages:webdav.uploadVerificationFailed",
    )
    expect(gateway.requests("MOVE")).toHaveLength(0)
    expect(gateway.tempFiles()).toEqual([])
    expect(gateway.files.get(targetUrl)).toBe(previousContent)
  })
})
