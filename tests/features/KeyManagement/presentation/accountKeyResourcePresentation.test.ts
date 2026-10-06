import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getAccountKeyResourceCardAdapter,
  getAccountKeyScopeMessages,
  shouldShowAccountKeyScopeSelector,
} from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import { openRouterKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const t = ((key: string) => key) as TFunction

it("renders declared restriction and group semantics independently of native field names", () => {
  const row: NativeKeyManagementRow = {
    kind: "account-key-resource",
    rowKey: "row",
    accountId: "a",
    accountName: "A",
    scopeName: "Account",
    facts: {
      ref: {
        accountId: "a",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "1",
      },
      displayName: "Key",
      maskedLabel: "sk-masked",
      status: "enabled",
      actions: { canUpdate: true, canDelete: true },
      fields: [
        { fieldId: "group", kind: "text", value: "misleading" },
        { fieldId: "models", kind: "text", value: "misleading" },
        { fieldId: "allow_ips", kind: "text", value: "misleading" },
        { fieldId: "subnet", kind: "text", value: "misleading" },
      ],
      displayFacts: [
        {
          fieldId: "routing",
          kind: "group",
          value: ["alpha", "beta"],
          emptyValue: "ungrouped",
        },
        {
          fieldId: "permitted",
          kind: "restriction",
          role: "models",
          value: ["model-a", "model-b"],
        },
        {
          fieldId: "network",
          kind: "restriction",
          role: "ip",
          value: "192.0.2.1",
        },
        { fieldId: "empty", kind: "restriction", role: "subnet", value: [] },
      ],
    },
  }
  const adapter = getAccountKeyResourceCardAdapter(SITE_TYPES.NEW_API)
  const build = (facts: NativeKeyManagementRow["facts"]) =>
    adapter.buildPresentation({ ...row, facts }, t, {
      hasAssociatedSecret: false,
    })
  const card = build(row.facts)
  expect(card.contextFact?.value).toBe("alpha, beta")
  expect(card.detailFacts).toEqual([
    {
      id: "permitted",
      label: "keyManagement:keyDetails.models",
      value: "model-a, model-b",
    },
    {
      id: "network",
      label: "keyManagement:keyDetails.ipLimits",
      value: "192.0.2.1",
    },
  ])
  expect(
    build({
      ...row.facts,
      displayFacts: [
        {
          fieldId: "routing",
          kind: "group",
          value: "",
          emptyValue: "ungrouped",
        },
      ],
    }).contextFact?.value,
  ).toBe("keyManagement:keyDetails.ungrouped")
  const undeclared = build({ ...row.facts, displayFacts: undefined })
  expect(undeclared.contextFact).toBeUndefined()
  expect(undeclared.detailFacts).toEqual([])
})

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
    const displayFacts = [
      {
        fieldId: "accessed_time",
        kind: "last-used" as const,
        timestampMs: accessedAt,
      },
    ]
    expect(adapter.buildDetailFacts({ ...facts, displayFacts }, t)).toEqual(
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
        {
          ...facts,
          displayFacts: [],
          fields: [{ ...atIndex(facts.fields, 0), value: 0 }],
        },
        t,
      ),
    ).not.toContainEqual(expect.objectContaining({ id: "accessed_time" }))
  },
)

it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API])(
  "formats native quota and restrictions for %s without dropping group context",
  (siteType) => {
    const facts: NativeKeyManagementRow["facts"] = {
      ref: { accountId: "a", siteType, scopeKey: "account", resourceId: "1" },
      displayName: "Example",
      maskedLabel: "sk-masked",
      status: "enabled",
      actions: { canUpdate: true, canDelete: true },
      runtimeKey: {
        notes: "Keep this restriction",
        modelAccess: {
          groups: null,
          allowedModelIds: null,
          suggestedModelIds: [],
        },
      },
      displayFacts: [
        {
          fieldId: "provider_group",
          kind: "group",
          value: [],
          emptyValue:
            siteType === SITE_TYPES.NEW_API ? "account-group" : "ungrouped",
        },
        {
          fieldId: "models",
          kind: "restriction",
          role: "models",
          value: ["model-a", "model-b"],
        },
        {
          fieldId: "ip_whitelist",
          kind: "restriction",
          role: "ip",
          value: "192.0.2.1",
        },
        {
          fieldId: "subnet",
          kind: "restriction",
          role: "subnet",
          value: "192.0.2.0/24",
        },
        {
          fieldId: "quota",
          kind: "money",
          role: "total",
          amountUsd: 2,
          unlimited: true,
        },
        {
          fieldId: "expires_at",
          kind: "expiry",
          timestampMs: Date.parse("2030-01-01T00:00:00Z"),
        },
      ],
      fields: [
        { fieldId: "group", kind: "text", value: "" },
        { fieldId: "quota", kind: "number", value: 2 },
        { fieldId: "unlimited_quota", kind: "boolean", value: true },
        { fieldId: "expires_at", kind: "text", value: "2030-01-01T00:00:00Z" },
        { fieldId: "models", kind: "list", value: ["model-a", "model-b"] },
        { fieldId: "ip_whitelist", kind: "list", value: ["192.0.2.1"] },
        { fieldId: "subnet", kind: "text", value: "192.0.2.0/24" },
      ],
    }
    const adapter = getAccountKeyResourceCardAdapter(siteType)
    const card = adapter.buildPresentation(
      {
        kind: "account-key-resource",
        rowKey: "row",
        accountId: "a",
        accountName: "A",
        scopeName: "Account",
        facts,
      },
      t,
      { hasAssociatedSecret: false },
    )
    expect(card.contextFact?.value).toBe(
      siteType === SITE_TYPES.NEW_API
        ? "keyManagement:keyDetails.followsAccountGroup"
        : "keyManagement:keyDetails.ungrouped",
    )
    expect(card.summaryFacts[0]).toEqual(card.contextFact)
    expect(card.detailFacts).toEqual(
      expect.arrayContaining([
        {
          id: "quota",
          label: "keyManagement:native.editor.totalQuotaUsd",
          value: "keyManagement:dialog.unlimitedQuota",
        },
        {
          id: "models",
          label: "keyManagement:keyDetails.models",
          value: "model-a, model-b",
        },
        {
          id: "ip_whitelist",
          label: "keyManagement:keyDetails.ipLimits",
          value: "192.0.2.1",
        },
        {
          id: "subnet",
          label: "keyManagement:dialog.subnetLimits",
          value: "192.0.2.0/24",
        },
        {
          id: "note",
          label: "keyManagement:keyDetails.note",
          value: "Keep this restriction",
        },
      ]),
    )
    expect(
      adapter.buildDetailFacts(
        {
          ...facts,
          fields: [{ fieldId: "expires_at", kind: "text", value: "" }],
          displayFacts: [
            { fieldId: "expires_at", kind: "expiry", timestampMs: "never" },
          ],
        },
        t,
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: "expires_at",
        value: "keyManagement:keyDetails.neverExpires",
      }),
    )
  },
)

it.each([
  SITE_TYPES.OPENROUTER,
  SITE_TYPES.NEW_API,
  SITE_TYPES.KIMI_GLOBAL,
  "unknown",
  undefined,
])("keeps scope visibility and terminology consistent for %s", (siteType) => {
  const workspace = siteType === SITE_TYPES.OPENROUTER
  expect(shouldShowAccountKeyScopeSelector(siteType, 0)).toBe(workspace)
  expect(shouldShowAccountKeyScopeSelector(siteType, 1)).toBe(workspace)
  expect(shouldShowAccountKeyScopeSelector(siteType, 2)).toBe(true)
  const messages = getAccountKeyScopeMessages(siteType, t)
  const prefix = workspace
    ? "keyManagement:openRouter.workspace"
    : "keyManagement:native.scope"
  for (const [name, value] of Object.entries(messages))
    expect(value).toBe(`${prefix}.${name}`)
})

it("formats explicit display facts without guessing monetary or time units from native field names", () => {
  const facts = {
    ref: {
      accountId: "a",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "1",
    },
    displayName: "Example",
    maskedLabel: "masked",
    status: "enabled" as const,
    fields: [
      { fieldId: "remainingQuota", kind: "number" as const, value: 9000000 },
    ],
    actions: { canUpdate: true, canDelete: true },
    displayFacts: [
      {
        fieldId: "balance",
        kind: "money" as const,
        role: "remaining" as const,
        amountUsd: 2.5,
      },
      { fieldId: "old-expiry", kind: "expiry" as const, timestampMs: 86400000 },
      {
        fieldId: "no-expiry",
        kind: "expiry" as const,
        timestampMs: "never" as const,
      },
      { fieldId: "invalid-expiry", kind: "expiry" as const, timestampMs: null },
    ],
  }
  expect(
    getAccountKeyResourceCardAdapter(SITE_TYPES.NEW_API).buildDetailFacts(
      facts,
      t,
    ),
  ).toEqual([
    {
      id: "balance",
      label: "keyManagement:keyDetails.remainingQuota",
      value: "$2.5",
    },
    {
      id: "old-expiry",
      label: "keyManagement:keyDetails.expireTime",
      value: new Date(86400000).toLocaleDateString(),
    },
    {
      id: "no-expiry",
      label: "keyManagement:keyDetails.expireTime",
      value: "keyManagement:keyDetails.neverExpires",
    },
    {
      id: "invalid-expiry",
      label: "keyManagement:keyDetails.expireTime",
      value: "common:labels.notAvailable",
    },
  ])
})

it("keeps credit allowances distinct from dollars and preserves unlimited allowances", () => {
  const facts = {
    ref: {
      accountId: "a",
      siteType: SITE_TYPES.GRSAI,
      scopeKey: "account",
      resourceId: "1",
    },
    displayName: "Example",
    maskedLabel: "masked",
    status: "enabled" as const,
    fields: [],
    actions: { canUpdate: true, canDelete: true },
    displayFacts: [
      { fieldId: "credits", kind: "credits" as const, value: 250 },
      {
        fieldId: "unlimited",
        kind: "credits" as const,
        value: 250,
        unlimited: true,
      },
    ],
  }
  expect(
    getAccountKeyResourceCardAdapter(SITE_TYPES.GRSAI).buildDetailFacts(
      facts,
      t,
    ),
  ).toEqual([
    {
      id: "credits",
      label: "keyManagement:native.editor.quotaCredits",
      value: "250",
    },
    {
      id: "unlimited",
      label: "keyManagement:native.editor.quotaCredits",
      value: "keyManagement:dialog.unlimitedQuota",
    },
  ])
})
