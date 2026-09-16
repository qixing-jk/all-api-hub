import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MODEL_GROUP_ACCESS_STATES } from "~/features/ModelList/groupContext"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
  MODEL_LIST_GROUP_SEMANTICS,
} from "~/features/ModelList/modelManagementSources"
import {
  prepareModelListSource,
  prepareModelListSources,
} from "~/features/ModelList/sourcePreparation"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  createAccountRuntimeKeyModelListSourceIdentity,
  createAccountTokenModelListSourceIdentity,
} from "~/services/modelCatalog/sourceIdentity"
import { MODEL_LIST_SOURCE_KINDS } from "~/services/modelList/pricingModel"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { buildModelListAccountFixture } from "~~/tests/test-utils/modelListSource"

const PROFILE_FIXTURE: ApiCredentialProfile = {
  id: "profile-1",
  name: "Example Profile",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://profile.example.invalid",
  apiKey: "example-key",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}

const pricing = (
  overrides: Partial<ModelCatalogSnapshot> = {},
): ModelCatalogSnapshot => ({
  success: true,
  data: [
    {
      model_name: "model",
      quota_type: 0,
      model_ratio: 1,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: ["vip", "default"],
      supported_endpoint_types: [],
    },
  ],
  groupAccess: {
    kind: "authoritative",
    usableGroups: ["default"],
  },
  groupRatios: { default: 1 },
  ...overrides,
})
const account = buildModelListAccountFixture(SITE_TYPES.NEW_API)
const source = createAccountSource(account)
const fallback = {
  kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
  supportsPricing: false,
} as const

describe("model list source preparation", () => {
  it("separates support, access, and priceability without mutating inputs", () => {
    const response = pricing({
      groupAccess: {
        kind: "authoritative",
        usableGroups: [" vip ", "default"],
      },
      groupRatios: { " vip ": 0, default: Infinity },
    })
    const before = structuredClone(response)
    const prepared = prepareModelListSource({ source, pricing: response })
    expect(prepared.items[0].groupContext).toEqual({
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups: ["vip", "default"],
      usableGroups: ["vip", "default"],
      priceableGroups: ["vip"],
    })
    expect(prepared.groupRatios).toEqual({ vip: 0 })
    expect(prepared.canRepairGroupSelection).toBe(true)
    expect(response).toEqual(before)
    expect(source.capabilities.supportsPricing).toBe(true)
  })

  it.each([
    { name: "missing response", response: null, evidence: false },
    {
      name: "empty priced response",
      response: pricing({ data: [] }),
      evidence: true,
    },
    {
      name: "empty catalog fallback",
      response: pricing({
        data: [],
        groupAccess: { kind: "unavailable" },
        model_list_source: fallback,
      }),
      evidence: false,
    },
    {
      name: "known empty access",
      response: pricing({
        groupAccess: { kind: "authoritative", usableGroups: [] },
        groupRatios: {},
      }),
      evidence: true,
    },
    {
      name: "unknown catalog access",
      response: pricing({
        groupAccess: { kind: "unavailable" },
        groupRatios: {},
        model_list_source: fallback,
      }),
      evidence: false,
    },
    {
      name: "compatible priced fallback",
      response: pricing({
        groupAccess: {
          kind: "compatible-priced-fallback",
          candidateGroups: ["default"],
        },
      }),
      evidence: true,
    },
  ])("preserves evidence for $name", ({ response, evidence }) => {
    expect(
      prepareModelListSource({ source, pricing: response })
        .canRepairGroupSelection,
    ).toBe(evidence)
  })

  it("keeps stable group semantics when a catalog response disables pricing and actions", () => {
    const prepared = prepareModelListSource({
      source,
      pricing: pricing({
        model_list_source: {
          ...fallback,
          actionPolicy: { supportsCredentialVerification: false },
        },
      }),
    })
    expect(prepared.source.groupSemantics).toBe(
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
    expect(prepared.source.capabilities).toMatchObject({
      supportsPricing: false,
      supportsGroupFiltering: false,
      supportsCredentialVerification: false,
    })
    expect(source.capabilities).toMatchObject({
      supportsPricing: true,
      supportsCredentialVerification: true,
    })
  })

  it("preserves profile semantics and exchange rate independently of account access fields", () => {
    const profile = createProfileSource(PROFILE_FIXTURE)
    const prepared = prepareModelListSource({
      source: profile,
      pricing: pricing({ model_list_source: fallback }),
    })
    expect(prepared.items[0].groupContext.accessState).toBe(
      MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
    )
    expect(prepared.items[0].exchangeRate).toBe(1)
    expect(prepared.source.capabilities).toEqual(profile.capabilities)
    expect(prepared.canRepairGroupSelection).toBe(true)
  })

  it("uses the same account facts for single and aggregate inputs while enabling aggregate summaries", () => {
    const response = pricing()
    const single = prepareModelListSources({
      selectedSource: source,
      pricingData: response,
      pricingContexts: [],
    })[0]
    const aggregate = prepareModelListSources({
      selectedSource: createAllAccountsSource(),
      pricingData: null,
      pricingContexts: [{ account, pricing: response }],
    })[0]
    expect(aggregate.items[0].groupContext).toEqual(
      single.items[0].groupContext,
    )
    expect(aggregate.items[0].exchangeRate).toBe(single.items[0].exchangeRate)
    expect(aggregate.canRepairGroupSelection).toBe(
      single.canRepairGroupSelection,
    )
    expect(single.source.capabilities.supportsAccountSummary).toBe(false)
    expect(aggregate.source.capabilities.supportsAccountSummary).toBe(true)
  })

  it("prioritizes contexts and retains missing source evidence without borrowing single-source data", () => {
    const prepared = prepareModelListSources({
      selectedSource: source,
      pricingData: pricing(),
      pricingContexts: [{ account, pricing: null }],
    })
    expect(prepared).toHaveLength(1)
    expect(prepared[0].items).toEqual([])
    expect(prepared[0].canRepairGroupSelection).toBe(false)
  })

  it("keeps token and runtime-key identities and access isolated for the same account", () => {
    const token = createAccountTokenModelListSourceIdentity({
      accountId: account.id,
      tokenId: 1,
    })
    const runtimeKey = createAccountRuntimeKeyModelListSourceIdentity({
      accountId: account.id,
      runtimeKeyId: "key",
    })
    const prepared = prepareModelListSources({
      selectedSource: createAllAccountsSource(),
      pricingData: null,
      pricingContexts: [
        { account, sourceIdentity: token, pricing: pricing() },
        {
          account,
          sourceIdentity: runtimeKey,
          pricing: pricing({
            groupAccess: {
              kind: "authoritative",
              usableGroups: ["vip"],
            },
            groupRatios: { vip: 0.5 },
          }),
        },
      ],
    })
    expect(prepared.map((p) => p.items[0].sourceIdentity)).toEqual([
      token,
      runtimeKey,
    ])
    expect(prepared.map((p) => p.items[0].groupContext.usableGroups)).toEqual([
      ["default"],
      ["vip"],
    ])
  })
  it.each([null, pricing({ data: [] })])(
    "retains runtime-key identity even without model rows",
    (response) => {
      const identity = createAccountRuntimeKeyModelListSourceIdentity({
        accountId: account.id,
        runtimeKeyId: "empty-key",
      })
      const prepared = prepareModelListSource({
        source,
        sourceIdentity: identity,
        pricing: response,
      })
      expect(prepared.sourceIdentity).toEqual(identity)
      expect(prepared.items).toEqual([])
    },
  )

  it("does not re-enable aggregate summaries after response restrictions", () => {
    const prepared = prepareModelListSources({
      selectedSource: createAllAccountsSource(),
      pricingData: null,
      pricingContexts: [
        { account, pricing: pricing({ model_list_source: fallback }) },
      ],
    })
    expect(prepared[0].source.capabilities.supportsAccountSummary).toBe(false)
  })

  it.each([null, createAllAccountsSource()])(
    "does not assign a single response to an absent or aggregate selection",
    (selectedSource) => {
      expect(
        prepareModelListSources({
          selectedSource,
          pricingData: pricing(),
          pricingContexts: [],
        }),
      ).toEqual([])
    },
  )
})
