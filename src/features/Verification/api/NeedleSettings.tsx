import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"
import { NEEDLE_DEFAULTS } from "~/services/verification/modelQuality/needleConstants"

import { NeedleInputLimit } from "./NeedleInputLimit"
import type { NeedleController } from "./useNeedleTest"
import { VerificationSettingsCard } from "./VerificationSettingsCard"
import { VerificationSettingToggle } from "./VerificationSettingToggle"

/** Own only editing state; the test controller owns the approved request plan. */
export function NeedleSettings({
  controller,
  runCapacity,
  canRunCapacity,
  capacityRunning = false,
}: {
  controller: Pick<
    NeedleController,
    | "counter"
    | "plan"
    | "reference"
    | "limitDraft"
    | "setLimitDraft"
    | "quick"
    | "setQuick"
    | "seedDraft"
    | "setSeedDraft"
    | "running"
    | "invalid"
  >
  runCapacity: () => void
  canRunCapacity: boolean
  capacityRunning?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  return (
    <VerificationSettingsCard>
      <div className="@container/needle space-y-4 text-xs">
        <NeedleInputLimit
          controller={controller}
          runCapacity={runCapacity}
          canRunCapacity={canRunCapacity}
          capacityRunning={capacityRunning}
        />
        <VerificationSettingToggle
          className="border-border-subtle border-t pt-4"
          id={`${id}-quick`}
          hintId={`${id}-quick-hint`}
          aria-describedby={`${id}-quick-hint`}
          label={t("verifyDialog.tools.needle.quick")}
          hint={t("verifyDialog.tools.needle.quickHint")}
          checked={controller.quick}
          onChange={controller.setQuick}
          disabled={controller.running}
        />
        <div className="border-border-subtle grid items-center gap-3 border-t pt-4 @sm/needle:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="space-y-1">
            <label
              className="text-foreground text-sm font-medium"
              htmlFor={`${id}-seed`}
            >
              {t("verifyDialog.tools.needle.seedInput")}
            </label>
            <p
              id={`${id}-seed-hint`}
              className="text-muted-foreground leading-relaxed"
            >
              {t("verifyDialog.tools.needle.seedHint")}
            </p>
          </div>
          <Input
            id={`${id}-seed`}
            aria-describedby={`${id}-seed-hint`}
            type="number"
            min={0}
            max={NEEDLE_DEFAULTS.maxSeed}
            value={controller.seedDraft}
            placeholder={t("verifyDialog.tools.needle.randomSample")}
            onChange={(event) => controller.setSeedDraft(event.target.value)}
            disabled={controller.running}
          />
        </div>
      </div>
      {controller.invalid ? (
        <p className="text-destructive text-xs" role="alert">
          {t("verifyDialog.tools.needle.invalid")}
        </p>
      ) : null}
    </VerificationSettingsCard>
  )
}
