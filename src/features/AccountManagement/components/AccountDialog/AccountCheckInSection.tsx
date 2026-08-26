import { CalendarDays, RefreshCw, Ticket } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  FormField,
  Input,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import {
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/AccountFormSection"
import { ACCOUNT_FORM_MOBILE_DEFAULT_OPEN } from "~/features/AccountManagement/components/AccountDialog/accountFormSections"
import {
  getCheckInMethodPresentation,
  getCheckInRedetectionFeedbackPresentation,
  getCheckInSelectionPresentation,
} from "~/features/AccountManagement/components/AccountDialog/checkInPresentation"
import type { AccountCheckInRedetectionFeedback } from "~/features/AccountManagement/components/AccountDialog/models"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { setCheckInSelection } from "~/services/checkin/autoCheckin/methods"
import type { CheckInConfig } from "~/types"

const AUTOMATIC_CHECK_IN_SELECTION_VALUE = "automatic"
const CHECK_IN_METHOD_HELPER_ID = "check-in-method-helper"
const OPEN_REDEEM_WITH_CHECKIN_CONTROL_ID = "open-redeem-with-checkin"

export const ACCOUNT_CHECK_IN_TARGET_IDS = {
  section: "account-check-in-config",
  method: "account-check-in-method",
  automaticExecution: "account-check-in-automatic-execution",
  redetect: "account-check-in-redetect",
  customUrl: "account-custom-check-in-url",
  redeemUrl: "account-custom-redeem-url",
} as const

interface AccountCheckInSectionProps {
  checkIn: CheckInConfig
  siteType: AccountSiteType
  onCheckInChange: (value: CheckInConfig) => void
  onCheckInSelectionChange: (value: CheckInConfig) => void
  onRedetectCheckInMethods: () => void
  isRedetectingCheckInMethods: boolean
  checkInRedetectionFeedback: AccountCheckInRedetectionFeedback | null
}

/** Renders method discovery, automatic intent, and custom check-in settings. */
export function AccountCheckInSection({
  checkIn,
  siteType,
  onCheckInChange,
  onCheckInSelectionChange,
  onRedetectCheckInMethods,
  isRedetectingCheckInMethods,
  checkInRedetectionFeedback,
}: AccountCheckInSectionProps) {
  const { t } = useTranslation("accountDialog")
  const inspection = inspectAccountCheckIn({ config: checkIn, siteType })
  const candidateMethodIds = inspection.choices.map((choice) => choice.methodId)
  const hasCandidates = candidateMethodIds.length > 0
  const shouldOfferRedetect =
    hasCandidates ||
    inspection.selectionState.status === CHECK_IN_SELECTION_STATUSES.Stale ||
    inspection.decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown
  const selectionPresentation = getCheckInSelectionPresentation(
    t,
    inspection,
    checkIn.selection,
  )
  const hasSelectedMethod =
    hasCandidates &&
    inspection.selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
  const selectedStatus =
    inspection.selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
      ? checkIn.methodKnowledge.methods[inspection.selectionState.methodId]
          ?.status
      : null
  const isSelectedMethodDisabled =
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    selectedStatus.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled
  const hasUnknownDetection =
    inspection.decision.outcome ===
      CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown &&
    Object.values(checkIn.methodKnowledge.methods).some(
      (method) =>
        method.detection?.outcome ===
        CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
    )
  const isSelectedStatusUnavailable =
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
  const redetectionFeedbackPresentation =
    getCheckInRedetectionFeedbackPresentation(t, checkInRedetectionFeedback)

  const setAutomaticSelection = () => {
    onCheckInSelectionChange(
      setCheckInSelection({
        config: checkIn,
        siteType,
        mode: CHECK_IN_SELECTION_MODES.Automatic,
      }),
    )
  }

  return (
    <AccountFormSection
      title={t("sections.checkInConfig.title")}
      defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["check-in"]}
      testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn}
      id={ACCOUNT_CHECK_IN_TARGET_IDS.section}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="space-y-1 sm:min-w-0 sm:flex-1">
          <p className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
            {t("form.checkInStatus")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isSelectedMethodDisabled
              ? t("form.checkInStatusDisabled")
              : isSelectedStatusUnavailable
                ? t("form.checkInStatusUnavailable")
                : hasUnknownDetection
                  ? t("form.checkInStatusUnknown")
                  : hasSelectedMethod
                    ? t("form.checkInStatusDesc")
                    : hasCandidates
                      ? t("form.checkInStatusPending")
                      : t("form.checkInStatusUnsupported")}
          </p>
        </div>
        {shouldOfferRedetect && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRedetectCheckInMethods}
            loading={isRedetectingCheckInMethods}
            id={ACCOUNT_CHECK_IN_TARGET_IDS.redetect}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            className="h-auto min-h-9 w-full max-w-full py-2 text-center break-words whitespace-normal sm:w-auto"
          >
            {isRedetectingCheckInMethods
              ? t("form.redetectingCheckInMethods")
              : t("form.redetectCheckInMethods")}
          </Button>
        )}
      </div>

      {redetectionFeedbackPresentation && (
        <Notice
          tone={redetectionFeedbackPresentation.tone}
          title={redetectionFeedbackPresentation.title}
          description={redetectionFeedbackPresentation.description}
          role={
            checkInRedetectionFeedback?.kind === "failed" ? "alert" : "status"
          }
          aria-live={
            checkInRedetectionFeedback?.kind === "failed"
              ? "assertive"
              : "polite"
          }
        />
      )}

      {hasCandidates && (
        <div className="space-y-2">
          <FormField label={t("form.checkInMethod")}>
            <Select
              value={
                checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Automatic
                  ? AUTOMATIC_CHECK_IN_SELECTION_VALUE
                  : checkIn.selection.methodId
              }
              onValueChange={(methodId) => {
                if (methodId === AUTOMATIC_CHECK_IN_SELECTION_VALUE) {
                  setAutomaticSelection()
                  return
                }
                const candidateMethodId = candidateMethodIds.find(
                  (candidate) => candidate === methodId,
                )
                if (!candidateMethodId) return
                onCheckInSelectionChange(
                  setCheckInSelection({
                    config: checkIn,
                    siteType,
                    mode: CHECK_IN_SELECTION_MODES.Manual,
                    methodId: candidateMethodId,
                  }),
                )
              }}
            >
              <SelectTrigger
                className="w-full"
                id={ACCOUNT_CHECK_IN_TARGET_IDS.method}
                aria-label={t("form.checkInMethod")}
                aria-describedby={CHECK_IN_METHOD_HELPER_ID}
                title={selectionPresentation.triggerLabel}
              >
                <SelectValue placeholder={t("form.checkInMethodNotSelected")}>
                  {selectionPresentation.triggerLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC_CHECK_IN_SELECTION_VALUE}>
                  {t("form.automaticCheckInSelection")}
                </SelectItem>
                {candidateMethodIds.map((methodId) => (
                  <SelectItem key={methodId} value={methodId}>
                    {getCheckInMethodPresentation(t, methodId).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <p
            id={CHECK_IN_METHOD_HELPER_ID}
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            <span>{selectionPresentation.helperText}</span>
            {selectionPresentation.selectedMethodDisclosure && (
              <span className="mt-1 block">
                {selectionPresentation.selectedMethodDisclosure}
              </span>
            )}
          </p>
          {checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Manual && (
            <Button
              type="button"
              variant="outline"
              onClick={setAutomaticSelection}
              className="h-auto min-h-9 max-w-full py-2 text-center break-words whitespace-normal"
            >
              {t("form.restoreAutomaticCheckInSelection")}
            </Button>
          )}
        </div>
      )}

      {hasCandidates && (
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex-1">
            <label
              htmlFor={ACCOUNT_CHECK_IN_TARGET_IDS.automaticExecution}
              className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
            >
              {t("form.autoCheckInEnabled")}
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {isSelectedMethodDisabled
                ? t("form.autoCheckInPausedBySiteDesc")
                : hasSelectedMethod
                  ? t("form.autoCheckInEnabledDesc")
                  : t("form.autoCheckInPendingDesc")}
            </p>
          </div>
          <Switch
            checked={checkIn.automaticExecutionEnabled}
            onChange={(automaticExecutionEnabled) =>
              onCheckInChange({ ...checkIn, automaticExecutionEnabled })
            }
            id={ACCOUNT_CHECK_IN_TARGET_IDS.automaticExecution}
            className={`${
              checkIn.automaticExecutionEnabled ? "bg-green-600" : "bg-gray-200"
            } focus:ring-green-500`}
          />
        </div>
      )}

      <FormField
        label={t("form.customCheckInUrl")}
        description={t("form.customCheckInDesc")}
      >
        <Input
          type="url"
          id={ACCOUNT_CHECK_IN_TARGET_IDS.customUrl}
          value={checkIn.customCheckIn?.url ?? ""}
          onChange={(event) =>
            onCheckInChange({
              ...checkIn,
              customCheckIn: {
                ...(checkIn.customCheckIn ?? {
                  openRedeemWithCheckIn: true,
                }),
                url: event.target.value,
              },
            })
          }
          placeholder="https://cdk.example.com/"
          leftIcon={<CalendarDays className="h-5 w-5" />}
        />
      </FormField>

      {checkIn.customCheckIn?.url && (
        <div className="flex w-full items-center justify-between gap-4">
          <label
            htmlFor={OPEN_REDEEM_WITH_CHECKIN_CONTROL_ID}
            className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
          >
            {t("form.openRedeemWithCheckIn")}
          </label>
          <Switch
            checked={checkIn.customCheckIn?.openRedeemWithCheckIn ?? true}
            onChange={(openRedeemWithCheckIn) =>
              onCheckInChange({
                ...checkIn,
                customCheckIn: {
                  ...(checkIn.customCheckIn ?? { url: "" }),
                  openRedeemWithCheckIn,
                },
              })
            }
            id={OPEN_REDEEM_WITH_CHECKIN_CONTROL_ID}
            className={`${
              checkIn.customCheckIn?.openRedeemWithCheckIn ?? true
                ? "bg-green-600"
                : "bg-gray-200"
            } focus:ring-green-500`}
          />
        </div>
      )}

      <FormField
        label={t("form.customRedeemUrl")}
        description={t("form.customRedeemUrlDesc")}
      >
        <Input
          type="text"
          id={ACCOUNT_CHECK_IN_TARGET_IDS.redeemUrl}
          value={checkIn.customCheckIn?.redeemUrl ?? ""}
          onChange={(event) =>
            onCheckInChange({
              ...checkIn,
              customCheckIn: {
                ...(checkIn.customCheckIn ?? { url: "" }),
                redeemUrl: event.target.value,
              },
            })
          }
          placeholder="https://example.com/console/topup"
          leftIcon={<Ticket className="h-5 w-5" />}
        />
      </FormField>
    </AccountFormSection>
  )
}
