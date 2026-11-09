import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  NEEDLE_DEFAULTS,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

/** A fresh, valid measurement envelope; each scenario supplies its meaningful outcomes and scope. */
export function createNeedleResult(
  overrides: Partial<NeedleResult> = {},
): NeedleResult {
  const counter = overrides.counter ?? {
    encoding: CONTEXT_TOKEN_ENCODINGS.O200k,
    estimated: true,
  }
  return {
    version: NEEDLE_DEFAULTS.version,
    seed: 123,
    counter,
    plan: createNeedlePlan({ counter }),
    reason: NEEDLE_RUN_REASONS.Complete,
    cells: [],
    ...overrides,
  }
}
