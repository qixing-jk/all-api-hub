import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  canAcceptDeleteEffectsLocally,
  canAcceptMutationEffectsLocally,
} from "~/features/ManagedSiteChannels/controllers/managedResourceMutationPolicy"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"

const ref: ManagedResourceRef = {
  siteType: SITE_TYPES.NEW_API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: "https://example.invalid",
  resourceId: "7",
}

const effect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId: string | number = ref.resourceId,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: ref.kind,
  resourceId,
})

describe("managed resource local mutation policy", () => {
  it("accepts only complete create and edit effect sets for the target ref", () => {
    expect(
      canAcceptMutationEffectsLocally("create", ref, [
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated),
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated),
      ]),
    ).toBe(true)
    expect(
      canAcceptMutationEffectsLocally("create", ref, [
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated),
      ]),
    ).toBe(false)
    expect(
      canAcceptMutationEffectsLocally("edit", ref, [
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated),
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ModelsUpdated),
      ]),
    ).toBe(true)
    expect(
      canAcceptMutationEffectsLocally("edit", ref, [
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted),
      ]),
    ).toBe(false)
  })

  it("rejects mismatched refs and accepts only confirmed deletes", () => {
    expect(
      canAcceptMutationEffectsLocally("edit", ref, [
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated, "8"),
      ]),
    ).toBe(false)
    expect(
      canAcceptDeleteEffectsLocally(ref, [
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted),
      ]),
    ).toBe(true)
    expect(
      canAcceptDeleteEffectsLocally(ref, [
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted),
        effect(MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated),
      ]),
    ).toBe(false)
  })
})
