import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  isManagedSiteType,
  SITE_TYPES,
  type ManagedSiteType,
} from "~/constants/siteType"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import {
  createManagedResourceColumns,
  getManagedResourcePresentationSemantics,
} from "~/features/ManagedSiteChannels/presentation/managedResourceTablePolicy"
import { MANAGED_RESOURCE_MODES } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinitions } from "~/services/accountSiteDefinitions/registry"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"

describe("native managed-resource registration conformance", () => {
  const nativeDefinitions = getAccountSiteDefinitions().flatMap((definition) =>
    definition.managedResource?.mode ===
      MANAGED_RESOURCE_MODES.NativeResource &&
    isManagedSiteType(definition.siteType)
      ? [{ definition, siteType: definition.siteType }]
      : [],
  )

  it("keeps product policy, native registration, and editor policy in sync", () => {
    expect(nativeDefinitions.length).toBeGreaterThan(0)

    for (const { definition, siteType } of nativeDefinitions) {
      const policy = definition.managedResource!
      const registration = getManagedResourceRegistration(
        siteType,
        policy.primaryKind,
      )
      const semantics = getManagedResourcePresentationSemantics(siteType)

      expect(registration, siteType).not.toBeNull()
      for (const fieldId of [
        semantics.baseUrlFieldId,
        semantics.statusFieldId,
        ...Object.keys(semantics.fieldValuePresentations ?? {}),
      ]) {
        if (fieldId) {
          expect(policy.tableFieldIds, `${siteType}:${fieldId}`).toContain(
            fieldId,
          )
        }
      }
      expect(
        getManagedResourceFieldPolicy(
          siteType,
          policy.primaryKind,
          MANAGED_RESOURCE_EDITOR_MODES.Create,
        ),
        `${siteType}:create`,
      ).not.toBeNull()
      expect(
        getManagedResourceFieldPolicy(
          siteType,
          policy.primaryKind,
          MANAGED_RESOURCE_EDITOR_MODES.Edit,
        ),
        `${siteType}:edit`,
      ).not.toBeNull()
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
