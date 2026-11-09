import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { ProbeStatusBadge } from "~/features/Verification/api/ProbeStatusBadge"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeIntroduction } from "~/features/Verification/api/VerificationProbeIntroduction"
import { VerificationRunButton } from "~/features/Verification/api/VerificationRunButton"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationProbeLabel } from "~/services/verification/aiApiVerification/i18n"

/** Shared test presentation; each workspace retains request and cancellation ownership. */
export function VerificationProbeRow({
  controller,
  probeId,
  result,
  summary,
  runButtonProps,
  isRunning = false,
  historical = false,
}: {
  controller?: VerificationToolsController
  probeId: ApiVerificationProbeId
  result: ApiVerificationProbeResult | null
  summary?: string | null
  runButtonProps: ComponentProps<typeof VerificationRunButton> & {
    "data-testid"?: string
  }
  isRunning?: boolean
  historical?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const idle = !result && !isRunning
  const label = getApiVerificationProbeLabel(t, probeId)
  return (
    <VerificationProbeDetails
      controller={controller}
      probeId={probeId}
      label={label}
      result={isRunning ? null : result}
      idleContent={
        idle ? (
          <VerificationProbeIntroduction
            probeId={probeId}
            title={label}
            onRun={runButtonProps.onClick}
            disabled={runButtonProps.disabled || runButtonProps.loading}
          />
        ) : undefined
      }
      heading={
        <div className="text-foreground min-w-0 text-sm font-medium">
          <VerificationTestLabel testId={probeId}>
            {label}
          </VerificationTestLabel>
        </div>
      }
      resultSummary={!isRunning ? summary ?? result?.summary : undefined}
      action={<VerificationRunButton {...runButtonProps} />}
      status={
        isRunning ? (
          <Badge variant="outline" size="sm">
            {t("verifyDialog.actions.running")}
          </Badge>
        ) : result ? (
          <ProbeStatusBadge result={result} historical={historical} />
        ) : (
          <Badge variant="outline" size="sm">
            {t("verifyDialog.status.pending")}
          </Badge>
        )
      }
      statusInteractive={!isRunning && Boolean(result) && historical}
    />
  )
}
