import assert from "node:assert/strict"
import test from "node:test"

import {
  filterUsageDashboardRecords,
  filterUsageRecords,
  gatewaySpent,
  groupUsageDashboardByDay,
  groupUsageDashboardByTarget,
  localDateKey,
  summarizeUsageDashboard,
  summarizeUsageRecords,
  usageState,
} from "../public/usageStats.js"

const records = [
  {
    targetName: "主站",
    providerName: "OpenRouter",
    channelName: "router-one",
    channelId: 1,
    keyHint: "••••1111",
    keyFingerprint: "abc",
    quota: 100,
    gatewaySpent: 12.5,
    spent: 40,
    usageStatus: "available",
    requestCount: 3,
    promptTokens: 100,
    completionTokens: 25,
    checkedAt: "2026-07-08T01:00:00.000Z",
  },
  {
    targetName: "备用站",
    providerName: "OpenAI",
    channelName: "openai-two",
    channelId: 2,
    quota: null,
    gatewaySpent: 0,
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    checkedAt: "2026-07-08T02:00:00.000Z",
  },
  {
    targetName: "主站",
    providerName: "AWS Bedrock",
    channelName: "aws-three",
    channelId: 3,
    quota: 50,
    gatewaySpent: null,
    usageStatus: "awaiting-balance",
  },
]

test("uses gateway consumption instead of an upstream balance difference", () => {
  assert.equal(gatewaySpent(records[0]), 12.5)
  assert.equal(usageState(records[0]), "used")
  assert.equal(usageState(records[1]), "unused")
  assert.equal(usageState(records[2]), "pending")
})

test("summarizes quota, New API cost, requests and tokens", () => {
  assert.deepEqual(summarizeUsageRecords(records), {
    recordCount: 3,
    quotaTotal: 150,
    knownQuotaCount: 2,
    unknownQuotaCount: 1,
    trackedCount: 2,
    trackedQuotaTotal: 100,
    trackedRemainingTotal: 87.5,
    gatewaySpentTotal: 12.5,
    requestCount: 3,
    promptTokens: 100,
    completionTokens: 25,
    usedKeyCount: 1,
    unusedKeyCount: 1,
    pendingCount: 1,
    incompleteCount: 0,
    detailIncompleteCount: 0,
    lastCheckedAt: Date.parse("2026-07-08T02:00:00.000Z"),
  })
})

test("filters by site, provider, state and searchable record identity", () => {
  assert.deepEqual(
    filterUsageRecords(records, { target: "主站", status: "pending" }),
    [records[2]],
  )
  assert.deepEqual(
    filterUsageRecords(records, {
      provider: "OpenRouter",
      query: "1111",
    }),
    [records[0]],
  )
})

test("filters dashboard records by exact New API address and local import date", () => {
  const importedAt = new Date(2026, 6, 8, 12).toISOString()
  const nextDay = new Date(2026, 6, 9, 12).toISOString()
  const dashboardRecords = [
    { targetUrl: "https://one.example", importedAt },
    { targetUrl: "https://two.example", importedAt },
    { targetUrl: "https://one.example", importedAt: nextDay },
    { targetUrl: "https://one.example", importedAt: "invalid" },
  ]

  assert.deepEqual(
    filterUsageDashboardRecords(dashboardRecords, {
      targetUrl: "https://one.example",
      startDate: localDateKey(importedAt),
      endDate: localDateKey(importedAt),
    }),
    [dashboardRecords[0]],
  )
})

test("calculates remaining percentage only from refreshed known quotas", () => {
  const summary = summarizeUsageDashboard([
    { quota: 100, gatewaySpent: 25 },
    { quota: 50, gatewaySpent: null },
    { quota: null, gatewaySpent: 10 },
  ])

  assert.equal(summary.quotaTotal, 150)
  assert.equal(summary.gatewaySpentTotal, 35)
  assert.equal(summary.trackedQuotaTotal, 100)
  assert.equal(summary.trackedRemainingTotal, 75)
  assert.equal(summary.remainingPercent, 75)
  assert.equal(summary.coveragePercent, (2 / 3) * 100)
})

test("groups dashboard summaries by New API address and import day", () => {
  const firstDay = new Date(2026, 6, 8, 12).toISOString()
  const secondDay = new Date(2026, 6, 9, 12).toISOString()
  const dashboardRecords = [
    {
      targetName: "主站",
      targetUrl: "https://one.example",
      importedAt: firstDay,
      quota: 100,
      gatewaySpent: 20,
    },
    {
      targetName: "备用站",
      targetUrl: "https://two.example",
      importedAt: secondDay,
      quota: 50,
      gatewaySpent: 5,
    },
  ]

  const targets = groupUsageDashboardByTarget(dashboardRecords)
  assert.equal(targets.length, 2)
  assert.equal(targets[0].summary.recordCount, 1)

  const days = groupUsageDashboardByDay(dashboardRecords)
  assert.deepEqual(
    days.map((day) => day.date),
    [localDateKey(firstDay), localDateKey(secondDay)],
  )
  assert.equal(days[1].summary.remainingPercent, 90)
})
