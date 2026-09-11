import { describe, expect, it } from "vitest"

import { getRegistrableDomain } from "~/utils/core/domain"

describe("getRegistrableDomain", () => {
  it.each([
    ["api.example.com", "example.com"],
    ["api.example.co.uk", "example.co.uk"],
    ["school.k12.ak.us", "school.k12.ak.us"],
    ["api.one.github.io", "one.github.io"],
    ["two.github.io", "two.github.io"],
    ["www.city.kawasaki.jp", "city.kawasaki.jp"],
    ["", null],
    ["localhost", null],
    ["127.0.0.1", null],
    ["[::1]", null],
    ["co.uk", null],
    ["github.io", null],
  ])("resolves %s to %s", (hostname, domain) => {
    expect(getRegistrableDomain(hostname)).toBe(domain)
  })
})
