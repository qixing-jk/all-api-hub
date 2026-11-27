import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ACCOUNT_FORM_FIELDS,
  ACCOUNT_FORM_ISSUE_KINDS,
  type AccountFormIssue,
} from "~/services/accounts/editing/accountFormValidation"

import {
  ACCOUNT_FORM_FEEDBACK_STAGES,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  ACCOUNT_ISSUE_SECTIONS,
  type AccountFormFeedbackStage,
} from "./accountFormSections"

export interface AccountFormFieldAttributes {
  "data-account-validation-field": AccountFormIssue["field"]
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/** Controls when field and section validation messages become visible. */
export function useAccountFormFeedback(
  validationIssues: readonly AccountFormIssue[] = [],
  feedbackStage?: AccountFormFeedbackStage,
  compact?: boolean,
) {
  const { t } = useTranslation("accountDialog")
  const feedbackPrefix = useId()
  const [visitedFields, setVisitedFields] = useState<
    ReadonlySet<AccountFormIssue["field"]>
  >(() => new Set())
  const visibleIssues = validationIssues.filter(
    ({ field, kind }) =>
      feedbackStage ||
      (kind === ACCOUNT_FORM_ISSUE_KINDS.INVALID && visitedFields.has(field)),
  )
  const issueIsError = (issue: AccountFormIssue) =>
    feedbackStage === ACCOUNT_FORM_FEEDBACK_STAGES.SUBMITTED ||
    issue.kind === ACCOUNT_FORM_ISSUE_KINDS.INVALID
  const issueForField = (field: AccountFormIssue["field"]) =>
    visibleIssues.find(
      (issue) =>
        !(
          compact &&
          field === ACCOUNT_FORM_FIELDS.ACCESS_TOKEN &&
          !issueIsError(issue)
        ) &&
        issue.field === field &&
        (issueIsError(issue) || validationIssues[0]?.field === field),
    )
  const issueMessage = ({ field, kind }: AccountFormIssue) => {
    if (kind === ACCOUNT_FORM_ISSUE_KINDS.MISSING)
      return t("validation.requiredField")
    if (field === ACCOUNT_FORM_FIELDS.EXCHANGE_RATE)
      return t("form.validRateError")
    if (field === ACCOUNT_FORM_FIELDS.MANUAL_BALANCE_USD)
      return t("form.manualBalanceUsdError")
    return t("validation.invalidField")
  }
  const fieldStatus = (field: AccountFormIssue["field"]) => {
    const issue = issueForField(field)
    if (!issue) return null
    return (
      <p
        id={`${feedbackPrefix}-${field}`}
        className={
          issueIsError(issue)
            ? "text-xs text-destructive-text"
            : "text-xs text-warning-text"
        }
      >
        {issueMessage(issue)}
      </p>
    )
  }
  const fieldStatusProps = (
    field: AccountFormIssue["field"],
  ): AccountFormFieldAttributes => {
    const issue = issueForField(field)
    return {
      "data-account-validation-field": field,
      "aria-invalid": issue && issueIsError(issue) ? true : undefined,
      "aria-describedby": issue ? `${feedbackPrefix}-${field}` : undefined,
    }
  }
  const rememberField = (target: HTMLElement) => {
    const field = target.dataset.accountValidationField as
      AccountFormIssue["field"] | undefined
    if (!field || visitedFields.has(field)) return
    setVisitedFields((current) => new Set(current).add(field))
  }
  const issueSections = visibleIssues.reduce<
    Partial<Record<string, AccountFormIssue["kind"]>>
  >((statuses, issue) => {
    const section =
      ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_ISSUE_SECTIONS[issue.field]]
    if (statuses[section] !== ACCOUNT_FORM_ISSUE_KINDS.INVALID)
      statuses[section] = issueIsError(issue)
        ? ACCOUNT_FORM_ISSUE_KINDS.INVALID
        : ACCOUNT_FORM_ISSUE_KINDS.MISSING
    return statuses
  }, {})
  return { fieldStatus, fieldStatusProps, rememberField, issueSections }
}
