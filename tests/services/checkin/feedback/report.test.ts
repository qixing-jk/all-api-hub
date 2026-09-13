import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildCheckInFeedbackDetails,
  buildCheckInFeedbackIssue,
  composeCheckInFeedback,
  getFeedbackOrigin,
} from "~/services/checkin/feedback/report"
import { AuthTypeEnum } from "~/types"
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
    expect(url.searchParams.get("body")).toBe(body)
    expect(url.searchParams.get("template")).toBe("checkin_adaptation.md")
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
    const issue = buildCheckInFeedbackIssue("签到".repeat(4000), "request")
    expect(issue.needsCopy).toBe(true)
    expect(new URL(issue.url).searchParams.has("body")).toBe(false)
    expect(new URL(issue.url).searchParams.get("template")).toBe(
      "checkin_adaptation.md",
    )
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
