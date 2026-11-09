import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { VerificationRunButton } from "./VerificationRunButton"

/** Keep stop available while a running test temporarily blocks new requests. */
export function VerificationRunAction({
  running,
  canRun,
  onRun,
  onStop,
  runLabel,
  children,
  ...props
}: Omit<
  ComponentProps<typeof VerificationRunButton>,
  "onClick" | "disabled" | "loading"
> & {
  running: boolean
  canRun: boolean
  onRun: () => void
  onStop: () => void
  runLabel?: string
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <VerificationRunButton
      {...props}
      onClick={running ? onStop : onRun}
      disabled={!running && !canRun}
      loading={running}
      aria-label={
        running ? t("verifyDialog.tools.stop") : runLabel ?? props["aria-label"]
      }
    >
      {running
        ? t("verifyDialog.tools.stop")
        : children ?? t("verifyDialog.actions.runOne")}
    </VerificationRunButton>
  )
}
