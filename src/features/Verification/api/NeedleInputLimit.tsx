import { ScanSearch, Square } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  NEEDLE_DEFAULTS,
  NEEDLE_PLAN_SOURCES,
} from "~/services/verification/modelQuality/needleConstants"
import { getNeedleInputPresets } from "~/services/verification/modelQuality/needlePlan"

import { formatContextTokens } from "./contextTokenDisplay"
import { NeedlePlanHelp } from "./NeedlePlanHelp"
import type { NeedleController } from "./useNeedleTest"

const NEEDLE_LIMIT_OPTIONS = {
  Automatic: "automatic",
  Custom: "custom",
} as const

/** Own the automatic, preset and custom limit field without starting requests on edits. */
export function NeedleInputLimit({
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
    | "running"
  >
  runCapacity: () => void
  canRunCapacity: boolean
  capacityRunning?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const [editingCustomLimit, setEditingCustomLimit] = useState(false)
  useEffect(() => setEditingCustomLimit(false), [controller.counter])
  const { plan } = controller
  const reference = controller.reference
  const declaredContext = controller.counter?.declaredContext
  const unknownContext = reference?.source === NEEDLE_PLAN_SOURCES.Fallback
  const automaticLimit = reference
    ? formatContextTokens(
        Math.min(reference.inputTokens, NEEDLE_DEFAULTS.maxInputTokens),
      )
    : undefined
  const automaticLabel = automaticLimit
    ? t("verifyDialog.tools.needle.automaticLimit", { limit: automaticLimit })
    : t("verifyDialog.tools.needle.automatic")
  const presets = controller.counter
    ? getNeedleInputPresets(controller.counter)
    : []
  const selectedLimit =
    editingCustomLimit ||
    (controller.limitDraft.trim() &&
      !presets.includes(Number(controller.limitDraft)))
      ? NEEDLE_LIMIT_OPTIONS.Custom
      : controller.limitDraft.trim()
        ? String(Number(controller.limitDraft))
        : NEEDLE_LIMIT_OPTIONS.Automatic
  const capacityActionLabel = capacityRunning
    ? t("verifyDialog.tools.needle.stopCapacity")
    : t("verifyDialog.tools.needle.probeFirst")
  const capacityAction = unknownContext ? (
    <Tooltip
      anchorAsChild
      content={
        <div className="max-w-64 space-y-1">
          <p className="font-medium">{capacityActionLabel}</p>
          <p>
            {t("verifyDialog.tools.needle.reference.unknown", {
              tokens: automaticLimit,
            })}
          </p>
        </div>
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground shrink-0 shadow-none"
        aria-label={capacityActionLabel}
        aria-describedby={`${id}-limit-reference`}
        disabled={controller.running || (!capacityRunning && !canRunCapacity)}
        onClick={runCapacity}
      >
        {capacityRunning ? (
          <Square className="size-3.5" aria-hidden="true" />
        ) : (
          <ScanSearch className="size-3.5" aria-hidden="true" />
        )}
      </Button>
    </Tooltip>
  ) : null
  const contextReference = reference ? (
    <p
      id={`${id}-limit-reference`}
      className="text-muted-foreground text-xs leading-relaxed"
      role="status"
    >
      {unknownContext
        ? t("verifyDialog.tools.needle.reference.unknown", {
            tokens: automaticLimit,
          })
        : reference.source === NEEDLE_PLAN_SOURCES.Measured
          ? t("verifyDialog.tools.needle.reference.measured", {
              tokens: formatContextTokens(reference.inputTokens),
            })
          : declaredContext !== undefined &&
              Number.isSafeInteger(declaredContext) &&
              declaredContext > 0
            ? t("verifyDialog.tools.needle.reference.context", {
                tokens: formatContextTokens(declaredContext),
              })
            : t("verifyDialog.tools.needle.reference.input", {
                tokens: formatContextTokens(reference.inputTokens),
              })}
    </p>
  ) : null
  return (
    <div className="space-y-2">
      <div className="grid items-center gap-3 @sm/needle:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="flex min-w-0 items-center gap-1.5">
          <label
            className="text-foreground text-sm font-medium"
            htmlFor={`${id}-limit`}
          >
            {t("verifyDialog.tools.needle.limit")}
          </label>
          {plan ? (
            <NeedlePlanHelp plan={plan} counter={controller.counter} />
          ) : null}
          {capacityAction}
        </div>
        <Select
          value={selectedLimit}
          disabled={controller.running}
          onValueChange={(value) => {
            setEditingCustomLimit(value === NEEDLE_LIMIT_OPTIONS.Custom)
            if (value === NEEDLE_LIMIT_OPTIONS.Custom) {
              if (!controller.limitDraft.trim()) {
                controller.setLimitDraft(
                  String(plan?.limit ?? NEEDLE_DEFAULTS.fallbackInputTokens),
                )
              }
            } else {
              controller.setLimitDraft(
                value === NEEDLE_LIMIT_OPTIONS.Automatic ? "" : value,
              )
            }
          }}
        >
          <SelectTrigger
            id={`${id}-limit`}
            aria-describedby={reference ? `${id}-limit-reference` : undefined}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEEDLE_LIMIT_OPTIONS.Automatic}>
              {automaticLabel}
            </SelectItem>
            {presets.map((tokens) => (
              <SelectItem key={tokens} value={String(tokens)}>
                {formatContextTokens(tokens)}
              </SelectItem>
            ))}
            <SelectItem value={NEEDLE_LIMIT_OPTIONS.Custom}>
              {t("verifyDialog.tools.needle.custom")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {contextReference}
      {capacityRunning && unknownContext ? (
        <p className="text-muted-foreground" role="status">
          {t("verifyDialog.tools.needle.capacityRunning")}
        </p>
      ) : null}
      {selectedLimit === NEEDLE_LIMIT_OPTIONS.Custom ? (
        <div className="grid items-center gap-3 @sm/needle:grid-cols-[minmax(0,1fr)_11rem]">
          <label
            htmlFor={`${id}-custom-limit`}
            className="text-muted-foreground"
          >
            {t("verifyDialog.tools.needle.customLimit")}
          </label>
          <Input
            id={`${id}-custom-limit`}
            aria-describedby={reference ? `${id}-limit-reference` : undefined}
            type="number"
            min={NEEDLE_DEFAULTS.minimumInputTokens}
            max={NEEDLE_DEFAULTS.maxInputTokens}
            placeholder={automaticLabel}
            value={controller.limitDraft}
            onChange={(event) => controller.setLimitDraft(event.target.value)}
            disabled={controller.running}
          />
        </div>
      ) : null}
    </div>
  )
}
