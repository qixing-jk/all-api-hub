import type { TFunction } from "i18next"
import { Info } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import { Badge, IconButton, SearchableSelect, Switch } from "~/components/ui"
import { cn } from "~/lib/utils"
import type {
  ApiVerificationApiType,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"
import { getVerificationRequestProfileApiType } from "~/services/verification/aiApiVerification/requestProfiles"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"

/** Resolve the same client name for arrival guidance and recorded results. */
function getRequestProfileLabel(
  t: TFunction,
  profile: ApiVerificationRequestProfile,
) {
  switch (profile) {
    case API_VERIFICATION_REQUEST_PROFILES.Codex:
      return t("aiApiVerification:verifyDialog.requestProfiles.codex")
    case API_VERIFICATION_REQUEST_PROFILES.Claude:
      return t("aiApiVerification:verifyDialog.requestProfiles.claude")
    case API_VERIFICATION_REQUEST_PROFILES.Gemini:
      return t("aiApiVerification:verifyDialog.requestProfiles.gemini")
    default:
      return t("aiApiVerification:verifyDialog.requestProfiles.default")
  }
}

/** Orient users arriving through a CLI shortcut without adding another action. */
export function VerificationRequestProfileHint({
  profile,
}: {
  profile: ApiVerificationRequestProfile
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <p
      role="note"
      className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed"
    >
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {t("verifyDialog.requestProfiles.shortcutHint", {
          client: getRequestProfileLabel(t, profile),
        })}
      </span>
    </p>
  )
}

/** Shared client identity selector for ordinary probes, including the content modal. */
export function VerificationRequestProfileSelect({
  value,
  apiType,
  onChange,
  disabled,
  portalContainer,
  labelRowClassName,
}: {
  value: ApiVerificationRequestProfile
  apiType?: ApiVerificationApiType
  onChange: (profile: ApiVerificationRequestProfile) => void
  disabled?: boolean
  portalContainer?: HTMLElement
  labelRowClassName?: string
}) {
  const { t } = useTranslation("aiApiVerification")
  const defaultApiType = getVerificationRequestProfileApiType(value)
  const hasProtocolMismatch =
    apiType && defaultApiType && apiType !== defaultApiType
  return (
    <div className="space-y-density-1-5">
      <div className={cn("flex items-center gap-1", labelRowClassName)}>
        <span className="text-muted-foreground text-xs">
          {t("verifyDialog.meta.requestProfile")}
        </span>
        <IconButton
          type="button"
          variant="ghost"
          size="none"
          className="text-muted-foreground size-4 min-h-0 p-0"
          aria-label={t("verifyDialog.meta.requestProfile")}
          tooltip={t("verifyDialog.requestProfiles.hint")}
        >
          <HelpHintIcon className="size-3.5" aria-hidden="true" />
        </IconButton>
      </div>
      <SearchableSelect
        aria-label={t("verifyDialog.meta.requestProfile")}
        value={value}
        onChange={(next) => onChange(next as ApiVerificationRequestProfile)}
        disabled={disabled}
        portalContainer={portalContainer}
        options={Object.values(API_VERIFICATION_REQUEST_PROFILES).map(
          (profile) => ({
            value: profile,
            label: getRequestProfileLabel(t, profile),
          }),
        )}
      />
      {hasProtocolMismatch && (
        <p className="text-warning-soft-foreground text-xs" role="alert">
          {t("verifyDialog.requestProfiles.protocolMismatch", {
            apiType: getApiVerificationApiTypeLabel(t, defaultApiType),
          })}
        </p>
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
    <div className="gap-density-2 flex flex-col sm:flex-row sm:items-center sm:gap-x-4">
      <div className="gap-density-2 flex shrink-0 items-center">
        <Switch
          id={id}
          aria-describedby={`${id}-hint`}
          checked={value}
          onChange={onChange}
          disabled={disabled}
          size="sm"
        />
        <label htmlFor={id} className="text-muted-foreground text-xs">
          {t("verifyDialog.requestProfiles.enhancedLabel")}
        </label>
        <IconButton
          type="button"
          variant="ghost"
          size="none"
          className="text-muted-foreground size-4 min-h-0 p-0"
          aria-label={t("verifyDialog.requestProfiles.enhancedLabel")}
          tooltip={t("verifyDialog.requestProfiles.enhancedHint")}
        >
          <HelpHintIcon className="size-3.5" aria-hidden="true" />
        </IconButton>
      </div>
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {t("verifyDialog.requestProfiles.enhancedCostHint")}
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
  const label = getRequestProfileLabel(t, profile)
  return (
    <Badge variant="outline" size="sm">
      {label}
      {enhanced ? ` · ${t("verifyDialog.requestProfiles.enhancedBadge")}` : ""}
    </Badge>
  )
}
