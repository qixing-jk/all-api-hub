import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  isManagedSiteType,
  MANAGED_SITE_TYPES,
  SITE_TYPES,
  type ManagedSiteType,
} from "~/constants/siteType"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import { managedSitePresentationDefinitions } from "~/features/ManagedSiteChannels/presentation/managedSitePresentationRegistry"
import {
  createManagedResourceColumns,
  getManagedResourcePresentationSemantics,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePolicy"
import { getAccountSiteDefinitions } from "~/services/accountSiteDefinitions/registry"
import {
  getManagedResourceRegistration,
  managedResourceRegistrations,
} from "~/services/apiAdapters/managedResources/registry"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"

describe("native managed-resource registration conformance", () => {
  const nativeDefinitions = getAccountSiteDefinitions().flatMap(
    (definition) => {
      if (!isManagedSiteType(definition.siteType)) {
        return []
      }
      return [{ definition, siteType: definition.siteType }]
    },
  )

  it("registers each declared managed site and resource exactly once without orphans", () => {
    const declaredSiteTypes = nativeDefinitions.map(({ siteType }) => siteType)
    expect([...declaredSiteTypes].sort()).toEqual(
      [...MANAGED_SITE_TYPES].sort(),
    )
    const declaredResources = nativeDefinitions.map(
      ({ definition, siteType }) => {
        expect(
          definition.managedResource,
          `${siteType}:product policy`,
        ).toBeDefined()
        return `${siteType}:${definition.managedResource!.primaryKind}`
      },
    )
    // Comparing arrays, rather than sets, rejects duplicate entries as well as omissions.
    expect(
      managedResourceRegistrations
        .map(({ siteType, kind }) => `${siteType}:${kind}`)
        .sort(),
    ).toEqual([...declaredResources].sort())
    expect(
      managedSitePresentationDefinitions.map(({ siteType }) => siteType).sort(),
    ).toEqual([...declaredSiteTypes].sort())
    const editorResources = managedSitePresentationDefinitions.flatMap(
      (presentation) =>
        presentation.fieldPolicies.map((policy) => {
          expect(policy.siteType, `${presentation.siteType}:editor owner`).toBe(
            presentation.siteType,
          )
          return `${policy.siteType}:${policy.kind}`
        }),
    )
    expect(editorResources.sort()).toEqual([...declaredResources].sort())
  })

  it("keeps product policy, native registration, and editor policy in sync", () => {
    expect(nativeDefinitions.length).toBeGreaterThan(0)

    for (const { definition, siteType } of nativeDefinitions) {
      expect(
        definition.managedResource,
        `${siteType}:product policy`,
      ).toBeDefined()
      const policy = definition.managedResource!
      const registration = getManagedResourceRegistration(
        siteType,
        policy.primaryKind,
      )
      const semantics = getManagedResourcePresentationSemantics(siteType)

      expect(registration, siteType).not.toBeNull()
      expect(registration?.open, `${siteType}:native workspace`).toBeTypeOf(
        "function",
      )
      expect(getManagedSiteCapabilities(siteType).siteType).toBe(siteType)
      expect(
        managedSitePresentationDefinitions.find(
          (entry) => entry.siteType === siteType,
        )?.table,
        `${siteType}:table policy`,
      ).toBeDefined()
      // A value presentation or a status/base-URL role can target any field the
      // workspace displays — a table column or a declared detail row.
      const displayFieldIds = [
        ...policy.tableFieldIds,
        ...policy.detailFieldIds,
      ]
      for (const fieldId of [
        semantics.baseUrlFieldId,
        semantics.statusFieldId,
        ...Object.keys(semantics.fieldValuePresentations ?? {}),
      ]) {
        if (fieldId) {
          expect(displayFieldIds, `${siteType}:${fieldId}`).toContain(fieldId)
        }
      }
      expect(
        getManagedResourceFieldPolicy(
          siteType,
          policy.primaryKind,
          MANAGED_RESOURCE_EDITOR_MODES.Create,
        ),
        `${siteType}:create`,
      ).toBeDefined()
      expect(
        getManagedResourceFieldPolicy(
          siteType,
          policy.primaryKind,
          MANAGED_RESOURCE_EDITOR_MODES.Edit,
        ),
        `${siteType}:edit`,
      ).toBeDefined()
    }
  })

  it("declares numeric channel deep links for compatible native table contracts", () => {
    const resolveLabel = ((key: string) => key) as TFunction
    const expectedIdFieldBySiteType = new Map<ManagedSiteType, string>([
      [SITE_TYPES.NEW_API, "newApi.id"],
      [SITE_TYPES.DONE_HUB, "doneHub.id"],
    ])

    for (const { definition, siteType } of nativeDefinitions) {
      const routeFilterColumns = createManagedResourceColumns(
        resolveLabel,
        siteType,
        definition.managedResource!,
        {},
      ).filter((column) => column.routeFilter?.queryKey === "channelId")

      const expectedIdField = expectedIdFieldBySiteType.get(siteType)
      if (expectedIdField) {
        expect(routeFilterColumns).toHaveLength(1)
        expect(routeFilterColumns[0]?.id).toBe(expectedIdField)
      } else {
        expect(routeFilterColumns, siteType).toHaveLength(0)
      }
    }
  })
})
