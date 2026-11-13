import type { NeedleRunControls } from "~/services/verification/modelQuality/needleRun"

import { createApiCheckProbeRunRegistry } from "./probeRunRegistry"

/** All webpage verification handlers share one cancellation owner. */
export const probeRuns = createApiCheckProbeRunRegistry()
export const needleRunControls = new Map<string, NeedleRunControls>()
