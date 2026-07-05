import { describe, expect, expectTypeOf, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedUpstreamResourceDraftsCapability,
  ManagedUpstreamResourceItemsCapability,
  ManagedUpstreamResourceListData,
  ManagedUpstreamResourcesCapability,
} from "~/services/apiAdapters/contracts/managedUpstreamResources"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import {
  createManagedUpstreamResourceRef,
  getManagedUpstreamResourceRefKey,
  type ManagedUpstreamResourceDraftValidationResult,
  type ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"

describe("managed upstream resource contracts", () => {
  it("builds deterministic composite keys from non-secret ref fields", () => {
    const ref = createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://admin.example.invalid",
      resourceId: "provider/native-id",
    })

    expect(getManagedUpstreamResourceRefKey(ref)).toBe(
      "axonhub:https%3A%2F%2Fadmin.example.invalid:provider%2Fnative-id",
    )
    expect(getManagedUpstreamResourceRefKey(ref)).toBe(
      getManagedUpstreamResourceRefKey({ ...ref }),
    )
    expect(getManagedUpstreamResourceRefKey(ref)).not.toContain("sk-")
  })

  it("normalizes numeric-like ids to stable string resource ids at ref creation", () => {
    const ref = createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.NEW_API,
      scopeKey: "https://admin.example.invalid",
      resourceId: 123,
    })

    expect(ref.resourceId).toBe("123")
  })

  it("allows optional resources capabilities to coexist with legacy channel capabilities", () => {
    type Draft = { name: string }
    type Native = { id: string }
    const resources = buildResourcesCapability<Native, Draft>()
    const capabilities = {
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      managedSites: {
        channels: {
          search: async () => ({ items: [], total: 0, type_counts: {} }),
          create: async () => ({ success: true, data: null, message: "" }),
          update: async () => ({ success: true, data: null, message: "" }),
          delete: async () => ({ success: true, data: null, message: "" }),
        },
        resources,
      },
    } satisfies SiteTypeCapabilities

    expect(capabilities.managedSites.channels).toBeDefined()
    expect(capabilities.managedSites.resources).toBe(resources)
  })

  it("keeps the core resources capability limited to initial migration groups", () => {
    const resources = buildResourcesCapability()
    const resourcesWithoutSecrets: ManagedUpstreamResourcesCapability = {
      items: resources.items,
      drafts: resources.drafts,
    }

    expectTypeOf<keyof ManagedUpstreamResourcesCapability>().toEqualTypeOf<
      "drafts" | "items" | "secrets"
    >()
    expectTypeOf<keyof ManagedUpstreamResourceItemsCapability>().toEqualTypeOf<
      "create" | "delete" | "getDetail" | "list" | "search" | "update"
    >()
    expectTypeOf<keyof ManagedUpstreamResourceDraftsCapability>().toEqualTypeOf<
      | "describeFields"
      | "prepareEditDraft"
      | "prepareImportDraft"
      | "validateDraft"
    >()

    expect(Object.keys(resources).sort()).toEqual([
      "drafts",
      "items",
      "secrets",
    ])
    expect(Object.keys(resources.items).sort()).toEqual([
      "create",
      "delete",
      "getDetail",
      "list",
      "search",
      "update",
    ])
    expect(Object.keys(resources.drafts).sort()).toEqual([
      "describeFields",
      "prepareEditDraft",
      "prepareImportDraft",
      "validateDraft",
    ])
    expect(Object.keys(resources.secrets ?? {}).sort()).toEqual([
      "revealSecret",
    ])
    expect(resourcesWithoutSecrets.secrets).toBeUndefined()
  })
})

function buildResourcesCapability<TNative = unknown, TDraft = unknown>() {
  const summary: ManagedUpstreamResourceSummary = {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      scopeKey: "https://admin.example.invalid",
      resourceId: "provider-1",
    }),
    displayName: "Example Provider",
    nativeKind: "provider",
    status: "enabled",
    endpointLabel: "https://upstream.example.invalid",
    modelCount: 1,
    modelPreview: ["example-model"],
    secretState: "masked",
    capabilities: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canRevealSecret: true,
    },
  }
  const listData: ManagedUpstreamResourceListData = {
    items: [summary],
    total: 1,
  }
  const validation: ManagedUpstreamResourceDraftValidationResult = {
    valid: true,
    errors: [],
  }

  const resources = {
    items: {
      list: async () => listData,
      search: async () => listData,
      getDetail: async () => ({ summary, native: {} as TNative }),
      create: async () => ({ success: true, data: summary, message: "" }),
      update: async () => ({ success: true, data: summary, message: "" }),
      delete: async () => ({ success: true, data: null, message: "" }),
    },
    drafts: {
      prepareImportDraft: async () => ({ name: "Example" }) as TDraft,
      prepareEditDraft: () => ({ name: "Example" }) as TDraft,
      describeFields: () => [
        {
          name: "name",
          label: "Name",
          type: "text",
          required: true,
        },
      ],
      validateDraft: () => validation,
    },
    secrets: {
      revealSecret: async () => ({ status: "available", secret: "revealed" }),
    },
  } satisfies ManagedUpstreamResourcesCapability<unknown, TNative, TDraft>

  return resources
}
