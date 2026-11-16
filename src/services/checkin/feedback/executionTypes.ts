/** Record availability is independent of the outcome of a check-in attempt. */
export const FEEDBACK_EXECUTION_RECORDS = {
  Available: "available",
  Invalid: "invalid_record",
  NoHistory: "no_history",
  ReadFailed: "read_failed",
  NotLinked: "not_linked",
} as const

export type FeedbackExecutionRecord =
  (typeof FEEDBACK_EXECUTION_RECORDS)[keyof typeof FEEDBACK_EXECUTION_RECORDS]

/** Identifies the evidence source without implying that a command ran. */
export const FEEDBACK_EXECUTION_SOURCES = {
  SavedHistory: "saved_history",
  ProvidedResult: "provided_result",
  UnlinkedDraft: "unlinked_draft",
} as const

export type FeedbackExecutionSource =
  (typeof FEEDBACK_EXECUTION_SOURCES)[keyof typeof FEEDBACK_EXECUTION_SOURCES]
