import { SlidersHorizontal } from "lucide-react"
import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Card, Heading6 } from "~/components/ui"

/** Groups editable test settings separately from the test plan and results. */
export function VerificationSettingsCard({
  children,
}: {
  children: ReactNode
}) {
  const { t } = useTranslation("aiApiVerification")
  const titleId = useId()

  return (
    <Card padding="none" className="overflow-hidden shadow-none">
      <div
        role="group"
        aria-labelledby={titleId}
        className="bg-card space-y-4 p-4"
      >
        <Heading6
          id={titleId}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <SlidersHorizontal
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
          {t("verifyDialog.tools.settingsTitle")}
        </Heading6>
        {children}
      </div>
    </Card>
  )
}
