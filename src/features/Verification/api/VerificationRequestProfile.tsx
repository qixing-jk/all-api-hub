import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Badge, SearchableSelect, Switch } from "~/components/ui"
import { cn } from "~/lib/utils"
import type { ApiVerificationRequestProfile } from "~/services/verification/aiApiVerification"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"

/** Shared client identity selector for ordinary probes, including the content modal. */
export function VerificationRequestProfileSelect({
  value,
  onChange,
  disabled,
  portalContainer,
  labelRowClassName,
  enhanced = false,
  onEnhancedChange,
}: {
  value: ApiVerificationRequestProfile
  onChange: (profile: ApiVerificationRequestProfile) => void
  disabled?: boolean
  portalContainer?: HTMLElement
  labelRowClassName?: string
  enhanced?: boolean
  onEnhancedChange?: (enhanced: boolean) => void
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <div className="space-y-density-1-5">
      <div className={cn("flex items-center", labelRowClassName)}>
        <span className="text-muted-foreground text-xs">
          {t("verifyDialog.meta.requestProfile")}
        </span>
      </div>
      <SearchableSelect
        aria-label={t("verifyDialog.meta.requestProfile")}
        value={value}
        onChange={(next) => onChange(next as ApiVerificationRequestProfile)}
        disabled={disabled}
        portalContainer={portalContainer}
        options={[
          {
            value: API_VERIFICATION_REQUEST_PROFILES.Default,
            label: t("verifyDialog.requestProfiles.default"),
          },
          {
            value: API_VERIFICATION_REQUEST_PROFILES.Codex,
            label: t("verifyDialog.requestProfiles.codex"),
          },
          {
            value: API_VERIFICATION_REQUEST_PROFILES.Claude,
            label: t("verifyDialog.requestProfiles.claude"),
          },
          {
            value: API_VERIFICATION_REQUEST_PROFILES.Gemini,
            label: t("verifyDialog.requestProfiles.gemini"),
          },
        ]}
      />
      {value !== API_VERIFICATION_REQUEST_PROFILES.Default && (
        <p className="text-muted-foreground text-xs">
          {t("verifyDialog.requestProfiles.hint")}
        </p>
      )}
      {value !== API_VERIFICATION_REQUEST_PROFILES.Default &&
        onEnhancedChange && (
          <VerificationRequestProfileEnhancement
            value={enhanced}
            onChange={onEnhancedChange}
            disabled={disabled}
          />
        )}
    </div>
  )
}

/** Explicit opt-in because additional client context can affect cost and output. */
export function VerificationRequestProfileEnhancement({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (enhanced: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  return (
    <div className="border-border-subtle space-y-density-1 rounded-md border p-3">
      <div className="gap-density-3 flex items-center justify-between">
        <label htmlFor={id} className="text-foreground text-sm">
          {t("verifyDialog.requestProfiles.enhancedLabel")}
        </label>
        <Switch
          id={id}
          checked={value}
          onChange={onChange}
          disabled={disabled}
          size="sm"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t("verifyDialog.requestProfiles.enhancedHint")}
      </p>
    </div>
  )
}

/** Show the identity that actually produced a result, independently of today's selector. */
export function VerificationRequestProfileBadge({
  profile,
  enhanced,
}: {
  enhanced?: boolean
  profile?: ApiVerificationRequestProfile
}) {
  const { t } = useTranslation("aiApiVerification")
  if (!profile || profile === API_VERIFICATION_REQUEST_PROFILES.Default)
    return null
  const label =
    profile === API_VERIFICATION_REQUEST_PROFILES.Codex
      ? t("verifyDialog.requestProfiles.codex")
      : profile === API_VERIFICATION_REQUEST_PROFILES.Claude
        ? t("verifyDialog.requestProfiles.claude")
        : t("verifyDialog.requestProfiles.gemini")
  return (
    <Badge variant="outline" size="sm">
      {label}
      {enhanced ? ` · ${t("verifyDialog.requestProfiles.enhancedBadge")}` : ""}
    </Badge>
  )
}
