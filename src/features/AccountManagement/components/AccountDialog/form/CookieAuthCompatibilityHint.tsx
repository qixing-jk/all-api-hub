import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"

/** Explains compatibility without claiming that any stored credential is valid. */
export function CookieAuthCompatibilityHint({
  hasAccessToken,
  description,
  supportsValidation = false,
  recovery = false,
  recoveryAction,
}: {
  hasAccessToken: boolean
  description?: string
  supportsValidation?: boolean
  recovery?: boolean
  recoveryAction?: ReactNode
}) {
  const { t } = useTranslation("accountDialog")
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="gap-density-2 flex flex-wrap items-center justify-between">
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring gap-density-1 py-density-1 flex min-w-0 items-center rounded-sm text-left text-xs outline-none focus-visible:ring-2">
          <span>{t("cookieValidation.help")}</span>
          <ChevronDown
            className={
              open ? "h-3.5 w-3.5 shrink-0 rotate-180" : "h-3.5 w-3.5 shrink-0"
            }
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        {recoveryAction}
      </div>
      <CollapsibleContent className="border-border space-y-density-2 mt-density-2 border-l-2 pl-3 leading-relaxed">
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {t("cookieValidation.compatibilityExplanation")}
        </p>
        {hasAccessToken && (
          <p className="text-muted-foreground text-xs">
            {t("cookieValidation.savedTokenExplanation")}
          </p>
        )}
        {supportsValidation && (
          <p className="text-muted-foreground text-xs">
            {t("cookieValidation.verificationGuide")}
          </p>
        )}
        {recovery && (
          <p className="text-muted-foreground text-xs">
            {t("login.recoveryGuideDescription")}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
