import { CalendarDays, Download, KeyRound } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, FormField, Input, Switch } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

const REFRESH_TOKEN_MODE_ID = "sub2api-refresh-token-mode"

/** Sub2API refresh-token mode, session import and token expiry. */
export function Sub2ApiRefreshTokenFields({
  enabled,
  refreshToken,
  expiresAt,
  isImporting,
  onEnabledChange,
  onRefreshTokenChange,
  onImportSession,
  validation,
  feedback,
}: {
  enabled: boolean
  refreshToken: string
  expiresAt: number | null
  isImporting: boolean
  onEnabledChange: (value: boolean) => void
  onRefreshTokenChange: (value: string) => void
  onImportSession: () => void
  validation: AccountFormFieldAttributes
  feedback: ReactNode
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  return (
    <div className="col-span-full space-y-density-4">
      <div className="flex w-full items-center justify-between gap-x-4 gap-y-density-4">
        <div className="flex-1">
          <label
            htmlFor={REFRESH_TOKEN_MODE_ID}
            className="text-sm font-medium text-secondary-foreground"
          >
            {t("form.sub2apiRefreshTokenMode")}
          </label>
          <p className="mt-density-1 text-xs text-muted-foreground">
            {t("form.sub2apiRefreshTokenModeDesc")}
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={onEnabledChange}
          id={REFRESH_TOKEN_MODE_ID}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenSwitch}
        />
      </div>

      {enabled && (
        <div className="space-y-density-4">
          <Alert
            variant="warning"
            title={t("form.sub2apiRefreshTokenWarningTitle")}
            description={t("form.sub2apiRefreshTokenWarningDesc")}
          />

          <FormField label={t("form.sub2apiRefreshToken")} required>
            <div className="space-y-density-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onImportSession}
                loading={isImporting}
                className="w-full"
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiImportSessionButton
                }
                leftIcon={<Download className="h-4 w-4" />}
              >
                {isImporting
                  ? t("common:status.importing")
                  : t("form.sub2apiImportRefreshToken")}
              </Button>
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("form.showRefreshToken"),
                  hide: t("form.hideRefreshToken"),
                }}
                {...validation}
                value={refreshToken}
                onChange={(e) => onRefreshTokenChange(e.target.value)}
                placeholder={t("form.sub2apiRefreshTokenPlaceholder")}
                leftIcon={<KeyRound className="h-5 w-5" />}
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput
                }
                required
              />
            </div>
            {feedback}
          </FormField>

          {typeof expiresAt === "number" && (
            <FormField label={t("form.sub2apiTokenExpiresAt")}>
              <Input
                type="text"
                value={formatLocaleDateTime(
                  expiresAt,
                  t("common:labels.notAvailable"),
                )}
                leftIcon={<CalendarDays className="h-5 w-5" />}
                disabled
              />
            </FormField>
          )}
        </div>
      )}
    </div>
  )
}
