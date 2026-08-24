import { CalendarDays, RefreshCw, Ticket } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/AccountFormSection"
import { ACCOUNT_FORM_MOBILE_DEFAULT_OPEN } from "~/features/AccountManagement/components/AccountDialog/accountFormSections"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  getSelectedCheckInStatus,
  inspectAccountCheckIn,
} from "~/services/checkin/autoCheckin/inspection"
import { setCheckInSelection } from "~/services/checkin/autoCheckin/methods"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import type { CheckInConfig } from "~/types"

const AUTOMATIC_CHECK_IN_SELECTION_VALUE = "automatic"
const AUTO_CHECKIN_ENABLED_CONTROL_ID = "auto-checkin-enabled"
const OPEN_REDEEM_WITH_CHECKIN_CONTROL_ID = "open-redeem-with-checkin"

interface AccountCheckInSectionProps {
  checkIn: CheckInConfig
  siteType: AccountSiteType
  onCheckInChange: (value: CheckInConfig) => void
  onCheckInSelectionChange: (value: CheckInConfig) => void
  onRedetectCheckInMethods: () => void
  isRedetectingCheckInMethods: boolean
}

/** Renders method discovery, automatic intent, and custom check-in settings. */
export function AccountCheckInSection({
  checkIn,
  siteType,
  onCheckInChange,
  onCheckInSelectionChange,
  onRedetectCheckInMethods,
  isRedetectingCheckInMethods,
}: AccountCheckInSectionProps) {
  const { t } = useTranslation("accountDialog")
  const inspection = inspectAccountCheckIn({ config: checkIn, siteType })
  const candidateMethodIds = getAutoCheckinCandidateMethodIds(siteType)
  const hasCandidates = candidateMethodIds.length > 0
  const hasSelectedMethod =
    hasCandidates &&
    inspection.selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
  const selectedStatus = hasSelectedMethod
    ? getSelectedCheckInStatus({ config: checkIn, siteType })
    : null
  const isSelectedMethodDisabled =
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    selectedStatus.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled

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
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="space-y-1 sm:min-w-0 sm:flex-1">
          <p className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
            {t("form.checkInStatus")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isSelectedMethodDisabled
              ? t("form.checkInStatusDisabled")
              : hasSelectedMethod
                ? t("form.checkInStatusDesc")
                : hasCandidates
                  ? t("form.checkInStatusPending")
                  : t("form.checkInStatusUnsupported", { siteType })}
          </p>
        </div>
        {hasCandidates && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRedetectCheckInMethods}
            loading={isRedetectingCheckInMethods}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            className="w-full sm:w-auto"
          >
            {isRedetectingCheckInMethods
              ? t("form.redetectingCheckInMethods")
              : t("form.redetectCheckInMethods")}
          </Button>
        )}
      </div>

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
                aria-label={t("form.checkInMethod")}
              >
                <SelectValue placeholder={t("form.checkInMethodNotSelected")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC_CHECK_IN_SELECTION_VALUE}>
                  {t("form.automaticCheckInSelection")}
                </SelectItem>
                {candidateMethodIds.map((methodId) => (
                  <SelectItem key={methodId} value={methodId}>
                    {t("form.builtInCheckInMethod")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Manual
              ? t("form.checkInSelectionManual")
              : t("form.checkInSelectionAutomatic")}
            {inspection.selectionState.status ===
              CHECK_IN_SELECTION_STATUSES.Stale &&
              ` ${t("form.checkInSelectionStale")}`}
          </p>
          {checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Manual && (
            <Button
              type="button"
              variant="outline"
              onClick={setAutomaticSelection}
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
              htmlFor={AUTO_CHECKIN_ENABLED_CONTROL_ID}
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
            id={AUTO_CHECKIN_ENABLED_CONTROL_ID}
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
          id="custom-checkin-url"
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
          id="custom-redeem-url"
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
