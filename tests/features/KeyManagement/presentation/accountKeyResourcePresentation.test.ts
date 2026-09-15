import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import { openRouterKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"

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
          siteType: SITE_TYPES.SHAREDCHAT,
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
    SITE_TYPES.NEW_API,
    SITE_TYPES.SUB2API,
    SITE_TYPES.VO_API_V2,
    SITE_TYPES.AIHUBMIX,
  ])("does not repeat the implicit account scope on %s cards", (siteType) => {
    const row: NativeKeyManagementRow = {
      kind: "account-key-resource",
      rowKey: "account-key",
      accountId: "account-example",
      accountName: "Example account",
      scopeName: "Example account",
      facts: {
        ref: {
          accountId: "account-example",
          siteType,
          scopeKey: "account",
          resourceId: "1",
        },
        displayName: "Example key",
        maskedLabel: "sk-••••example",
        status: "enabled",
        fields: [],
        actions: { canUpdate: true, canDelete: true },
      },
    }
    const presentation = getAccountKeyResourceCardAdapter(
      siteType,
    ).buildPresentation(row, t, {
      hasAssociatedSecret: false,
    })

    expect(presentation.accountLabel).toBe("Example account")
    expect(presentation.contextFact).toBeUndefined()
    expect(presentation.summaryFacts).not.toContainEqual(
      expect.objectContaining({ id: "scope" }),
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

it.each([SITE_TYPES.NEW_API, SITE_TYPES.AIHUBMIX])(
  "retains creation and last-use date and time for %s",
  (siteType) => {
    const createdAt = Date.parse("2026-09-15T01:23:45Z")
    const accessedAt = Date.parse("2026-09-15T05:43:21Z")
    const facts = {
      ref: { accountId: "a", siteType, scopeKey: "account", resourceId: "1" },
      displayName: "Example",
      maskedLabel: "masked",
      status: "enabled" as const,
      fields: [
        {
          fieldId: "accessed_time",
          kind: "number" as const,
          value: accessedAt / 1000,
        },
      ],
      actions: { canUpdate: true, canDelete: true },
      runtimeKey: {
        createdAt,
        modelAccess: {
          groups: null,
          allowedModelIds: null,
          suggestedModelIds: [],
        },
      },
    }
    const adapter = getAccountKeyResourceCardAdapter(siteType)
    expect(adapter.buildDetailFacts(facts, t)).toEqual(
      expect.arrayContaining([
        {
          id: "createdAt",
          label: "keyManagement:keyDetails.createTime",
          value: formatLocaleDateTime(createdAt),
        },
        {
          id: "accessed_time",
          label: "keyManagement:keyDetails.lastUsedTime",
          value: formatLocaleDateTime(accessedAt),
        },
      ]),
    )
    expect(
      adapter.buildDetailFacts(
        { ...facts, fields: [{ ...facts.fields[0], value: 0 }] },
        t,
      ),
    ).not.toContainEqual(expect.objectContaining({ id: "accessed_time" }))
  },
)
