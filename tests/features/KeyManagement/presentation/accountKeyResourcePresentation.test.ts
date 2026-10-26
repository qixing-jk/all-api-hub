import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getAccountKeyResourceCardAdapter,
  getAccountKeyScopeMessages,
  shouldShowAccountKeyScopeSelector,
} from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import { openRouterKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import {
  KEY_MANAGEMENT_DISPLAY_ROW_KINDS,
  type NativeKeyManagementRow,
} from "~/features/KeyManagement/types"
import {
  ACCOUNT_KEY_CREDENTIAL_ROLES,
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const t = ((key: string) => key) as TFunction

it("explains custom, inherited and unavailable Vercel spending budgets", () => {
  const facts: NativeKeyManagementRow["facts"] = {
    ref: {
      accountId: "a",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "k",
    },
    displayName: "Key",
    maskedLabel: "masked",
    status: "enabled",
    fields: [],
    actions: { canUpdate: true, canDelete: true },
    displayFacts: [
      {
        fieldId: "custom",
        kind: "spend-budget",
        source: "custom",
        limitUsd: 10,
        usedUsd: 3,
        period: "monthly",
      },
      {
        fieldId: "default",
        kind: "spend-budget",
        source: "inherited",
        limitUsd: 20,
        period: "weekly",
      },
      { fieldId: "unknown", kind: "spend-budget", source: "unavailable" },
      { fieldId: "none", kind: "spend-budget", source: "none" },
      {
        fieldId: "daily",
        kind: "spend-budget",
        source: "custom",
        limitUsd: 5,
        period: "daily",
        active: false,
      },
      { fieldId: "user", kind: "attribution", value: "user" },
      { fieldId: "team", kind: "attribution", value: "team" },
      {
        fieldId: "custom-attribution",
        kind: "attribution",
        value: "future-value",
      },
    ],
  }
  const details = getAccountKeyResourceCardAdapter(
    SITE_TYPES.VERCEL_AI_GATEWAY,
  ).buildDetailFacts(facts, t)
  expect(details).toHaveLength(8)
  expect(details[0]?.value).toContain("$3 / $10")
  expect(details[1]?.value).toContain(
    "keyManagement:native.editor.vercelAiGateway.inheritedBudget",
  )
  expect(details[2]?.value).toBe(
    "keyManagement:native.editor.vercelAiGateway.budgetUnavailable",
  )
  expect(details[3]?.value).toBe(
    "keyManagement:native.editor.vercelAiGateway.noBudget",
  )
  expect(details[4]?.value).toContain(
    "keyManagement:native.editor.vercelAiGateway.budgetInactive",
  )
  expect(details[4]?.value).toContain(
    "keyManagement:native.editor.vercelAiGateway.period.daily",
  )
  expect(details[5]?.value).toBe(
    "keyManagement:native.editor.vercelAiGateway.attribution.user",
  )
  expect(details[6]?.value).toBe(
    "keyManagement:native.editor.vercelAiGateway.attribution.team",
  )
  expect(details[7]?.value).toBe("future-value")
})

it("distinguishes account-following allowance, explicit rate limits and budget reset windows", () => {
  const facts: NativeKeyManagementRow["facts"] = {
    ref: {
      accountId: "a",
      siteType: SITE_TYPES.RELAYFOR,
      scopeKey: "default",
      resourceId: "1",
    },
    displayName: "Key",
    maskedLabel: "masked",
    status: "enabled",
    fields: [],
    actions: { canUpdate: true, canDelete: true },
    displayFacts: [
      {
        fieldId: "quota",
        kind: "money",
        role: "remaining",
        amountUsd: 0,
        followsAccount: true,
      },
      { fieldId: "inherited", kind: "rate-limit", rpm: 0, concurrency: 0 },
      { fieldId: "explicit", kind: "rate-limit", rpm: 20, concurrency: 3 },
      ...(["5h", "day", "week", "month"] as const).map((window) => ({
        fieldId: window,
        kind: "budget" as const,
        window,
        limitUsd: 2,
        usedUsd: 1,
        remainingUsd: 0.8,
        reservedUsd: 0.2,
        nextResetAt: window === "day" ? "2027-01-01T16:00:00Z" : undefined,
      })),
    ],
  }
  const details = getAccountKeyResourceCardAdapter(
    SITE_TYPES.RELAYFOR,
  ).buildDetailFacts(facts, t)
  expect(details[0]?.value).toBe("keyManagement:native.editor.followsAccount")
  expect(details[1]?.value).toBe(
    "RPM keyManagement:native.editor.followsAccount · keyManagement:native.editor.keyConcurrency: keyManagement:native.editor.followsAccount",
  )
  expect(details[2]?.value).toBe(
    "RPM 20 · keyManagement:native.editor.keyConcurrency: 3",
  )
  expect(details.slice(3).map((f) => f.label)).toEqual([
    "keyManagement:native.editor.budget5h",
    "keyManagement:native.editor.budgetDay",
    "keyManagement:native.editor.budgetWeek",
    "keyManagement:native.editor.budgetMonth",
  ])
  expect(details[3]?.value).toContain(
    "keyManagement:native.editor.budgetRolling",
  )
  expect(details[4]?.value).toContain(
    "keyManagement:native.editor.budgetNextReset",
  )
  const timeLabel = ((key: string, options?: { time?: string }) =>
    key === "keyManagement:native.editor.budgetNextReset"
      ? options?.time
      : key) as TFunction
  const localized = getAccountKeyResourceCardAdapter(
    SITE_TYPES.RELAYFOR,
  ).buildDetailFacts(facts, timeLabel)
  expect(localized[4]?.value).toMatch(/GMT\+8|UTC\+8|CST/)
})

it.each([true, false])(
  "renders billing channels independently of account groups (default=%s)",
  (usesDefault) => {
    const row: NativeKeyManagementRow = {
      kind: "account-key-resource",
      rowKey: "krill",
      accountId: "a",
      accountName: "Krill",
      scopeName: "Account",
      facts: {
        ref: {
          accountId: "a",
          siteType: SITE_TYPES.KRILL,
          scopeKey: "account",
          resourceId: "1",
        },
        displayName: "Key",
        maskedLabel: "masked",
        status: "enabled",
        fields: [],
        actions: { canUpdate: true, canDelete: true },
        displayFacts: [
          {
            fieldId: "channels",
            kind: "channels",
            value: ["Openai 官渠"],
            usesDefault,
          },
        ],
      },
    }
    const card = getAccountKeyResourceCardAdapter(
      SITE_TYPES.KRILL,
    ).buildPresentation(row, t, { hasAssociatedSecret: false })
    expect(card.contextFact).toEqual({
      id: "channels",
      label: "keyManagement:keyDetails.channels",
      value: usesDefault
        ? "keyManagement:keyDetails.defaultChannels (Openai 官渠)"
        : "Openai 官渠",
    })
    expect(JSON.stringify(card)).not.toContain("followsAccountGroup")
  },
)

it("renders spend attribution as a billing fact without inventing a group", () => {
  const row: NativeKeyManagementRow = {
    kind: "account-key-resource",
    rowKey: "vercel",
    accountId: "a",
    accountName: "Vercel AI Gateway",
    scopeName: "Account",
    facts: {
      ref: {
        accountId: "a",
        siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
        scopeKey: "account",
        resourceId: "key_1",
      },
      displayName: "Production",
      maskedLabel: "vck_••••••••abc123",
      status: "enabled",
      fields: [],
      actions: { canUpdate: false, canDelete: true },
      displayFacts: [
        {
          fieldId: "spend_attribution",
          kind: "attribution",
          value: "team",
        },
      ],
    },
  }
  const card = getAccountKeyResourceCardAdapter(
    SITE_TYPES.VERCEL_AI_GATEWAY,
  ).buildPresentation(row, t, { hasAssociatedSecret: false })
  // Attribution is billing metadata, not a model-access group.
  expect(card.contextFact).toBeUndefined()
  expect(card.summaryFacts).not.toContainEqual(
    expect.objectContaining({ id: "group" }),
  )
  const attribution = getAccountKeyResourceCardAdapter(
    SITE_TYPES.VERCEL_AI_GATEWAY,
  ).buildDetailFacts(row.facts, t)
  expect(attribution).toContainEqual({
    id: "spend_attribution",
    label: "keyManagement:native.editor.vercelAiGateway.spendAttribution",
    value: "keyManagement:native.editor.vercelAiGateway.attribution.team",
  })
})

it("allocates complete inventory facts to summary or additional detail without overlap", () => {
  const facts: NativeKeyManagementRow["facts"] = {
    ref: {
      accountId: "a",
      siteType: SITE_TYPES.DAHL,
      scopeKey: "default",
      resourceId: "7",
    },
    detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
    displayName: "Key",
    maskedLabel: "masked",
    status: "enabled",
    actions: { canUpdate: true, canDelete: true },
    fields: [],
    displayFacts: [
      { fieldId: "credits", kind: "credits", value: 100 },
      { fieldId: "used", kind: "money", role: "used", amountUsd: 1 },
      { fieldId: "expires", kind: "expiry", timestampMs: "never" },
      {
        fieldId: "models",
        kind: "restriction",
        role: "models",
        value: ["model-a"],
      },
    ],
    runtimeKey: {
      createdAt: 1,
      notes: "Extra note",
      modelAccess: { groups: [], allowedModelIds: null, suggestedModelIds: [] },
    },
  }
  const card = getAccountKeyResourceCardAdapter(
    SITE_TYPES.DAHL,
  ).buildPresentation(
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
  expect(card.summaryFacts.map((fact) => fact.id)).toEqual([
    "credits",
    "used",
    "expires",
    "models",
  ])
  expect(card.detailFacts.map((fact) => fact.id)).toEqual(["createdAt", "note"])
})

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

it("formats native Token facts with their asset unit and quota role", () => {
  const facts: NativeKeyManagementRow["facts"] = {
    ref: {
      accountId: "a",
      siteType: SITE_TYPES.EMRANK,
      scopeKey: "account",
      resourceId: "1",
    },
    displayName: "Key",
    maskedLabel: "masked",
    status: "enabled",
    fields: [],
    actions: { canUpdate: true, canDelete: true },
    displayFacts: [
      {
        fieldId: "used",
        kind: "quota",
        role: "used",
        value: 1234567,
        asset: {
          id: "https://emrank.tech/token",
          label: "Token",
          displayScale: 1000000,
          displayLabel: "M Token",
        },
      },
    ],
  }
  expect(
    getAccountKeyResourceCardAdapter(SITE_TYPES.EMRANK).buildDetailFacts(
      facts,
      t,
    ),
  ).toContainEqual({
    id: "used",
    label: "keyManagement:keyDetails.usedQuota",
    value: "1.234567 M Token",
  })
  expect(
    getAccountKeyResourceCardAdapter(SITE_TYPES.EMRANK).buildDetailFacts(
      {
        ...facts,
        displayFacts: [
          {
            fieldId: "total",
            kind: "quota",
            role: "total",
            value: 1234567,
            asset: {
              id: "token",
              label: "Token",
              displayScale: 1000000,
              displayLabel: "M Token",
            },
          },
        ],
      },
      t,
    ),
  ).toContainEqual({
    id: "total",
    label: "keyManagement:keyDetails.totalQuota",
    value: "1.234567 M Token",
  })
})

describe("Requesty key highlights", () => {
  const requestyRow = (
    overrides: Partial<NativeKeyManagementRow["facts"]> = {},
  ): NativeKeyManagementRow => ({
    kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.AccountKeyResource,
    rowKey: "row-1",
    accountId: "account-1",
    accountName: "Requesty",
    scopeName: "Requesty",
    facts: {
      ref: {
        accountId: "account-1",
        siteType: SITE_TYPES.REQUESTY,
        scopeKey: "default",
        resourceId: "key-1",
      },
      displayName: "hub-probe",
      maskedLabel: "masked",
      status: "enabled",
      detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
      fields: [],
      actions: { canUpdate: true, canDelete: true },
      displayFacts: [
        {
          fieldId: "permissions",
          kind: "permission",
          role: "manage",
          granted: true,
        },
      ],
      ...overrides,
    },
  })
  const adapter = getAccountKeyResourceCardAdapter(SITE_TYPES.REQUESTY)

  it("labels Requesty's cap with its monthly window", () => {
    const details = adapter.buildDetailFacts(
      requestyRow({
        displayFacts: [
          {
            fieldId: "monthly_limit",
            kind: "money",
            role: "total",
            amountUsd: 10,
          },
        ],
      }).facts,
      t,
    )
    expect(details).toContainEqual({
      id: "monthly_limit",
      label: "keyManagement:native.editor.requestyMonthlyLimit",
      value: "$10",
    })
  })

  it("labels management access as a permission instead of a model restriction", () => {
    const details = adapter.buildDetailFacts(requestyRow().facts, t)
    expect(details).toContainEqual({
      id: "permissions",
      label: "keyManagement:native.permission.manage",
      value: "keyManagement:native.permission.manageGranted",
    })
  })

  it("combines current account usage and management permission in a single badge", () => {
    const manageOnly = adapter.buildPresentation(requestyRow(), t, {
      hasAssociatedSecret: false,
    })
    expect(manageOnly.badges).toEqual([
      {
        id: "manage-permission",
        label: "keyManagement:native.badges.managePermission",
        variant: "warning",
        title: "keyManagement:native.permission.manageBadgeTitle",
      },
    ])

    const credential = adapter.buildPresentation(
      requestyRow({ credentialRole: ACCOUNT_KEY_CREDENTIAL_ROLES.Account }),
      t,
      { hasAssociatedSecret: false },
    )
    expect(credential.badges).toEqual([
      {
        id: "manage-permission",
        label: "keyManagement:native.badges.accountManagePermission",
        variant: "warning",
        title: "keyManagement:native.permission.accountManageBadgeTitle",
      },
    ])
  })

  it("does not infer management permission from current account usage alone", () => {
    const presentation = adapter.buildPresentation(
      requestyRow({
        credentialRole: ACCOUNT_KEY_CREDENTIAL_ROLES.Account,
        displayFacts: [],
      }),
      t,
      { hasAssociatedSecret: false },
    )
    expect(presentation.badges).toEqual([
      {
        id: "account-credential",
        label: "keyManagement:native.badges.accountCredential",
        variant: "outline",
        title: "keyManagement:native.credentialRole.badgeTitle",
      },
    ])
  })

  it("leaves inference-only keys without highlights", () => {
    const presentation = adapter.buildPresentation(
      requestyRow({
        displayFacts: [
          {
            fieldId: "permissions",
            kind: "permission",
            role: "manage",
            granted: false,
          },
        ],
      }),
      t,
      { hasAssociatedSecret: false },
    )
    expect(presentation.badges).toBeUndefined()
  })
})

describe("Requesty credential action policy", () => {
  const row = (
    overrides: Partial<NativeKeyManagementRow["facts"]> = {},
  ): NativeKeyManagementRow => ({
    kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.AccountKeyResource,
    rowKey: "row-1",
    accountId: "account-1",
    accountName: "Requesty",
    scopeName: "Requesty",
    facts: {
      ref: {
        accountId: "account-1",
        siteType: SITE_TYPES.REQUESTY,
        scopeKey: "default",
        resourceId: "key-1",
      },
      displayName: "hub-probe",
      maskedLabel: "masked",
      status: "enabled",
      detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
      fields: [],
      actions: { canUpdate: true, canDelete: true },
      runtimeKey: {
        modelAccess: {
          groups: null,
          allowedModelIds: null,
          suggestedModelIds: [],
        },
        ...overrides.runtimeKey,
      },
      ...overrides,
    },
  })
  const adapter = getAccountKeyResourceCardAdapter(SITE_TYPES.REQUESTY)
  const build = (target: NativeKeyManagementRow) =>
    adapter.buildPresentation(target, t, { hasAssociatedSecret: false })

  it("lets the account's own credential be read but never exported", () => {
    const actions = build(
      row({
        credentialRole: ACCOUNT_KEY_CREDENTIAL_ROLES.Account,
        runtimeKey: {
          modelAccess: {
            groups: null,
            allowedModelIds: null,
            suggestedModelIds: [],
          },
          inference: false,
        },
      }),
    ).actions
    expect(actions).toMatchObject({
      copySecret: true,
      revealSecret: true,
      verifySecret: true,
      exportSecret: false,
      batchSelect: false,
    })
  })

  it("keeps an ordinary inference key exportable once its secret is known", () => {
    const target = row({
      runtimeKey: {
        modelAccess: {
          groups: null,
          allowedModelIds: null,
          suggestedModelIds: [],
        },
        inference: true,
      },
    })
    const withSecret = adapter.buildPresentation(target, t, {
      hasAssociatedSecret: true,
    })
    expect(withSecret.actions).toMatchObject({
      copySecret: true,
      exportSecret: true,
      batchSelect: true,
    })

    // A management key with the same known secret still stays inside the extension.
    const manageTarget = row({
      runtimeKey: {
        modelAccess: {
          groups: null,
          allowedModelIds: null,
          suggestedModelIds: [],
        },
        inference: false,
      },
    })
    expect(
      adapter.buildPresentation(manageTarget, t, { hasAssociatedSecret: true })
        .actions,
    ).toMatchObject({
      copySecret: true,
      exportSecret: false,
      batchSelect: false,
    })
  })
})
