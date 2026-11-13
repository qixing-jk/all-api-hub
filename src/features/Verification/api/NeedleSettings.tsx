import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"
import { NEEDLE_DEFAULTS } from "~/services/verification/modelQuality/needleConstants"

import { formatContextTokens } from "./contextTokenDisplay"
import { NeedleInputLimit } from "./NeedleInputLimit"
import type { NeedleController } from "./useNeedleTest"
import { VerificationConcurrencyControl } from "./VerificationConcurrencyControl"
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
    | "concurrency"
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
    <VerificationSettingsCard running={controller.running}>
      <div className="@container/needle space-y-4 text-xs">
        {controller.plan && !controller.invalid ? (
          <p
            aria-live="polite"
            className="sticky top-0 z-10 border-b border-border-subtle bg-surface-subtle pb-3 text-xs leading-relaxed text-foreground"
          >
            {t("verifyDialog.tools.needle.settingsPreview", {
              requests: controller.plan.requests,
              tokens: formatContextTokens(controller.plan.totalInputTokens),
            })}
          </p>
        ) : null}
        <VerificationConcurrencyControl
          controller={controller.concurrency}
          disabled={controller.running}
        />
        <NeedleInputLimit
          controller={controller}
          runCapacity={runCapacity}
          canRunCapacity={canRunCapacity}
          capacityRunning={capacityRunning}
        />
        <VerificationSettingToggle
          className="border-t border-border-subtle pt-4"
          id={`${id}-quick`}
          hintId={`${id}-quick-hint`}
          aria-describedby={`${id}-quick-hint`}
          label={t("verifyDialog.tools.needle.quick")}
          hint={t("verifyDialog.tools.needle.quickHint")}
          checked={controller.quick}
          onChange={controller.setQuick}
          disabled={controller.running}
        />
        <div className="grid items-center gap-3 border-t border-border-subtle pt-4 @sm/needle:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="space-y-1">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor={`${id}-seed`}
            >
              {t("verifyDialog.tools.needle.seedInput")}
            </label>
            <p
              id={`${id}-seed-hint`}
              className="leading-relaxed text-muted-foreground"
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
        <p className="text-xs text-destructive" role="alert">
          {t("verifyDialog.tools.needle.invalid")}
        </p>
      ) : null}
    </VerificationSettingsCard>
  )
}
