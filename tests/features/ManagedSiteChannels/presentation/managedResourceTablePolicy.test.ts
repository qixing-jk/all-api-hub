import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { isManagedSiteType, SITE_TYPES } from "~/constants/siteType"
import { MANAGED_CHANNELS_COLUMN_IDS } from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  createManagedResourceColumns,
  getDefaultManagedResourceSorting,
} from "~/features/ManagedSiteChannels/presentation/managedResourceTablePolicy"
import { getAccountSiteDefinitions } from "~/services/accountSiteDefinitions/registry"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"

const resolveLabel = ((key: string) => key) as unknown as TFunction

const nativeDefinitions = getAccountSiteDefinitions().flatMap((definition) => {
  if (!definition.managedResource || !isManagedSiteType(definition.siteType)) {
    return []
  }
  return getManagedResourceRegistration(
    definition.siteType,
    definition.managedResource.primaryKind,
  )
    ? [{ definition, siteType: definition.siteType }]
    : []
})

/**
 * Sites whose gateway channels carry a numeric id. Their id column is a declared
 * field (`<site>.id`); every other native table has no identifier to show.
 */
const ID_FIELD_ID_BY_SITE_TYPE: Partial<Record<string, string>> = {
  [SITE_TYPES.NEW_API]: "newApi.id",
  [SITE_TYPES.VELOERA]: "veloera.id",
  [SITE_TYPES.DONE_HUB]: "doneHub.id",
}

describe("native managed-resource table policy", () => {
  it("finds native definitions to check", () => {
    expect(nativeDefinitions.length).toBeGreaterThan(0)
  })

  it("labels every column with a translation key instead of a raw field id", () => {
    for (const { definition, siteType } of nativeDefinitions) {
      const columns = createManagedResourceColumns(
        resolveLabel,
        siteType,
        definition.managedResource!,
        {},
      ).filter((column) => column.id !== MANAGED_CHANNELS_COLUMN_IDS.Select)

      for (const column of columns) {
        // A column whose label is its own field id renders untranslated
        // vocabulary (e.g. "defaultModel") next to translated headers.
        expect(column.label, `${siteType}:${column.id}`).not.toBe(column.id)
        expect(column.label, `${siteType}:${column.id}`).toContain(":")
      }
    }
  })

  it("sorts by a column that the table renders", () => {
    for (const { definition, siteType } of nativeDefinitions) {
      const columns = createManagedResourceColumns(
        resolveLabel,
        siteType,
        definition.managedResource!,
        {},
      )
      const columnIds = new Set(columns.map((column) => column.id))

      for (const sort of getDefaultManagedResourceSorting(siteType)) {
        expect(columnIds.has(sort.id), `${siteType}:${sort.id}`).toBe(true)
      }
    }
  })

  it("renders an id column only for sites that have a channel identifier", () => {
    for (const { definition, siteType } of nativeDefinitions) {
      const columns = createManagedResourceColumns(
        resolveLabel,
        siteType,
        definition.managedResource!,
        {},
      )
      const idFieldId = ID_FIELD_ID_BY_SITE_TYPE[siteType]
      const idColumns = columns.filter(
        (column) => column.id === "id" || column.id.endsWith(".id"),
      )

      expect(
        idColumns.map((column) => column.id),
        `${siteType}:id-columns`,
      ).toEqual(idFieldId ? [idFieldId] : [])
      expect(
        columns.some(
          (column) => column.id === MANAGED_CHANNELS_COLUMN_IDS.Name,
        ),
        `${siteType}:name-column`,
      ).toBe(true)
    }
  })
})
