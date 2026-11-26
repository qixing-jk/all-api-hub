import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { NEW_API_TOKEN_NAME_MAX_LENGTH } from "~/services/apiService/newApiFamily/accessTokens/protocol"

import { TOKEN_EXPIRY_MODES } from "./tokenExpiry"

/** Fields that name the token and set its lifetime. */
export function NewApiTokenDetails({
  name,
  setName,
  days,
  setDays,
  expiryMode,
  setExpiryMode,
  defaultExpiryDays,
  disabled,
}: {
  name: string
  setName: (name: string) => void
  days: string
  setDays: (days: string) => void
  expiryMode: string
  setExpiryMode: (mode: string) => void
  defaultExpiryDays: number
  disabled: boolean
}) {
  const { t } = useTranslation("accountDialog")
  const id = useId()
  const expiryPresets = [...new Set([30, 90, 365, defaultExpiryDays])].sort(
    (a, b) => a - b,
  )
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>{t("tokenCreation.name")}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={NEW_API_TOKEN_NAME_MAX_LENGTH}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-expiry`}>{t("tokenCreation.expiration")}</Label>
        <div className="flex items-center gap-2">
          <Select
            value={expiryMode}
            onValueChange={setExpiryMode}
            disabled={disabled}
          >
            <SelectTrigger id={`${id}-expiry`} className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOKEN_EXPIRY_MODES.NEVER}>
                {t("tokenCreation.neverExpires")}
              </SelectItem>
              {expiryPresets.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {t("tokenCreation.expiryDaysOption", { count: days })}
                </SelectItem>
              ))}
              <SelectItem value={TOKEN_EXPIRY_MODES.CUSTOM}>
                {t("tokenCreation.customDays")}
              </SelectItem>
            </SelectContent>
          </Select>
          {expiryMode === TOKEN_EXPIRY_MODES.CUSTOM && (
            <Input
              id={`${id}-days`}
              aria-label={t("tokenCreation.days")}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              disabled={disabled}
              containerClassName="w-24 shrink-0 sm:w-28"
              className="[appearance:textfield] pl-2 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              rightIcon={
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground"
                >
                  {t("tokenCreation.daysUnit")}
                </span>
              }
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
