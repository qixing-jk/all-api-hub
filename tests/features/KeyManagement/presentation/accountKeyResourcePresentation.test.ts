import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import { openRouterKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"

const t = ((key: string) => key) as TFunction

describe("native resource card presentation", () => {
  it("uses common facts without assigning another provider's meaning to fields", () => {
    const row: NativeKeyManagementRow = {
      kind: "account-key-resource",
      rowKey: "example-row",
      accountId: "account-example",
      accountName: "Example account",
      scopeName: "Production project",
      facts: {
        ref: {
          accountId: "account-example",
          siteType: "new-api",
          scopeKey: "project-id",
          resourceId: "key-id",
        },
        displayName: "Production key",
        maskedLabel: "masked-key",
        status: "enabled",
        fields: [
          {
            fieldId: "workspace_id",
            kind: "text",
            value: "Unrelated provider field",
          },
          { fieldId: "limit", kind: "number", value: 42 },
        ],
        actions: { canUpdate: false, canDelete: true },
      },
    }
    const adapter = getAccountKeyResourceCardAdapter(row.facts.ref.siteType)
    const card = adapter.buildPresentation(row, t, {
      hasAssociatedSecret: false,
    })
    expect(card).toMatchObject({
      title: "Production key",
      accountLabel: "Example account",
      status: "active",
      contextFact: { id: "scope", value: "Production project" },
      actions: {
        edit: false,
        delete: true,
        copySecret: false,
        revealSecret: false,
        exportSecret: false,
      },
    })
    expect(card.summaryFacts).toEqual([card.contextFact])
    expect(adapter.buildDetailFacts(row.facts, t)).toEqual([])
    expect(
      adapter.buildPresentation(row, t, { hasAssociatedSecret: true }).actions,
    ).toMatchObject({
      copySecret: true,
      revealSecret: true,
      exportSecret: true,
    })
  })

  it("preserves explicitly registered provider presentation", () => {
    expect(getAccountKeyResourceCardAdapter("openrouter")).toBe(
      openRouterKeyResourceCardAdapter,
    )
  })

  it.each([
    ["disabled", "inactive", "keyManagement:native.status.disabled"],
    ["expired", "inactive", "keyManagement:native.status.expired"],
    ["unknown", "unknown", "keyManagement:native.status.unknown"],
  ] as const)(
    "maps the %s provider status without inventing provider-specific labels",
    (status, expectedStatus, expectedStatusLabel) => {
      const row: NativeKeyManagementRow = {
        kind: "account-key-resource",
        rowKey: `aihubmix-${status}`,
        accountId: "account-aihubmix",
        accountName: "AIHubMix account",
        scopeName: "Default scope",
        facts: {
          ref: {
            accountId: "account-aihubmix",
            siteType: SITE_TYPES.AIHUBMIX,
            scopeKey: "default",
            resourceId: `key-${status}`,
          },
          displayName: `${status} key`,
          maskedLabel: "sk-••••example",
          status,
          fields: [],
          actions: { canUpdate: true, canDelete: false },
        },
      }
      const adapter = getAccountKeyResourceCardAdapter(row.facts.ref.siteType)

      expect(
        adapter.buildPresentation(row, t, { hasAssociatedSecret: false }),
      ).toMatchObject({
        status: expectedStatus,
        statusLabel: expectedStatusLabel,
      })
      expect(adapter.getDetailsLoadFailedMessage(t)).toBe(
        "keyManagement:native.detailsLoadFailed",
      )
    },
  )
})
