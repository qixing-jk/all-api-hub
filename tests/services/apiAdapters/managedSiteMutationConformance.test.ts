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
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import {
  getManagedSiteCapabilities,
  getSiteTypeCapabilities,
} from "~/services/apiAdapters/registry"
import {
  type consumeManagedSiteMutationResult,
  type MANAGED_SITE_MUTATION_DISPATCH_STATES,
  type MANAGED_SITE_MUTATION_FINAL_STATES,
  type ManagedSiteMutationConsumptionOptions,
  type ManagedSiteMutationDispatchState,
  type ManagedSiteMutationFinalState,
  type ManagedSiteMutationRequestObserver,
  type ManagedSiteMutationResult,
  type ManagedSiteResourceMutationResult,
} from "~/services/managedSites/mutations"
import * as axonHubLegacyProvider from "~/services/managedSites/providers/axonHub"
import * as claudeCodeHubLegacyProvider from "~/services/managedSites/providers/claudeCodeHub"
import * as doneHubLegacyProvider from "~/services/managedSites/providers/doneHubService"
import * as newApiLegacyProvider from "~/services/managedSites/providers/newApi"
import * as octopusLegacyProvider from "~/services/managedSites/providers/octopus"
import * as veloeraLegacyProvider from "~/services/managedSites/providers/veloera"
import {
  type collectManagedResourceSecrets,
  type ManagedResourceSecretCollection,
} from "~/services/managedSites/utils/managedSite"

const expectedManagedSiteTypes = [
  SITE_TYPES.NEW_API,
  SITE_TYPES.VELOERA,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.OCTOPUS,
  SITE_TYPES.AXON_HUB,
  SITE_TYPES.CLAUDE_CODE_HUB,
  SITE_TYPES.SUB2API,
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

  it("exposes managed channel writes through native workspaces only", () => {
    expect(new Set(MANAGED_SITE_TYPES)).toEqual(
      new Set(expectedManagedSiteTypes),
    )
    for (const siteType of MANAGED_SITE_TYPES) {
      expect(getManagedSiteCapabilities(siteType).siteType).toBe(siteType)
      expect(getSiteTypeCapabilities(siteType).managedSites).not.toHaveProperty(
        "channels",
      )
    }
  })

  it("keeps every native workspace write on the common mutation result", () => {
    expectTypeOf<Awaited<ReturnType<ResourceEditor["submit"]>>>().toEqualTypeOf<
      ManagedSiteMutationResult<ResourceDisplayFacts>
    >()
    expectTypeOf<
      Awaited<ReturnType<ManagedResourceWorkspace["delete"]>>
    >().toEqualTypeOf<ManagedSiteMutationResult<void>>()
    for (const siteType of MANAGED_SITE_TYPES) {
      expect(
        getManagedResourceRegistration(
          siteType,
          MANAGED_RESOURCE_KINDS.Channel,
        ),
      ).toMatchObject({
        siteType,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        open: expect.any(Function),
      })
      expect(getSiteTypeCapabilities(siteType).managedSites).not.toHaveProperty(
        "resources",
      )
    }
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
