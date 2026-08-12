import { describe, expect, it } from "vitest"

import { buildApiCredentialProfileListModel } from "~/features/ApiCredentialProfiles/utils/apiCredentialProfileListModel"
import { PRODUCT_ANALYTICS_MODE_IDS } from "~/services/productAnalytics/contracts"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

function buildProfile(
  overrides: Partial<ApiCredentialProfile> = {},
): ApiCredentialProfile {
  return {
    id: "profile-1",
    name: "Primary credential",
    apiType: "openai",
    baseUrl: "https://gateway.example.invalid",
    apiKey: "sk-example",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const tags: Tag[] = [
  { id: "team", name: "Platform Team", createdAt: 1, updatedAt: 1 },
  { id: "unused", name: "Unused Group", createdAt: 1, updatedAt: 1 },
]

describe("buildApiCredentialProfileListModel", () => {
  it("normalizes case, whitespace, and full-width search text across profile fields", () => {
    const profile = buildProfile({
      name: "Production Gateway",
      notes: "Shared credential",
      tagIds: ["team"],
    })

    for (const searchTerm of [
      "  PRODUCTION   gateway ",
      "ｇａｔｅｗａｙ．ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ",
      "platform team",
      "shared credential",
    ]) {
      const model = buildApiCredentialProfileListModel({
        profiles: [profile],
        tags,
        tagNameById: new Map([["team", "Platform Team"]]),
        searchTerm,
        apiTypeFilter: "",
        selectedTagIds: [],
        lastFilterMode: null,
      })

      expect(model.filteredProfiles).toEqual([profile])
    }
  })

  it("combines query, API type, and any selected tag without changing profile order", () => {
    const first = buildProfile({
      id: "first",
      name: "First matching credential",
      apiType: "openai",
      tagIds: ["team"],
    })
    const second = buildProfile({
      id: "second",
      name: "Second matching credential",
      apiType: "openai",
      tagIds: ["secondary"],
    })
    const wrongType = buildProfile({
      id: "wrong-type",
      name: "Matching credential",
      apiType: "anthropic",
      tagIds: ["team"],
    })

    const model = buildApiCredentialProfileListModel({
      profiles: [first, second, wrongType],
      tags,
      tagNameById: new Map([["team", "Platform Team"]]),
      searchTerm: "matching credential",
      apiTypeFilter: " openai ",
      selectedTagIds: ["team", "secondary"],
      lastFilterMode: PRODUCT_ANALYTICS_MODE_IDS.GroupFilter,
    })

    expect(model.filteredProfiles).toEqual([first, second])
  })

  it("builds tag options with profile counts while preserving configured order", () => {
    const model = buildApiCredentialProfileListModel({
      profiles: [
        buildProfile({ id: "first", tagIds: ["team", "team", ""] }),
        buildProfile({ id: "second", tagIds: ["team"] }),
      ],
      tags,
      tagNameById: new Map([["team", "Platform Team"]]),
      searchTerm: "",
      apiTypeFilter: "",
      selectedTagIds: [],
      lastFilterMode: null,
    })

    expect(model.tagFilterOptions).toEqual([
      { value: "team", label: "Platform Team", count: 3 },
      { value: "unused", label: "Unused Group", count: 0 },
    ])
  })

  it("reports active filter count and preserves the latest filter mode", () => {
    const model = buildApiCredentialProfileListModel({
      profiles: [],
      tags: [],
      tagNameById: new Map(),
      searchTerm: " query ",
      apiTypeFilter: " openai ",
      selectedTagIds: ["team"],
      lastFilterMode: PRODUCT_ANALYTICS_MODE_IDS.GroupFilter,
    })

    expect(model.activeFilterCount).toBe(3)
    expect(model.analyticsMode).toBe(PRODUCT_ANALYTICS_MODE_IDS.GroupFilter)
  })

  it("derives a stable fallback mode only when filters are active", () => {
    const baseInput = {
      profiles: [],
      tags: [],
      tagNameById: new Map<string, string>(),
      apiTypeFilter: "",
      selectedTagIds: [] as string[],
      lastFilterMode: null,
    }

    expect(
      buildApiCredentialProfileListModel({
        ...baseInput,
        searchTerm: "query",
      }).analyticsMode,
    ).toBe(PRODUCT_ANALYTICS_MODE_IDS.SearchFilter)
    expect(
      buildApiCredentialProfileListModel({
        ...baseInput,
        searchTerm: "",
      }).analyticsMode,
    ).toBeNull()
  })
})
