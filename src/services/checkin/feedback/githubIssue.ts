import { REPO_URL } from "~/constants/about"

/** Destination and budgets shared by report links and background navigation validation. */
export const CHECKIN_FEEDBACK_ISSUE_URL = `${REPO_URL}/issues/new`
export const CHECKIN_FEEDBACK_ISSUE_LIMITS = {
  urlLength: 6000,
  titleLength: 200,
  versionLength: 100,
  summaryLength: 300,
  hintTextLength: 2000,
  hintLifetimeMs: 30 * 60 * 1000,
} as const

/** GitHub issue-form IDs; keep their wire values aligned with checkin_adaptation.yml. */
export const CHECKIN_FEEDBACK_ISSUE_FIELDS = {
  TEMPLATE: "template",
  TITLE: "title",
  SITE_URL: "site-url",
  VERSION: "extension-version",
  SUMMARY: "summary",
  FEEDBACK: "feedback",
} as const

export interface GitHubFeedbackHint {
  title: string
  description: string
  dismiss: string
}

export type GitHubFeedbackHintPresentation = GitHubFeedbackHint & {
  targetUrl: string
  expiresAt: number
  withdraw?: boolean
}
