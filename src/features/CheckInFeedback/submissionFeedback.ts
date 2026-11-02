/** Submission results also name their existing accountDialog translation keys. */
export const SUBMISSION_FEEDBACK = {
  COPIED: "copied",
  COPY_FAILED: "copyFailed",
  OPEN_FAILED: "openFailed",
  OPENED: "opened",
  PASTE: "paste",
} as const

export type SubmissionFeedback =
  (typeof SUBMISSION_FEEDBACK)[keyof typeof SUBMISSION_FEEDBACK]
