import { describe, expect, it, vi } from "vitest"

import {
  normalizeChannelFilters,
  sanitizeChannelFilter,
} from "~/services/managedSites/channelModelFilterRules"

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: vi.fn(() => "generated-filter-id"),
}))

describe("channelModelFilterRules", () => {
  it("returns an empty probe id list when probeIds is not an array", () => {
    expect(() =>
      normalizeChannelFilters(
        [
          {
            kind: "probe",
            name: "Probe Rule",
            probeIds: "text-generation",
          } as any,
        ],
        {
          now: 100,
        },
      ),
    ).toThrow("At least one probe is required")
  })

  it("ignores non-string probe identifiers during normalization", () => {
    const filters = normalizeChannelFilters(
      [
        {
          kind: "probe",
          name: "Probe Rule",
          probeIds: [123, "text-generation", "tool-calling"],
        } as any,
      ],
      {
        now: 100,
      },
    )

    expect(filters).toEqual([
      expect.objectContaining({
        kind: "probe",
        probeIds: ["text-generation", "tool-calling"],
      }),
    ])
  })

  it("strips credential fields before probe-rule normalization", () => {
    const filters = normalizeChannelFilters(
      [
        {
          kind: "probe",
          name: "Probe Rule",
          probeIds: ["text-generation"],
          match: "any",
          apiKey: "sk-should-not-persist",
          baseUrl: "https://should-not-persist.example.com",
        } as any,
      ],
      {
        now: 100,
      },
    )

    expect(filters).toEqual([
      {
        id: "generated-filter-id",
        kind: "probe",
        name: "Probe Rule",
        description: undefined,
        probeIds: ["text-generation"],
        match: "any",
        action: "include",
        enabled: true,
        createdAt: 100,
        updatedAt: 100,
      },
    ])
  })

  it("sanitizes malformed probe rules without crashing storage migration", () => {
    const filter = sanitizeChannelFilter(
      {
        kind: "probe",
        name: "  Probe Rule  ",
        probeIds: ["unknown-probe", "text-generation"],
        apiKey: "sk-should-not-persist",
      },
      {
        fallbackTimestamp: 123,
        idPrefix: "channel-filter",
      },
    )

    expect(filter).toEqual({
      id: "generated-filter-id",
      kind: "probe",
      name: "Probe Rule",
      description: undefined,
      probeIds: ["text-generation"],
      match: "all",
      action: "include",
      enabled: true,
      createdAt: 123,
      updatedAt: 123,
    })
  })
})
