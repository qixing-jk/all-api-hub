import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, expectTypeOf, it } from "vitest"

import { MANAGED_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type {
  ManagedResourceWorkspace,
  ResourceDisplayFacts,
  ResourceEditor,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteChannelsCapability } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourceItemsCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  consumeManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_DISPATCH_STATES,
  MANAGED_SITE_MUTATION_FINAL_STATES,
  type ManagedSiteMutationConsumptionOptions,
  type ManagedSiteMutationDispatchState,
  type ManagedSiteMutationFinalState,
  type ManagedSiteMutationRequestObserver,
  type ManagedSiteMutationResult,
  type ManagedSiteResourceMutationResult,
  type ManagedSiteVoidMutationResult,
} from "~/services/managedSites/mutations"
import * as axonHubLegacyProvider from "~/services/managedSites/providers/axonHub"
import * as claudeCodeHubLegacyProvider from "~/services/managedSites/providers/claudeCodeHub"
import * as doneHubLegacyProvider from "~/services/managedSites/providers/doneHubService"
import * as newApiLegacyProvider from "~/services/managedSites/providers/newApi"
import * as octopusLegacyProvider from "~/services/managedSites/providers/octopus"
import * as veloeraLegacyProvider from "~/services/managedSites/providers/veloera"
import {
  collectManagedResourceSecrets,
  type ManagedResourceSecretCollection,
} from "~/services/managedSites/utils/managedSite"
import type { ManagedUpstreamResourceSummary } from "~/types/managedUpstreamResource"

const expectedManagedSiteTypes = [
  SITE_TYPES.NEW_API,
  SITE_TYPES.VELOERA,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.OCTOPUS,
  SITE_TYPES.AXON_HUB,
  SITE_TYPES.CLAUDE_CODE_HUB,
] as const

describe("managed-site mutation conformance", () => {
  it("keeps execution evidence and consumption on the mutation vocabulary", () => {
    type DispatchState =
      (typeof MANAGED_SITE_MUTATION_DISPATCH_STATES)[keyof typeof MANAGED_SITE_MUTATION_DISPATCH_STATES]
    type FinalState =
      (typeof MANAGED_SITE_MUTATION_FINAL_STATES)[keyof typeof MANAGED_SITE_MUTATION_FINAL_STATES]

    expectTypeOf<ManagedSiteMutationDispatchState>().toEqualTypeOf<DispatchState>()
    expectTypeOf<ManagedSiteMutationFinalState>().toEqualTypeOf<FinalState>()
    expectTypeOf<ManagedSiteResourceMutationResult<string>>().toEqualTypeOf<
      ManagedSiteMutationResult<string>
    >()
    expectTypeOf<
      Parameters<typeof consumeManagedSiteMutationResult>[1]
    >().toEqualTypeOf<ManagedSiteMutationConsumptionOptions>()
    expectTypeOf<ManagedSiteMutationRequestObserver>().toEqualTypeOf<{
      onDispatch(): void
      onResponse(): void
    }>()
    expectTypeOf<
      ReturnType<typeof collectManagedResourceSecrets>
    >().toEqualTypeOf<ManagedResourceSecretCollection>()
  })

  it("keeps every registered managed-site channel write on the common result", () => {
    type CreateResult = Awaited<
      ReturnType<ManagedSiteChannelsCapability["create"]>
    >
    type UpdateResult = Awaited<
      ReturnType<ManagedSiteChannelsCapability["update"]>
    >
    type DeleteResult = Awaited<
      ReturnType<ManagedSiteChannelsCapability["delete"]>
    >

    expectTypeOf<CreateResult>().toEqualTypeOf<
      ManagedSiteMutationResult<unknown>
    >()
    expectTypeOf<UpdateResult>().toEqualTypeOf<
      ManagedSiteMutationResult<unknown>
    >()
    expectTypeOf<DeleteResult>().toEqualTypeOf<ManagedSiteVoidMutationResult>()

    expect(MANAGED_SITE_TYPES).toEqual(expectedManagedSiteTypes)
    for (const siteType of MANAGED_SITE_TYPES) {
      const channels = getSiteTypeCapabilities(siteType).managedSites?.channels

      expect(channels, `${siteType} channels`).toMatchObject({
        create: expect.any(Function),
        update: expect.any(Function),
        delete: expect.any(Function),
      })
    }
  })

  it("keeps every transitional-resource and native workspace write on the common result", () => {
    type ResourceCreateResult = Awaited<
      ReturnType<ManagedUpstreamResourceItemsCapability["create"]>
    >
    type ResourceUpdateResult = Awaited<
      ReturnType<ManagedUpstreamResourceItemsCapability["update"]>
    >
    type ResourceDeleteResult = Awaited<
      ReturnType<ManagedUpstreamResourceItemsCapability["delete"]>
    >
    type NativeSubmitResult = Awaited<ReturnType<ResourceEditor["submit"]>>
    type NativeDeleteResult = Awaited<
      ReturnType<ManagedResourceWorkspace["delete"]>
    >

    expectTypeOf<ResourceCreateResult>().toEqualTypeOf<
      ManagedSiteMutationResult<ManagedUpstreamResourceSummary | null>
    >()
    expectTypeOf<ResourceUpdateResult>().toEqualTypeOf<
      ManagedSiteMutationResult<ManagedUpstreamResourceSummary | null>
    >()
    expectTypeOf<ResourceDeleteResult>().toEqualTypeOf<ManagedSiteVoidMutationResult>()
    expectTypeOf<NativeSubmitResult>().toEqualTypeOf<
      ManagedSiteMutationResult<ResourceDisplayFacts>
    >()
    expectTypeOf<NativeDeleteResult>().toEqualTypeOf<
      ManagedSiteMutationResult<void>
    >()

    for (const siteType of MANAGED_SITE_TYPES) {
      expect(
        getSiteTypeCapabilities(siteType).managedSites?.resources?.items,
        `${siteType} resources`,
      ).toMatchObject({
        create: expect.any(Function),
        update: expect.any(Function),
        delete: expect.any(Function),
      })
    }
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.AXON_HUB,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).toMatchObject({
      siteType: SITE_TYPES.AXON_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      open: expect.any(Function),
    })
  })

  it("removes the legacy mutation-certainty module", () => {
    const legacyModule = fileURLToPath(
      new URL(
        "../../../src/services/managedSites/mutationCertainty.ts",
        import.meta.url,
      ),
    )

    expect(existsSync(legacyModule)).toBe(false)
  })

  it("keeps legacy provider helpers read-only", () => {
    for (const provider of [
      newApiLegacyProvider,
      veloeraLegacyProvider,
      doneHubLegacyProvider,
      octopusLegacyProvider,
      axonHubLegacyProvider,
      claudeCodeHubLegacyProvider,
    ]) {
      expect(provider).not.toHaveProperty("createChannel")
      expect(provider).not.toHaveProperty("updateChannel")
      expect(provider).not.toHaveProperty("deleteChannel")
    }
    expect(newApiLegacyProvider).not.toHaveProperty("importToNewApi")
    expect(axonHubLegacyProvider).not.toHaveProperty("importToAxonHub")
  })
})
