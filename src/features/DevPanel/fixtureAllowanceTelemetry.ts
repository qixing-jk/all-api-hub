/**
 * Synthetic telemetry snapshots for the dev panel's allowance fixtures.
 *
 * The credential library's "how much is left" surfaces (meters, badges, the
 * library summary) only render when a provider reports usable telemetry, which
 * is exactly what a developer without a real coding-plan key cannot produce.
 * These snapshots cover one fixture per state so the dashboard can be exercised
 * by hand, and they seed the same states an automated run would need.
 *
 * Values are fixed so runs are comparable; only reset times are relative, so a
 * countdown never starts out already expired.
 */

import { SiteHealthStatus } from "~/types"
import type { ApiCredentialTelemetrySnapshot } from "~/types/apiCredentialProfiles"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const USD = { kind: "money", currency: "USD", decimalPlaces: 2 } as const
const PROVIDER_QUOTA = {
  kind: "quota",
  code: "provider-quota",
  label: "Provider quota",
} as const
const PERCENT = { kind: "percent" } as const
const REQUESTS = { kind: "count", code: "requests" } as const
const TOKENS = { kind: "count", code: "tokens" } as const

/** Builds a healthy snapshot whose values are already normalized facts. */
function snapshot(
  source: ApiCredentialTelemetrySnapshot["source"],
  endpoint: string,
  facts: ApiCredentialTelemetrySnapshot["facts"],
  now: number,
): ApiCredentialTelemetrySnapshot {
  return {
    attempts: [
      {
        source: source!,
        endpoint,
        status: "success",
        message: "Fetched usage",
      },
    ],
    health: { status: SiteHealthStatus.Healthy },
    lastSyncTime: now - 3 * MINUTE,
    lastSuccessTime: now - 3 * MINUTE,
    source,
    facts,
  }
}

export type DevAllowanceFixtureDefinition = {
  /** Stable id used by tests and by the fixture counter. */
  id: string
  name: string
  notes: string
  /**
   * Builds this fixture's snapshot, or `undefined` for the state where the
   * provider reports nothing at all.
   */
  buildSnapshot: (now: number) => ApiCredentialTelemetrySnapshot | undefined
}

export const DEV_ALLOWANCE_FIXTURES: readonly DevAllowanceFixtureDefinition[] =
  [
    {
      id: "five-hour-critical",
      name: "Dev Allowance: 5h critical, weekly low",
      notes:
        "Dev fixture: synthetic coding-plan telemetry; this endpoint cannot be reached.",
      buildSnapshot: (now) =>
        snapshot(
          "kimiQuota",
          "/coding/v1/usages",
          {
            quota: {
              membershipLevel: "LEVEL_PRO",
              windows: [
                {
                  type: "fiveHour",
                  used: 86,
                  limit: 100,
                  remaining: 14,
                  remainingPercent: 14,
                  unit: PROVIDER_QUOTA,
                  resetTime: now + 2 * HOUR + 14 * MINUTE,
                },
                {
                  type: "weekly",
                  used: 550,
                  limit: 1000,
                  remaining: 450,
                  remainingPercent: 45,
                  unit: PROVIDER_QUOTA,
                  resetTime: now + 3 * DAY + HOUR,
                },
              ],
            },
            usage: {
              todayCost: { value: 1.42, unit: USD },
              todayRequests: { value: 128, unit: REQUESTS },
              todayTokens: {
                upload: 810_000,
                download: 430_000,
                total: 1_240_000,
                unit: TOKENS,
              },
            },
            models: { count: 12, preview: ["claude-sonnet-5", "kimi-k2"] },
          },
          now,
        ),
    },
    {
      id: "monthly-healthy",
      name: "Dev Allowance: monthly healthy",
      notes:
        "Dev fixture: synthetic coding-plan telemetry; this endpoint cannot be reached.",
      buildSnapshot: (now) =>
        snapshot(
          "glmQuota",
          "/api/monitor/usage/quota/limit",
          {
            quota: {
              windows: [
                {
                  type: "monthly",
                  used: 2200,
                  limit: 10000,
                  remaining: 7800,
                  remainingPercent: 78,
                  unit: PROVIDER_QUOTA,
                  resetTime: now + 18 * DAY,
                },
              ],
            },
            usage: {
              todayCost: { value: 0.86, unit: USD },
              todayRequests: { value: 64, unit: REQUESTS },
            },
          },
          now,
        ),
    },
    {
      id: "balance-runway-critical",
      name: "Dev Allowance: balance runway critical",
      notes:
        "Dev fixture: synthetic wallet telemetry; this endpoint cannot be reached.",
      buildSnapshot: (now) =>
        snapshot(
          "newApiTokenUsage",
          "/api/usage/token/",
          {
            balances: [{ amount: 5.2, unit: USD, semantics: "cash" }],
            usage: {
              todayCost: { value: 2.08, unit: USD },
              todayRequests: { value: 340, unit: REQUESTS },
              totalUsed: { value: 94.8, unit: USD },
              totalGranted: { value: 100, unit: USD },
            },
            models: { count: 34, preview: ["gpt-5", "claude-sonnet-5"] },
          },
          now,
        ),
    },
    {
      id: "balance-without-spend",
      name: "Dev Allowance: balance without spend",
      notes:
        "Dev fixture: synthetic wallet telemetry with no cost reported, so no runway is estimated.",
      buildSnapshot: (now) =>
        snapshot(
          "deepSeekBalance",
          "/user/balance",
          {
            balances: [{ amount: 120, unit: USD, semantics: "cash" }],
            usage: { todayRequests: { value: 12, unit: REQUESTS } },
          },
          now,
        ),
    },
    {
      id: "percent-window",
      name: "Dev Allowance: percent-only window",
      notes:
        "Dev fixture: synthetic telemetry that reports a percentage without absolute amounts.",
      buildSnapshot: (now) =>
        snapshot(
          "openCodeGoUsage",
          "/v1/usage",
          {
            quota: {
              windows: [
                {
                  type: "fiveHour",
                  remainingPercent: 52,
                  unit: PERCENT,
                  resetTime: now + 2 * HOUR + 14 * MINUTE,
                },
              ],
            },
          },
          now,
        ),
    },
    {
      id: "no-telemetry",
      name: "Dev Allowance: no telemetry",
      notes:
        "Dev fixture: intentionally has no snapshot, to exercise the unmonitored state.",
      buildSnapshot: () => undefined,
    },
  ]
