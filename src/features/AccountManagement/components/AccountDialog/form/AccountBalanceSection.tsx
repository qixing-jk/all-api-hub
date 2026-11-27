import { ArrowLeftRight, DollarSign } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { FormField, Input, Switch } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  ACCOUNT_FORM_FIELDS,
  isValidExchangeRate,
} from "~/services/accounts/editing/accountFormValidation"

import type { AccountDialogDraft } from "../models"
import { AccountFormSection } from "./AccountFormSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  ACCOUNT_FORM_SECTIONS,
} from "./accountFormSections"
import type { useAccountFormFeedback } from "./useAccountFormFeedback"

/** Account balance inputs and the toggles that control its aggregate totals. */
export function AccountBalanceSection({
  continuous,
  draft,
  fieldFeedback,
  usesFormValidation,
  isManualBalanceUsdInvalid,
  onExchangeRateChange,
  onManualBalanceUsdChange,
  onExcludeFromTotalBalanceChange,
  onExcludeFromTodayIncomeChange,
}: {
  continuous: boolean
  draft: Pick<
    AccountDialogDraft,
    | "exchangeRate"
    | "manualBalanceUsd"
    | "excludeFromTotalBalance"
    | "excludeFromTodayIncome"
  >
  fieldFeedback: Pick<
    ReturnType<typeof useAccountFormFeedback>,
    "fieldStatus" | "fieldStatusProps"
  >
  usesFormValidation: boolean
  isManualBalanceUsdInvalid: boolean
  onExchangeRateChange: (exchangeRate: string) => void
  onManualBalanceUsdChange: (balance: string) => void
  onExcludeFromTotalBalanceChange: (exclude: boolean) => void
  onExcludeFromTodayIncomeChange: (exclude: boolean) => void
}) {
  const { t } = useTranslation("accountDialog")
  const manualBalanceInputId = useId()
  const {
    exchangeRate,
    manualBalanceUsd,
    excludeFromTotalBalance,
    excludeFromTodayIncome,
  } = draft
  const { fieldStatus, fieldStatusProps } = fieldFeedback
  const exchangeRateAttributes = fieldStatusProps(
    ACCOUNT_FORM_FIELDS.EXCHANGE_RATE,
  )
  const showExchangeRateError =
    !usesFormValidation &&
    Boolean(exchangeRate) &&
    !isValidExchangeRate(exchangeRate)
  const showManualBalanceError =
    !usesFormValidation && isManualBalanceUsdInvalid
  return (
    <AccountFormSection
      continuous={continuous}
      id={ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.BALANCE]}
      contentClassName={
        continuous ? "grid items-start gap-4 sm:grid-cols-2" : undefined
      }
      title={t("sections.balanceAndStats.title")}
      defaultOpen={
        ACCOUNT_FORM_MOBILE_DEFAULT_OPEN[ACCOUNT_FORM_SECTIONS.BALANCE]
      }
      testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionBalance}
    >
      <FormField
        label={t("form.exchangeRate")}
        description={t("form.exchangeRateDesc")}
        error={showExchangeRateError ? t("form.validRateError") : undefined}
        required
      >
        {(control) => (
          <>
            <Input
              {...control}
              type="number"
              step="any"
              min="0"
              value={exchangeRate}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.exchangeRateInput}
              {...exchangeRateAttributes}
              aria-describedby={
                [
                  control["aria-describedby"],
                  exchangeRateAttributes["aria-describedby"],
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onChange={(e) => onExchangeRateChange(e.target.value)}
              placeholder={t("form.exchangeRatePlaceholder")}
              leftIcon={
                <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
              }
              rightIcon={
                <span className="text-sm text-muted-foreground dark:text-secondary-foreground">
                  CNY
                </span>
              }
              variant={showExchangeRateError ? "error" : "default"}
              required
            />
            {fieldStatus(ACCOUNT_FORM_FIELDS.EXCHANGE_RATE)}
          </>
        )}
      </FormField>

      <FormField
        label={t("form.manualBalanceUsd")}
        htmlFor={manualBalanceInputId}
        description={t("form.manualBalanceUsdDesc")}
        error={
          showManualBalanceError ? t("form.manualBalanceUsdError") : undefined
        }
      >
        <Input
          id={manualBalanceInputId}
          type="number"
          step="any"
          min="0"
          {...fieldStatusProps(ACCOUNT_FORM_FIELDS.MANUAL_BALANCE_USD)}
          value={manualBalanceUsd}
          onChange={(e) => onManualBalanceUsdChange(e.target.value)}
          placeholder={t("form.manualBalanceUsdPlaceholder")}
          leftIcon={<DollarSign className="h-5 w-5" />}
          rightIcon={
            <span className="text-sm text-muted-foreground dark:text-secondary-foreground">
              USD
            </span>
          }
          variant={showManualBalanceError ? "error" : "default"}
        />
        {fieldStatus(ACCOUNT_FORM_FIELDS.MANUAL_BALANCE_USD)}
      </FormField>

      <div className="flex w-full items-center justify-between gap-x-4 gap-y-density-4">
        <div className="flex-1">
          <label
            htmlFor="exclude-from-total-balance"
            className="text-sm font-medium text-secondary-foreground"
          >
            {t("form.excludeFromTotalBalance")}
          </label>
          <p className="mt-density-1 text-xs text-muted-foreground">
            {t("form.excludeFromTotalBalanceDesc")}
          </p>
        </div>
        <Switch
          checked={excludeFromTotalBalance}
          onChange={onExcludeFromTotalBalanceChange}
          id="exclude-from-total-balance"
        />
      </div>

      <div className="flex w-full items-center justify-between gap-x-4 gap-y-density-4">
        <div className="flex-1">
          <label
            htmlFor="exclude-from-today-income"
            className="text-sm font-medium text-secondary-foreground"
          >
            {t("form.excludeFromTodayIncome")}
          </label>
          <p className="mt-density-1 text-xs text-muted-foreground">
            {t("form.excludeFromTodayIncomeDesc")}
          </p>
        </div>
        <Switch
          checked={excludeFromTodayIncome}
          onChange={onExcludeFromTodayIncomeChange}
          id="exclude-from-today-income"
        />
      </div>
    </AccountFormSection>
  )
}
