export const QUESTION_ANSWER_TEST_ID = "question-answer" as const

export const QUESTION_ANSWER_OUTCOMES = {
  Matched: "matched",
  Mismatched: "mismatched",
  Manual: "manual",
  Ungraded: "ungraded",
  Empty: "empty",
  Incomplete: "incomplete",
} as const
export type QuestionAnswerOutcome =
  (typeof QUESTION_ANSWER_OUTCOMES)[keyof typeof QUESTION_ANSWER_OUTCOMES]
