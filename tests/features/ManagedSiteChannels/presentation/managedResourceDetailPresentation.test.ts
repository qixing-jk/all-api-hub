import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { isManagedSiteType, SITE_TYPES } from "~/constants/siteType"
import type { ManagedChannelsRowViewModel } from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  buildManagedResourceDetailFields,
  createManagedResourceDetailLabels,
  createManagedResourceDisplayFieldIds,
} from "~/features/ManagedSiteChannels/presentation/managedResourceDetailPresentation"
import { createManagedResourceColumns } from "~/features/ManagedSiteChannels/presentation/managedResourceTablePolicy"
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

const row = (
  cells: ManagedChannelsRowViewModel["cells"],
): ManagedChannelsRowViewModel => ({
  rowKey: "opaque:detail",
  testToken: "resource-1",
  name: "Example channel",
  baseURL: "https://relay.example.invalid/v1",
  searchText: "Example channel",
  cells,
  capabilities: { canView: true },
})

describe("native managed-resource detail presentation", () => {
  it("accepts the table and the detail fields from one projection", () => {
    expect(
      createManagedResourceDisplayFieldIds({
        tableFieldIds: ["name", "status"],
        detailFieldIds: ["name", "key"],
      }),
    ).toEqual(["name", "status", "key"])
  })

  it("renders declared fields the accepted row carries", () => {
    const fields = buildManagedResourceDetailFields(
      row({
        name: { kind: "text", value: "Example channel", sortValue: "x" },
        key: { kind: "text", value: "Masked", sortValue: "masked" },
        status: {
          kind: "status",
          value: "Enabled",
          sortValue: "enabled",
          tone: "success",
        },
      }),
      ["name", "status", "key", "prefix", "unlabelled"],
      new Map([
        ["name", "Name"],
        ["status", "Status"],
        ["key", "Key"],
        ["prefix", "Prefix"],
      ]),
    )

    // `key` renders because the row now carries it; `prefix` has a label but no
    // value and `unlabelled` has a value but no label, so neither is invented.
    expect(
      fields.map((field) => [
        field.label,
        field.value.kind === "groups"
          ? field.value.values.join(", ")
          : field.value.value,
      ]),
    ).toEqual([
      ["Name", "Example channel"],
      ["Status", "Enabled"],
      ["Key", "Masked"],
    ])
  })

  it("skips declared fields that carry nothing to show", () => {
    const labels = new Map([
      ["name", "Name"],
      ["remark", "Remark"],
      ["tags", "Tags"],
      ["autoSync", "Auto sync"],
      ["priority", "Priority"],
    ])

    expect(
      buildManagedResourceDetailFields(
        row({
          name: { kind: "text", value: "Example channel", sortValue: "x" },
          remark: { kind: "text", value: "   ", sortValue: "" },
          tags: { kind: "groups", values: [], sortValue: "" },
          // A false toggle and a zero rank are values, not absences.
          autoSync: { kind: "text", value: "No", sortValue: "false" },
          priority: { kind: "text", value: "0", sortValue: 0 },
        }),
        ["name", "remark", "tags", "autoSync", "priority"],
        labels,
      ).map((field) => field.label),
    ).toEqual(["Name", "Auto sync", "Priority"])
  })

  it("labels a field from its editor control or from the column that shows it", () => {
    const definition = getAccountSiteDefinitions().find(
      (item) => item.siteType === SITE_TYPES.NEW_API,
    )!
    const columns = createManagedResourceColumns(
      resolveLabel,
      SITE_TYPES.NEW_API,
      definition.managedResource!,
      {},
    )
    const labels = createManagedResourceDetailLabels(
      SITE_TYPES.NEW_API,
      definition.managedResource!.primaryKind,
      columns,
      resolveLabel,
    )

    // `key` has an editor control; the numeric id has no control at all and is
    // labelled by the column that renders it.
    expect(labels.get("newApi.key")).toBe("channelDialog:fields.key.label")
    expect(labels.get("newApi.id")).toBe("managedSiteChannels:table.columns.id")
  })

  it("labels a read-only detail row from the site's presentation vocabulary", () => {
    const definition = getAccountSiteDefinitions().find(
      (item) => item.siteType === SITE_TYPES.AXON_HUB,
    )!
    const policy = definition.managedResource!
    const columns = createManagedResourceColumns(
      resolveLabel,
      SITE_TYPES.AXON_HUB,
      policy,
      {},
    )
    const labels = createManagedResourceDetailLabels(
      SITE_TYPES.AXON_HUB,
      policy.primaryKind,
      columns,
      resolveLabel,
    )

    // The manual model list is a read-only mirror with no editor control, so the
    // semantics entry is the only thing that lets its row render.
    expect(policy.detailFieldIds).toContain("manualModels")
    expect(labels.get("manualModels")).toBe(
      "managedSiteChannels:editor.fields.manualModels.label",
    )
  })

  it("labels every declared detail field for every native site type", () => {
    const unlabelled: string[] = []
    for (const { definition, siteType } of nativeDefinitions) {
      const policy = definition.managedResource!
      const columns = createManagedResourceColumns(
        resolveLabel,
        siteType,
        policy,
        {},
      )
      const labels = createManagedResourceDetailLabels(
        siteType,
        policy.primaryKind,
        columns,
        resolveLabel,
      )

      for (const fieldId of policy.detailFieldIds) {
        // A declared detail field with no label can never render, so the
        // declaration would silently lie about what the detail view shows.
        if (!labels.has(fieldId)) unlabelled.push(`${siteType}:${fieldId}`)
      }
    }

    expect(unlabelled).toEqual([])
  })
})
