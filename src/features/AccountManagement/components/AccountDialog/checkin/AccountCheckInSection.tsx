import {
  CalendarDays,
  MessageSquarePlus,
  RotateCcw,
  ScanSearch,
  Ticket,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  FormField,
  InlineMessage,
  Input,
  Label,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import { NOTICE_ACTION_LAYOUTS } from "~/components/ui/Notice"
import {
  ACCOUNT_LOGIN_METHODS,
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  ACCOUNT_LOGIN_PROVIDERS,
} from "~/constants/accountLogin"
import {
  CHECK_IN_ACCOUNT_LOGIN_MODES,
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import { AccountCheckInRouteFields } from "~/features/AccountManagement/components/AccountDialog/checkin/AccountCheckInRouteFields"
import {
  getCheckInMethodPresentation,
  getCheckInRedetectionFeedbackPresentation,
  getCheckInSelectionPresentation,
} from "~/features/AccountManagement/components/AccountDialog/checkin/checkInPresentation"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
} from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import type { AccountCheckInRedetectionFeedback } from "~/features/AccountManagement/components/AccountDialog/models"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AutoCheckinRiskHint } from "~/features/AutoCheckin/pretrigger/AutoCheckinRiskHint"
import {
  useCheckInFeedback,
  type CheckInFeedbackSource,
} from "~/features/CheckInFeedback/useCheckInFeedback"
import { setCheckInSelection } from "~/services/checkin/autoCheckin/discovery/discovery"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { getCheckInAccountLoginMode } from "~/services/checkin/autoCheckin/providers/registry"
import type { CheckInConfig } from "~/types"

import { AccountVerificationContinuation } from "./AccountVerificationContinuation"

const AUTOMATIC_CHECK_IN_SELECTION_VALUE = "automatic"
const CHECK_IN_METHOD_HELPER_ID = "check-in-method-helper"
const CHECK_IN_METHOD_ATTENTION_ID = "check-in-method-attention"
const CHECK_IN_METHOD_STATUS_ID = "check-in-method-status"
const CHECK_IN_METHOD_REDETECTION_HINT_ID = "check-in-method-redetection-hint"
const OPEN_REDEEM_WITH_CHECKIN_CONTROL_ID = "open-redeem-with-checkin"
const CHECK_IN_ACTION_SIZE =
  "min-h-(--density-control-sm) sm:min-h-(--density-control-xs)"

const ACCOUNT_CHECK_IN_TARGET_IDS = {
  section: ACCOUNT_FORM_SECTION_ELEMENT_IDS["check-in"],
  feedback: "account-check-in-feedback",
  method: "account-check-in-method",
  automaticExecution: "account-check-in-automatic-execution",
  verificationContinuation: "account-check-in-verification-continuation",
  redetect: "account-check-in-redetect",
  customUrl: "account-custom-check-in-url",
  redeemUrl: "account-custom-redeem-url",
} as const

interface AccountCheckInSectionProps {
  continuous?: boolean
  loginMethodId?: string
  loginConfigured?: boolean
  onConfigureLogin?: () => void
  feedbackSource?: CheckInFeedbackSource
  checkIn: CheckInConfig
  siteType: AccountSiteType
  siteUrl?: string
  onCheckInChange: (value: CheckInConfig) => void
  onCheckInSelectionChange: (value: CheckInConfig) => void
  onRedetectCheckInMethods: () => void
  isRedetectingCheckInMethods: boolean
  checkInRedetectionFeedback: AccountCheckInRedetectionFeedback | null
}

/** Renders method discovery, automatic intent, and custom check-in settings. */
export function AccountCheckInSection({
  continuous,
  loginMethodId,
  loginConfigured,
  onConfigureLogin,
  feedbackSource,
  checkIn,
  siteType,
  siteUrl,
  onCheckInChange,
  onCheckInSelectionChange,
  onRedetectCheckInMethods,
  isRedetectingCheckInMethods,
  checkInRedetectionFeedback,
}: AccountCheckInSectionProps) {
  const { t } = useTranslation(["accountDialog", "messages", "autoCheckin"])
  const { openFeedback, feedbackDialog } = useCheckInFeedback()
  const inspection = inspectAccountCheckIn({
    config: checkIn,
    siteType,
    siteUrl,
  })
  const candidateMethodIds = inspection.choices.map((choice) => choice.methodId)
  const loginMode = getCheckInAccountLoginMode(
    inspection.selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
      ? inspection.selectionState.methodId
      : undefined,
  )
  const loginNoticeCopy =
    loginMode === CHECK_IN_ACCOUNT_LOGIN_MODES.Session
      ? {
          title: t("login.sessionCheckInTitle"),
          explanation: t("login.sessionCheckInExplanation"),
        }
      : loginMode === CHECK_IN_ACCOUNT_LOGIN_MODES.NativePage
        ? {
            title: t("login.nativeCheckInTitle"),
            explanation: t("login.nativeCheckInExplanation"),
          }
        : {
            title: t("login.checkInTitle"),
            explanation: t("login.checkInExplanation"),
          }
  const hasCandidates = candidateMethodIds.length > 0
  const shouldOfferRedetect =
    hasCandidates ||
    inspection.selectionState.status === CHECK_IN_SELECTION_STATUSES.Stale ||
    inspection.decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown
  const {
    selectedMethodId,
    triggerLabel,
    redetectionHint,
    attentionMessage,
    description,
  } = getCheckInSelectionPresentation(t, inspection, checkIn.selection)
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
    inspection.choices.some(
      (choice) =>
        choice.detectionOutcome ===
          CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown &&
        checkIn.methodKnowledge.methods[choice.methodId]?.detection,
    )
  const isSelectedStatusUnavailable =
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
  const requestSupport =
    inspection.decision.outcome ===
    CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported
  const methodStatusMessage = isSelectedMethodDisabled
    ? t("form.checkInStatusDisabled")
    : isSelectedStatusUnavailable
      ? t("form.checkInStatusUnavailable")
      : !attentionMessage && hasUnknownDetection
        ? t("form.checkInStatusUnknown")
        : !attentionMessage &&
            hasCandidates &&
            !hasSelectedMethod &&
            !requestSupport
          ? t("form.checkInStatusPending")
          : null
  const methodDescriptionIds = [
    redetectionHint && CHECK_IN_METHOD_REDETECTION_HINT_ID,
    methodStatusMessage && CHECK_IN_METHOD_STATUS_ID,
    attentionMessage && CHECK_IN_METHOD_ATTENTION_ID,
    description && CHECK_IN_METHOD_HELPER_ID,
  ]
    .filter(Boolean)
    .join(" ")
  const showRefreshHint =
    hasSelectedMethod && !methodStatusMessage && !hasUnknownDetection
  // The deployment's own gate: the site asks for human verification when the
  // grant is claimed, so unattended execution cannot complete on its own.
  const selectedRequiresManualVerification =
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    selectedStatus.requiresManualVerification === true
  const redetectionFeedbackPresentation =
    getCheckInRedetectionFeedbackPresentation(t, checkInRedetectionFeedback)
  const setAutomaticSelection = () => {
    onCheckInSelectionChange(
      setCheckInSelection({
        config: checkIn,
        siteType,
        siteUrl,
        mode: CHECK_IN_SELECTION_MODES.Automatic,
      }),
    )
  }
  const detectButton = shouldOfferRedetect && (
    <Button
      type="button"
      variant="outline"
      onClick={onRedetectCheckInMethods}
      loading={isRedetectingCheckInMethods}
      id={ACCOUNT_CHECK_IN_TARGET_IDS.redetect}
      leftIcon={<ScanSearch className="size-4" />}
    >
      {isRedetectingCheckInMethods
        ? t("form.redetectingCheckInMethods")
        : t("form.detectCheckInMethod")}
    </Button>
  )
  const feedbackButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      id={ACCOUNT_CHECK_IN_TARGET_IDS.feedback}
      onClick={() =>
        openFeedback(
          feedbackSource ?? {
            snapshot: { baseUrl: siteUrl ?? "", siteType, checkIn },
          },
        )
      }
      leftIcon={<MessageSquarePlus className="size-4" />}
      className={
        requestSupport
          ? undefined
          : "text-secondary-foreground shadow-none sm:border-transparent sm:bg-transparent sm:hover:bg-accent"
      }
    >
      {requestSupport
        ? t("checkInFeedback.request")
        : t("checkInFeedback.feedback")}
    </Button>
  )

  return (
    <AccountFormSection
      continuous={continuous}
      title={t("sections.checkInConfig.title")}
      headerAction={requestSupport ? undefined : feedbackButton}
      defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["check-in"]}
      testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn}
      id={ACCOUNT_CHECK_IN_TARGET_IDS.section}
    >
      {(requestSupport || !hasCandidates) && (
        <div className="grid items-center gap-x-density-3 gap-y-density-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-density-1">
            <p className="text-sm font-medium text-secondary-foreground">
              {t("form.checkInStatus")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("form.checkInStatusUnsupported")}
            </p>
          </div>
          {(requestSupport || (!hasCandidates && shouldOfferRedetect)) && (
            <div className="flex flex-wrap gap-density-2">
              {!hasCandidates && detectButton}
              {requestSupport && feedbackButton}
            </div>
          )}
        </div>
      )}
      {showRefreshHint && !requestSupport && (
        <InlineMessage role="note" size="sm">
          {t("form.checkInStatusDesc")}
        </InlineMessage>
      )}

      {hasCandidates && (
        <div className="space-y-density-2">
          <FormField>
            <div className="grid gap-y-density-1">
              <div className="flex flex-wrap items-center justify-between gap-x-density-2 gap-y-density-1">
                <Label
                  htmlFor={ACCOUNT_CHECK_IN_TARGET_IDS.method}
                  className="shrink-0"
                >
                  {t("form.checkInMethod")}
                </Label>
                {checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Manual && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className={`${CHECK_IN_ACTION_SIZE} text-muted-foreground`}
                    leftIcon={
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                    }
                    onClick={setAutomaticSelection}
                  >
                    {t("form.restoreAutomaticCheckInSelection")}
                  </Button>
                )}
              </div>
              {redetectionHint && (
                <p
                  id={CHECK_IN_METHOD_REDETECTION_HINT_ID}
                  className="text-xs text-muted-foreground"
                >
                  {redetectionHint}
                </p>
              )}
            </div>
            <div className="grid gap-density-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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
                      siteUrl,
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
                  aria-describedby={methodDescriptionIds || undefined}
                  title={triggerLabel}
                >
                  <SelectValue placeholder={t("form.checkInMethodNotSelected")}>
                    {triggerLabel}
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
              {detectButton}
            </div>
          </FormField>
          {(methodStatusMessage || attentionMessage || description) && (
            <div className="space-y-density-1">
              {methodStatusMessage && (
                <InlineMessage
                  id={CHECK_IN_METHOD_STATUS_ID}
                  role="note"
                  size="sm"
                  tone="warning"
                >
                  {methodStatusMessage}
                </InlineMessage>
              )}
              {attentionMessage && (
                <InlineMessage
                  id={CHECK_IN_METHOD_ATTENTION_ID}
                  role={
                    selectedMethodId && !redetectionFeedbackPresentation
                      ? "status"
                      : "note"
                  }
                  size="sm"
                  tone={selectedMethodId ? "warning" : "neutral"}
                  className="text-secondary-foreground"
                >
                  {attentionMessage}
                </InlineMessage>
              )}
              {description && (
                <p
                  id={CHECK_IN_METHOD_HELPER_ID}
                  className="text-xs text-muted-foreground"
                >
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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

      {onConfigureLogin && (
        <Notice
          tone={
            loginConfigured ||
            loginMode === CHECK_IN_ACCOUNT_LOGIN_MODES.NativePage
              ? "info"
              : "warning"
          }
          size="sm"
          actionsLayout={NOTICE_ACTION_LAYOUTS.Inline}
          title={loginNoticeCopy.title}
          description={
            <>
              {loginNoticeCopy.explanation}
              <span className="block">
                {loginConfigured
                  ? t("login.checkInConfigured", {
                      method:
                        loginMethodId === ACCOUNT_LOGIN_METHODS.Password
                          ? t("login.passwordMethod")
                          : loginMethodId === ACCOUNT_LOGIN_PROVIDERS.Github
                            ? ACCOUNT_LOGIN_PROVIDER_LABELS[
                                ACCOUNT_LOGIN_PROVIDERS.Github
                              ]
                            : ACCOUNT_LOGIN_PROVIDER_LABELS[
                                ACCOUNT_LOGIN_PROVIDERS.LinuxDo
                              ],
                    })
                  : t("login.checkInMissing")}
              </span>
            </>
          }
          actions={
            <Button
              type="button"
              variant={loginConfigured ? "outline" : "default"}
              size="sm"
              onClick={onConfigureLogin}
            >
              {loginConfigured ? t("login.change") : t("login.configure")}
            </Button>
          }
        />
      )}

      {hasCandidates && selectedRequiresManualVerification && (
        <Notice
          tone="info"
          size="sm"
          title={t("form.manualVerificationRequiredTitle")}
          description={
            checkIn.automaticExecutionEnabled ? (
              t("form.manualVerificationRequiredDesc")
            ) : (
              <>
                {t("form.manualVerificationRequiredDesc")}
                <span className="block">
                  {t("form.manualVerificationRequiredSwitchOffDesc")}
                </span>
              </>
            )
          }
        />
      )}

      {hasCandidates && (
        <div className="flex w-full items-center justify-between gap-x-4 gap-y-density-4">
          <div className="flex-1">
            <div className="flex items-center gap-x-1 gap-y-density-1">
              <label
                htmlFor={ACCOUNT_CHECK_IN_TARGET_IDS.automaticExecution}
                className="text-sm font-medium text-secondary-foreground"
              >
                {t("form.autoCheckInEnabled")}
              </label>
              <AutoCheckinRiskHint />
            </div>
            <p className="mt-density-1 text-xs text-muted-foreground">
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
          />
        </div>
      )}

      {/* The continuation preference is only consulted once a run reaches the
          claim, so the choice appears with the switch that puts the account
          into the run. */}
      {hasCandidates &&
        selectedRequiresManualVerification &&
        checkIn.automaticExecutionEnabled && (
          <AccountVerificationContinuation
            controlId={ACCOUNT_CHECK_IN_TARGET_IDS.verificationContinuation}
            checkIn={checkIn}
            onCheckInChange={onCheckInChange}
          />
        )}

      <AccountCheckInRouteFields
        checkIn={checkIn}
        candidateMethodIds={candidateMethodIds}
        onCheckInChange={onCheckInChange}
      />
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
        <div className="flex w-full items-center justify-between gap-x-4 gap-y-density-4">
          <label
            htmlFor={OPEN_REDEEM_WITH_CHECKIN_CONTROL_ID}
            className="text-sm font-medium text-secondary-foreground"
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
      {feedbackDialog}
    </AccountFormSection>
  )
}
