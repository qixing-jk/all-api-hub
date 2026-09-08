import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  assertManagedChannelPreserved,
  extractManagedChannelSnapshot,
} from "~~/e2e/utils/realSite/managedChannelPreservation"

describe("managed channel preservation evidence", () => {
  it.each([
    [
      SITE_TYPES.NEW_API,
      {
        success: true,
        data: { id: 1, name: "fixture", future: { keep: false } },
      },
    ],
    [
      SITE_TYPES.DONE_HUB,
      {
        success: true,
        data: { id: 1, name: "fixture", future: { keep: false } },
      },
    ],
    [
      SITE_TYPES.VELOERA,
      {
        success: true,
        data: { id: 1, name: "fixture", future: { keep: false } },
      },
    ],
    [
      SITE_TYPES.SUB2API,
      { code: 0, data: { id: 1, name: "fixture", future: { keep: false } } },
    ],
    [
      SITE_TYPES.OCTOPUS,
      {
        code: 200,
        data: [{ id: 1, name: "fixture", future: { keep: false } }],
      },
    ],
    [
      SITE_TYPES.AXON_HUB,
      { data: { node: { id: 1, name: "fixture", future: { keep: false } } } },
    ],
    [
      SITE_TYPES.CLAUDE_CODE_HUB,
      { id: 1, name: "fixture", future: { keep: false } },
    ],
  ] as const)("retains raw fields for %s", (site, body) => {
    expect(extractManagedChannelSnapshot(site, body, "fixture")).toEqual({
      id: 1,
      name: "fixture",
      future: { keep: false },
    })
  })

  it("does not accept a GraphQL mutation receipt or another resource", () => {
    expect(
      extractManagedChannelSnapshot(
        SITE_TYPES.AXON_HUB,
        { data: { updateChannel: { id: 1, name: "fixture" } } },
        "fixture",
      ),
    ).toBeNull()
    expect(
      extractManagedChannelSnapshot(
        SITE_TYPES.NEW_API,
        { data: { id: 1, name: "other" } },
        "fixture",
      ),
    ).toBeNull()
  })

  it("ignores only the renamed field and the provider update timestamp", () => {
    expect(() =>
      assertManagedChannelPreserved(
        SITE_TYPES.AXON_HUB,
        {
          id: 1,
          name: "before",
          updatedAt: "before",
          future: { enabled: false },
        },
        {
          id: 1,
          name: "after",
          updatedAt: "after",
          future: { enabled: false },
        },
      ),
    ).not.toThrow()
  })

  it("detects dropped nested fields without exposing credentials", () => {
    const before = {
      id: 1,
      name: "before",
      credentials: { key: "secret-never-print", future: 1 },
    }
    const after = {
      id: 1,
      name: "after",
      credentials: { key: "secret-never-print" },
    }
    expect(() =>
      assertManagedChannelPreserved(SITE_TYPES.SUB2API, before, after),
    ).toThrow("Unrelated channel fields changed: credentials")
    try {
      assertManagedChannelPreserved(SITE_TYPES.SUB2API, before, after)
    } catch (error) {
      expect(String(error)).not.toContain("secret-never-print")
    }
  })

  it("detects removed top-level fields, reordered arrays, and identity changes", () => {
    expect(() =>
      assertManagedChannelPreserved(
        SITE_TYPES.OCTOPUS,
        { id: 1, future: true, keys: [1, 2] },
        { id: 2, keys: [2, 1] },
      ),
    ).toThrow("Unrelated channel fields changed: future, id, keys")
  })
})
