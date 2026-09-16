import { describe, expect, it } from "vitest"

import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import { MODEL_CAPABILITY_FILTER_VALUES } from "~/features/ModelList/modelCapabilityFilters"
import {
  createModelListFilterPipeline,
  projectModelListVendorFilter,
} from "~/features/ModelList/modelFiltering"
import type { ModelListItem } from "~/features/ModelList/modelListItems"
import { MODEL_VENDOR_FILTER_VALUES } from "~/services/models/modelVendor"
import { buildModelListItemFixture } from "~~/tests/test-utils/modelListSource"

function item(accountId: string, name: string, vendor: string): ModelListItem {
  const result = buildModelListItemFixture(accountId, { a: 1 })
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
  it("hides denied account offers by default and restores them in visibility previews", () => {
    const denied = buildModelListItemFixture("a", { vip: 1 }, ["vip"])
    const allowed = buildModelListItemFixture("b", { a: 1 }, ["a"])
    const result = pipeline([denied, allowed], { accountFilterAccountIds: [] })
    const view = result.forVendor(MODEL_VENDOR_FILTER_VALUES.All)
    expect(view.getFilteredModels()).toEqual([allowed])
    expect(view.getFilteredResultCount()).toBe(1)
    expect(view.getFilteredModels({ showUnavailableModels: true })).toEqual([
      denied,
      allowed,
    ])
    expect(view.getFilteredResultCount({ showUnavailableModels: true })).toBe(2)
    expect(
      pipeline([denied, allowed], { accountFilterAccountIds: ["a"] })
        .forVendor(MODEL_VENDOR_FILTER_VALUES.All)
        .getFilteredModels(),
    ).toEqual([])
  })

  it("preserves unknown, non-group, missing-support and usable-but-unpriced rows", () => {
    const unknown = buildModelListItemFixture("a", {})
    unknown.groupContext = {
      ...unknown.groupContext,
      accessState: "unknown",
      usableGroups: [],
    }
    const nonGroup = buildModelListItemFixture("a", {})
    nonGroup.groupContext = {
      ...nonGroup.groupContext,
      accessState: "not-applicable",
      usableGroups: [],
    }
    const missingSupport = buildModelListItemFixture("a", {}, [])
    missingSupport.groupContext.supportedGroups = []
    const unpriced = buildModelListItemFixture("a", {}, ["a"])
    const items = [unknown, nonGroup, missingSupport, unpriced]
    expect(
      pipeline(items)
        .forVendor(MODEL_VENDOR_FILTER_VALUES.All)
        .getFilteredModels(),
    ).toEqual(items)
  })

  it("reveals denied rows explicitly without widening selected usable groups", () => {
    const denied = buildModelListItemFixture("a", { vip: 1 }, ["vip"])
    const usable = buildModelListItemFixture("a", { b: 1 }, ["b"])
    const result = pipeline([denied, usable]).forVendor(
      MODEL_VENDOR_FILTER_VALUES.All,
    )
    expect(
      result.getFilteredResultCount({
        showUnavailableModels: true,
        selectedGroups: ["a"],
      }),
    ).toBe(1)
    expect(
      result.getFilteredResultCount({
        showUnavailableModels: true,
        selectedGroups: [],
      }),
    ).toBe(2)
  })

  it("honors an explicitly empty group selection while retaining unknown rows", () => {
    const usable = buildModelListItemFixture("a", {}, ["a"])
    // Missing pricing does not exempt a known usable row from group selection.
    usable.source.capabilities.supportsPricing = false
    const unknown = buildModelListItemFixture("a", {}, [])
    unknown.groupContext.accessState = "unknown"
    const denied = buildModelListItemFixture("a", { vip: 1 }, ["vip"])
    const view = pipeline([usable, unknown, denied], {
      getGroupCandidates: () => [],
    }).forVendor(MODEL_VENDOR_FILTER_VALUES.All)
    expect(view.getFilteredModels()).toEqual([unknown])
    expect(view.getFilteredModels({ showUnavailableModels: true })).toEqual([
      unknown,
      denied,
    ])
  })

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
    catalog.groupContext = {
      ...catalog.groupContext,
      accessState: "unknown",
      usableGroups: [],
      priceableGroups: [],
    }
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
