import { describe, expect, it } from "vitest"

import { parseAnnouncementTimestamp } from "~/services/siteAnnouncements/timestamp"

describe("parseAnnouncementTimestamp", () => {
  it.each([
    [1715000000, 1715000000000],
    ["1715000000", 1715000000000],
    [1715000000000, 1715000000000],
    ["1715000000000", 1715000000000],
    ["2026-05-07T00:00:00Z", Date.parse("2026-05-07T00:00:00Z")],
    [10_000_000_000, 10_000_000_000_000],
    [10_000_000_001, 10_000_000_001],
    [0, 0],
    [" 0 ", 0],
    [undefined, undefined],
    [null, undefined],
    ["", undefined],
    [" ", undefined],
    ["invalid", undefined],
    [Number.NaN, undefined],
    [Infinity, undefined],
    [{}, undefined],
  ])("parses %j as %j", (value, expected) => {
    expect(parseAnnouncementTimestamp(value)).toBe(expected)
  })
})
