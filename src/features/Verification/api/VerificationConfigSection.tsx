import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { VerificationSettingsCard } from "~/features/Verification/api/VerificationSettingsCard"

/** Groups the request fields without coupling the entry points' form state. */
export function VerificationConfigSection({
  children,
  running,
}: {
  children: ReactNode
  running?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <section
      aria-label={t("verifyDialog.meta.configuration")}
      data-testid="verification-config"
      data-verification-config
      className="min-w-0"
    >
      <VerificationSettingsCard
        running={running}
        title={t("verifyDialog.meta.configuration")}
      >
        {children}
      </VerificationSettingsCard>
    </section>
  )
}
