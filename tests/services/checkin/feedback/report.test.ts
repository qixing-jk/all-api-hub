import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildCheckInFeedbackDetails,
  buildCheckInFeedbackIssue,
  composeCheckInFeedback,
  getFeedbackOrigin,
} from "~/services/checkin/feedback/report"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type { CheckInConfig } from "~/types/checkIn"

describe("check-in feedback report", () => {
  const labels = {
    site: "Site",
    problem: "What happened",
    details: "Diagnostics",
    clues: "Clues",
  }
  const checkIn: CheckInConfig = {
    automaticExecutionEnabled: true,
    selection: { mode: "automatic" },
    methodKnowledge: { methods: {} },
  }

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.UNKNOWN])(
    "groups diagnosis before execution, refresh and environment for %s",
    (siteType) => {
      const report = buildCheckInFeedbackDetails(
        {
          siteType,
          baseUrl: "https://example.com",
          checkIn,
        },
        { version: "1", platform: "chromium" },
      )
      const groups = [
        "checkInAssessment:",
        "recentExecution:",
        "accountRefresh:",
        "environment:",
      ]
      const positions = groups.map((group) => report.indexOf(group))
      expect(positions.every((position) => position >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    },
  )

  it("reports saved refresh health with its attempt time and age, without claiming other APIs work", () => {
    const report = buildCheckInFeedbackDetails(
      {
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://example.com",
        checkIn,
        refresh: {
          health: { status: SiteHealthStatus.Error },
          last_sync_time: 1000,
        },
      },
      { version: "1", platform: "chromium", now: 61000 },
    )
    expect(report).toContain("accountRefreshSource: saved_account")
    expect(report).toContain("accountRefreshHealth: error")
    expect(report).toContain(
      "accountRefreshRecordedAt: 1970-01-01T00:00:01.000Z",
    )
    expect(report).toContain("accountRefreshAgeSeconds: 60")
    expect(report).toContain("otherApiCapabilities: not_inspected")
    expect(report).not.toContain("lastSuccessful")
  })

  it("reports the selected Agent Router login method using the account origin", () => {
    const report = buildCheckInFeedbackDetails(
      {
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://agentrouter.org",
        checkIn: {
          ...checkIn,
          selection: {
            mode: "automatic",
            methodId: "agentrouter:login-checkin",
          },
          methodKnowledge: {
            methods: {
              "agentrouter:login-checkin": {
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: 1 },
                },
              },
            },
          },
        },
      },
      { version: "1", platform: "chromium" },
    )
    expect(report).toContain("agentrouter:login-checkin")
    expect(report).toContain("selected")
    expect(report).not.toContain("stale")
  })

  it("includes controlled authentication and execution facts without raw account data", () => {
    const report = buildCheckInFeedbackDetails(
      {
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://example.com",
        checkIn,
        authType: AuthTypeEnum.AccessToken,
        execution: {
          status: "failed",
          reasonCode: "permission_denied",
          timestamp: 1,
        },
      },
      { version: "1", platform: "chromium" },
    )
    expect(report).toContain(`authentication: ${AuthTypeEnum.AccessToken}`)
    expect(report).toContain("automaticExecutionEnabled: true")
    expect(report).toContain("executionRecordedAt: 1970-01-01T00:00:00.001Z")
  })

  it("retains unknown detection and status reasons without inventing an execution timestamp", () => {
    const report = buildCheckInFeedbackDetails(
      {
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://example.com",
        execution: { status: "failed" },
        checkIn: {
          ...checkIn,
          methodKnowledge: {
            methods: {
              "new-api:daily-checkin": {
                detection: {
                  outcome: "unknown",
                  reason: "permission_denied",
                  attemptedAt: 2,
                },
                status: {
                  outcome: "unknown",
                  reason: "permission_denied",
                  attemptedAt: 3,
                },
              },
            },
          },
        },
      },
      { version: "1", platform: "chromium" },
    )
    expect(report).toContain("unknown (permission_denied)")
    expect(report).toContain("savedStatus: unknown")
    expect(report).toContain("1970-01-01T00:00:00.003Z")
    expect(report).not.toContain("executionRecordedAt")
  })

  it("omits credentials and distinguishes uninspected, retained and failed evidence", () => {
    const report = buildCheckInFeedbackDetails(
      {
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://private.example",
        checkIn: {
          ...checkIn,
          methodKnowledge: {
            methods: {
              "new-api:daily-checkin": {
                status: {
                  outcome: "known",
                  availability: "enabled",
                  today: "checked",
                  evidence: { source: "execution", observedAt: 3 },
                },
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: 1 },
                  lastUnknownAttempt: {
                    reason: "permission_denied",
                    attemptedAt: 2,
                  },
                },
              },
            },
          },
        },
        account_info: { access_token: "secret-token" },
      } as Parameters<typeof buildCheckInFeedbackDetails>[0],
      { version: "1", platform: "chromium" },
    )
    expect(report).toContain(
      "new-api:daily-checkin: unknown (permission_denied)",
    )
    expect(report).not.toContain("secret-token")
    expect(report).toContain(
      "savedStatus: known; availability: enabled; today: checked; recordedAt: 1970-01-01T00:00:00.003Z",
    )
    expect(report).toContain("execution: unavailable")
    expect(report).not.toContain("private.example")
    expect(
      buildCheckInFeedbackDetails(
        { siteType: SITE_TYPES.NEW_API, baseUrl: "", checkIn },
        { version: "1", platform: "firefox" },
      ),
    ).toContain("not_inspected")
    expect(
      buildCheckInFeedbackDetails(
        { siteType: SITE_TYPES.UNKNOWN, baseUrl: "", checkIn },
        { version: "1", platform: "firefox" },
      ),
    ).toContain("no_registered_candidates")
  })

  it("distinguishes a stale selection from matched evidence without a failed retry", () => {
    const report = buildCheckInFeedbackDetails(
      {
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://example.com",
        checkIn: {
          ...checkIn,
          selection: { mode: "manual", methodId: "agentrouter:login-checkin" },
          methodKnowledge: {
            methods: {
              "new-api:daily-checkin": {
                detection: {
                  outcome: "matched",
                  evidence: { source: "probe", observedAt: 1 },
                },
              },
            },
          },
        },
      },
      { version: "1", platform: "chromium" },
    )
    expect(report).toContain("selectionStatus: stale")
    expect(report).toContain("new-api:daily-checkin: matched")
    expect(report).not.toContain("permission_denied")
  })

  it.each([{ availability: "disabled", today: "not_checked" }, {}] as const)(
    "preserves incomplete known status facts: %j",
    (facts) => {
      const report = buildCheckInFeedbackDetails(
        {
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          checkIn: {
            ...checkIn,
            methodKnowledge: {
              methods: {
                "new-api:daily-checkin": {
                  detection: {
                    outcome: "matched",
                    evidence: { source: "probe", observedAt: 1 },
                  },
                  status: {
                    outcome: "known",
                    ...facts,
                    evidence: { source: "probe", observedAt: 1 },
                  },
                },
              },
            },
          },
        },
        { version: "1", platform: "chromium" },
      )
      expect(report).toContain(
        "availability: " +
          ("availability" in facts ? facts.availability : "unknown"),
      )
      expect(report).toContain(
        "today: " + ("today" in facts ? facts.today : "unknown"),
      )
    },
  )

  it("normalizes the optional address and preserves edited content exactly through GitHub encoding", () => {
    const origin = getFeedbackOrigin(
      "https://name:password@example.com:8443/path?token=secret#fragment",
    )
    expect(origin).toBe("https://example.com:8443")
    expect(getFeedbackOrigin("javascript:alert(1)")).toBeNull()
    expect(getFeedbackOrigin("not a URL")).toBeNull()
    const body = composeCheckInFeedback({
      labels,
      origin,
      notes: "签到失败 & + #\nkeep my edits",
      details: "edited details",
      clues: "",
    })
    expect(body).toContain("## What happened\n\n签到失败 & + #\nkeep my edits")
    expect(body).toContain('<td colspan="2">edited details</td>')
    const issue = buildCheckInFeedbackIssue(body, "请求 & help")
    const url = new URL(issue.url)
    expect(url.searchParams.get("feedback")).toBe(body)
    expect(url.searchParams.get("template")).toBe("checkin_adaptation.yml")
    expect(url.searchParams.get("title")).toBe("请求 & help")
    expect(issue.needsCopy).toBe(false)
    expect(
      composeCheckInFeedback({
        labels,
        origin: null,
        notes: "notes",
        details: "details",
        clues: "clues",
      }),
    ).not.toContain("deployment:")
  })

  it("keeps edited diagnostics literal when they contain Markdown fences", () => {
    const body = composeCheckInFeedback({
      labels,
      origin: null,
      notes: "",
      details: "```\n</details>\nkeep this",
      clues: "route_hint: /checkin",
    })
    expect(body).toContain(
      '<td colspan="2">```<br>&lt;/details&gt;<br>keep this</td>',
    )
    expect(body).not.toContain("## Site")
    expect(body).toContain("<summary>Clues</summary>")
  })

  it("does not truncate an oversized report into a misleading prefilled issue", () => {
    const issue = buildCheckInFeedbackIssue("签到".repeat(4000), "request", {
      origin: "https://example.com",
      version: "4.8.0",
      notes: "Website works",
    })
    expect(issue.needsCopy).toBe(true)
    const url = new URL(issue.url)
    expect(url.searchParams.has("feedback")).toBe(false)
    expect(url.searchParams.get("site-url")).toBe("https://example.com")
    expect(url.searchParams.get("extension-version")).toBe("4.8.0")
    expect(url.searchParams.get("summary")).toBe("Website works")
    expect(issue.url.length).toBeLessThanOrEqual(6000)
    expect(new URL(issue.url).searchParams.get("template")).toBe(
      "checkin_adaptation.yml",
    )
  })

  it("omits private addresses and keeps encoded links within the length budget", () => {
    const hidden = new URL(
      buildCheckInFeedbackIssue("x".repeat(7000), "request", {
        origin: null,
        version: "4.8.0",
        notes: "",
      }).url,
    )
    expect(hidden.searchParams.has("site-url")).toBe(false)
    const oversized = buildCheckInFeedbackIssue(
      "签到".repeat(4000),
      "请求".repeat(1000),
      {
        origin: `https://${"a".repeat(6500)}.example.com`,
        version: "版".repeat(1000),
        notes: "摘要".repeat(1000),
      },
    )
    expect(oversized.needsCopy).toBe(true)
    expect(oversized.url.length).toBeLessThanOrEqual(6000)
    expect(new URL(oversized.url).searchParams.has("feedback")).toBe(false)
  })

  it("lays out flat diagnostic fields while preserving literal values and nested evidence", () => {
    const body = composeCheckInFeedback({
      labels,
      origin: null,
      notes: "",
      details:
        "app: 1 (chromium)\nexecutionMessage: <img src=x> & **literal** | value\nmethods:\n  - new-api:daily-checkin: matched\n    savedStatus: known; today: checked\n  - sub2api-pro:daily-checkin: unknown",
      clues:
        "scan: partial\nGET /api/checkin: 200; shape: unknown\nresources: 1/1\nroute_hint: /custom/checkin",
    })
    expect(body).toContain('<th scope="row">app</th><td>1 (chromium)</td>')
    expect(body).toContain(
      '<th scope="row">execution message</th><td>&lt;img src=x&gt; &amp; **literal** | value</td>',
    )
    expect(body).toContain(
      '<th scope="row">new-api:daily-checkin</th><td>matched</td>',
    )
    expect(body).not.toContain("<img")
    expect(body).toContain(
      '<th scope="row">saved status</th><td>known; today: checked</td>',
    )
    expect(body).toContain(
      '<th scope="row">sub2api-pro:daily-checkin</th><td>unknown</td>',
    )
    expect(body).toContain(
      '<th scope="row">GET /api/checkin</th><td>200; shape: unknown</td>',
    )
    expect(body).toContain(
      '<th scope="row">route hint</th><td>/custom/checkin</td>',
    )
    expect(body).not.toContain("```")
  })
})
