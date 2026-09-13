import * as uri from "fast-uri"
import { describe, expect, it, vi } from "vitest"

import { isValidProxyUrl } from "~/utils/core/proxyUrl"

vi.mock("fast-uri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fast-uri")>()
  return { ...actual, parse: vi.fn(actual.default.parse) }
})

describe("isValidProxyUrl", () => {
  it("returns a validation failure when the parser throws and recovers on the next call", () => {
    const parse = vi.mocked(uri.parse).mockImplementationOnce(() => {
      throw new Error("Parser failure")
    })
    try {
      expect(isValidProxyUrl("socks5h://proxy.example:1080")).toBe(false)
      expect(isValidProxyUrl("socks5h://proxy.example:1080")).toBe(true)
    } finally {
      parse.mockReset()
    }
  })

  it.each([
    "http://localhost:8080",
    "https://proxy.example",
    "socks5://127.0.0.1:1080",
    "socks5h://user:password@proxy.example:1080",
    "SOCKS5H://[::1]:1080",
    "socks5h://[2001:db8::1]:1080",
    "socks5h://代理.example:1080",
    " socks5h://proxy.example:1080 ",
  ])("accepts %s", (value) => {
    expect(isValidProxyUrl(value)).toBe(true)
  })

  it.each([
    "",
    "not a URL",
    "//proxy.example:1080",
    "file:///tmp/proxy",
    "ftp://proxy.example",
    "socks4://proxy.example:1080",
    "socks5h://",
    "socks5h:///missing-host",
    "socks5h://user:pass@:1080",
    "socks5h://bad host:1080",
    "socks5h://[bad-ip]:1080",
    "socks5h://%zz:1080",
    "socks5h://proxy.example:invalid",
    "socks5h://proxy.example:65536",
    "socks5h://proxy.example\\path",
  ])("rejects %s", (value) => {
    expect(isValidProxyUrl(value)).toBe(false)
  })
})
