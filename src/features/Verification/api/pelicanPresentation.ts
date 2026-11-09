import { DRAWING_VERIFICATION_OUTCOMES } from "~/services/verification/modelQuality/constants"

import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolsController,
} from "./useVerificationTools"

/** Project drawing state without confusing a saved result with the current run. */
export function getPelicanPresentation({
  isPelicanRunning,
  pelicanStatus,
  pelican,
  pelicanSummary,
  pelicanErrorMessage,
}: Pick<
  VerificationToolsController,
  | "isPelicanRunning"
  | "pelicanStatus"
  | "pelican"
  | "pelicanSummary"
  | "pelicanErrorMessage"
>) {
  const transient =
    isPelicanRunning || pelicanStatus === VERIFICATION_TOOL_STATUSES.Stopped
  const historical = Boolean(
    pelicanSummary &&
      !pelican &&
      !transient &&
      pelicanStatus !== VERIFICATION_TOOL_STATUSES.Error,
  )
  const outcome =
    pelicanStatus === VERIFICATION_TOOL_STATUSES.Error
      ? DRAWING_VERIFICATION_OUTCOMES.Error
      : transient
        ? undefined
        : pelican
          ? pelican.svg
            ? DRAWING_VERIFICATION_OUTCOMES.Generated
            : DRAWING_VERIFICATION_OUTCOMES.NoArtifact
          : pelicanSummary?.outcome
  const latencyMs =
    transient || pelicanStatus === VERIFICATION_TOOL_STATUSES.Error
      ? undefined
      : pelican?.latencyMs ?? pelicanSummary?.latencyMs
  const idle =
    pelicanStatus === VERIFICATION_TOOL_STATUSES.Idle &&
    !pelican &&
    !pelicanSummary &&
    !pelicanErrorMessage &&
    !isPelicanRunning

  return { historical, outcome, latencyMs, idle }
}
export type PelicanPresentation = ReturnType<typeof getPelicanPresentation>
