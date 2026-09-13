import { describe, expect, it } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import { MODEL_CAPABILITY_FILTER_VALUES } from "~/features/ModelList/modelCapabilityFilters"
import {
  createModelListFilterPipeline,
  projectModelListVendorFilter,
} from "~/features/ModelList/modelFiltering"
import type { ModelListItem } from "~/features/ModelList/modelListItems"
import { createAccountSource } from "~/features/ModelList/modelManagementSources"
import { prepareModelListSource } from "~/features/ModelList/sourcePreparation"
import { MODEL_VENDOR_FILTER_VALUES } from "~/services/models/modelVendor"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const createAccountFixture = (siteType: AccountSiteType): DisplaySiteData => ({
  id: `account-${siteType}`,
  name: "Example Account",
  username: "example-user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType,
  baseUrl: "https://account.example.invalid",
  token: "example-token",
  userId: "example-user-id",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
})

function row(
  id: string,
  ratios: Record<string, number>,
  usableGroups = ["a", "b"],
): ModelListItem {
  const account = { ...createAccountFixture(SITE_TYPES.NEW_API), id }
  const prepared = prepareModelListSource({
    source: createAccountSource(account),
    pricing: {
      success: true,
      data: [
        {
          model_name: "model",
          model_ratio: 1,
          model_price: 0,
          completion_ratio: 1,
          quota_type: 0,
          enable_groups: ["a", "b"],
          supported_endpoint_types: [],
        },
      ],
      usable_group: Object.fromEntries(usableGroups.map((g) => [g, true])),
      group_ratio: ratios,
    },
  })
  return {
    ...prepared.items[0],
    comparableModelIdentity: { key: "exact:model", displayName: "model" },
    resolvedVendor: { state: "unknown" },
  }
}
function item(accountId: string, name: string, vendor: string): ModelListItem {
  const result = row(accountId, { a: 1 })
  return {
    ...result,
    model: { ...result.model, model_name: name },
    source: {
      ...result.source,
      capabilities: {
        ...result.source.capabilities,
        supportsAccountSummary: true,
      },
    },
    resolvedVendor: {
      state: "resolved",
      kind: "custom",
      key: `custom:${vendor}`,
      label: vendor,
      source: "publisher-evidence",
    },
  }
}
function pipeline(
  items: ModelListItem[],
  overrides: Partial<Parameters<typeof createModelListFilterPipeline>[0]> = {},
) {
  return createModelListFilterPipeline({
    items,
    filters: {
      searchTerm: "",
      selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
      selectedGroups: [],
      selectedModelCapabilities: [],
    },
    isAllAccounts: true,
    accountFilterAccountIds: ["a"],
    supportsModelCapabilityFilter: true,
    getGroupCandidates: (_item, groups) => (groups.length ? groups : undefined),
    ...overrides,
  })
}
describe("model list filtering scopes", () => {
  it("keeps account summaries independent of account selection and the selected vendor", () => {
    const result = pipeline([
      item("a", "first", "one"),
      item("a", "second", "two"),
      item("b", "third", "one"),
    ])
    const view = result.forVendor("custom:one")
    expect([...result.accountSummaryCountsByAccountId]).toEqual([
      ["a", 2],
      ["b", 1],
    ])
    expect(view.getFilteredModels().map((i) => i.model.model_name)).toEqual([
      "first",
    ])
    const vendors = projectModelListVendorFilter(
      result.accountFilteredBaseRawModels,
      "custom:one",
    )
    expect(vendors.vendorCatalog.map((v) => [v.key, v.count])).toEqual([
      ["custom:one", 1],
      ["custom:two", 1],
    ])
  })
  it("computes capability coverage before capability filtering within the selected account and vendor scope", () => {
    const known = item("a", "known", "one")
    known.modelMetadata = {
      id: "known",
      name: "known",
      provider_id: "one",
      capabilities: { reasoning: true },
    }
    const result = pipeline(
      [known, item("a", "unknown", "one"), item("b", "excluded", "one")],
      {
        filters: {
          searchTerm: "",
          selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
          selectedGroups: [],
          selectedModelCapabilities: [MODEL_CAPABILITY_FILTER_VALUES.REASONING],
        },
      },
    ).forVendor("custom:one")
    expect(result.getFilteredResultCount()).toBe(1)
    expect(result.modelCapabilityMetadataCoverage).toEqual({
      matched: 1,
      total: 2,
      unmatched: 1,
    })
  })
  it("reconciles the vendor against each draft result without changing the current filter", () => {
    const result = pipeline([
      item("a", "first", "one"),
      item("a", "second", "two"),
    ]).forVendor("custom:one")
    expect(
      result
        .getFilteredModels({ searchTerm: "second" })
        .map((i) => i.model.model_name),
    ).toEqual(["second"])
    expect(result.getFilteredModels().map((i) => i.model.model_name)).toEqual([
      "first",
    ])
  })
  it("keeps catalog-only rows visible under billing and group filters", () => {
    const catalog = item("a", "catalog", "one")
    catalog.source.capabilities.supportsPricing = false
    const result = pipeline([catalog], {
      filters: {
        searchTerm: "",
        selectedBillingMode: MODEL_LIST_BILLING_MODES.PER_CALL,
        selectedGroups: ["absent"],
        selectedModelCapabilities: [],
      },
    }).forVendor(MODEL_VENDOR_FILTER_VALUES.All)
    expect(result.getFilteredResultCount()).toBe(1)
  })
})
