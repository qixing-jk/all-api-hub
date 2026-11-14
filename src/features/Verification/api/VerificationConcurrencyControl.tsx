import { Minus, Plus } from "lucide-react"
import { useEffect, useId, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"

import { Button, Input } from "~/components/ui"
import {
  VERIFICATION_CONCURRENCY_ERRORS,
  type useVerificationConcurrency,
} from "~/hooks/verification/useVerificationConcurrency"
import { cn } from "~/lib/utils"
import {
  DEFAULT_VERIFICATION_CONCURRENCY,
  MAX_VERIFICATION_CONCURRENCY,
  VERIFICATION_CONCURRENCY_KINDS,
} from "~/services/verification/concurrency"

export const VERIFICATION_CONCURRENCY_CONTROL_VARIANTS = {
  Slider: "slider",
  Compact: "compact",
} as const

/** Edit the batch limit without confusing test concurrency with request count. */
export function VerificationConcurrencyControl({
  controller,
  disabled = false,
  variant = VERIFICATION_CONCURRENCY_CONTROL_VARIANTS.Slider,
  showPresets = false,
}: {
  controller: ReturnType<typeof useVerificationConcurrency>
  disabled?: boolean
  variant?: (typeof VERIFICATION_CONCURRENCY_CONTROL_VARIANTS)[keyof typeof VERIFICATION_CONCURRENCY_CONTROL_VARIANTS]
  showPresets?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const [draft, setDraft] = useState(String(controller.value))
  useEffect(() => setDraft(String(controller.value)), [controller.value])
  const blocked = disabled || !controller.ready || controller.saving
  const parsed = Number(draft)
  const draftValue =
    draft.trim() && Number.isFinite(parsed)
      ? Math.max(
          DEFAULT_VERIFICATION_CONCURRENCY,
          Math.min(MAX_VERIFICATION_CONCURRENCY, Math.trunc(parsed)),
        )
      : controller.value
  const commit = (value = draftValue) => {
    setDraft(String(value))
    if (!blocked && value !== controller.value) void controller.update(value)
  }

  const presets = [
    {
      value: DEFAULT_VERIFICATION_CONCURRENCY,
      label: t("verifyDialog.concurrency.presetSafe"),
    },
    { value: 2, label: t("verifyDialog.concurrency.presetModerate") },
    { value: 4, label: t("verifyDialog.concurrency.presetFast") },
  ]

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          id={`${id}-label`}
          htmlFor={id}
          className="font-medium text-foreground"
        >
          {controller.kind === VERIFICATION_CONCURRENCY_KINDS.Needle
            ? t("verifyDialog.concurrency.needle")
            : t("verifyDialog.concurrency.routine")}
        </label>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("verifyDialog.concurrency.decrease")}
            disabled={blocked || draftValue <= DEFAULT_VERIFICATION_CONCURRENCY}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => commit(draftValue - 1)}
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </Button>
          <Input
            id={id}
            type="number"
            size="sm"
            min={DEFAULT_VERIFICATION_CONCURRENCY}
            max={MAX_VERIFICATION_CONCURRENCY}
            step={1}
            containerClassName="w-14"
            className="[appearance:textfield] text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-describedby={`${id}-hint`}
            value={draft}
            disabled={blocked}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commit()
              }
            }}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("verifyDialog.concurrency.increase")}
            disabled={blocked || draftValue >= MAX_VERIFICATION_CONCURRENCY}
            onClick={() => commit(draftValue + 1)}
            onPointerDown={(event) => event.preventDefault()}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {showPresets ? (
        <div className="flex items-center gap-1.5 pt-0.5">
          {presets.map((preset) => {
            const active = draftValue === preset.value
            return (
              <Button
                key={preset.value}
                type="button"
                size="xs"
                variant={active ? "default" : "outline"}
                disabled={blocked}
                className={cn(
                  "flex-1 text-xs font-normal",
                  active && "font-medium shadow-none",
                )}
                onClick={() => commit(preset.value)}
                onPointerDown={(event) => event.preventDefault()}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>
      ) : null}

      {variant === VERIFICATION_CONCURRENCY_CONTROL_VARIANTS.Slider ? (
        <div
          className="relative flex h-7 items-center"
          style={
            {
              "--verification-concurrency": `${((draftValue - DEFAULT_VERIFICATION_CONCURRENCY) / (MAX_VERIFICATION_CONCURRENCY - DEFAULT_VERIFICATION_CONCURRENCY)) * 100}%`,
            } as CSSProperties
          }
        >
          <input
            type="range"
            min={DEFAULT_VERIFICATION_CONCURRENCY}
            max={MAX_VERIFICATION_CONCURRENCY}
            step={1}
            value={draftValue}
            disabled={blocked}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            className="verification-concurrency-slider w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) => setDraft(event.target.value)}
            onPointerUp={(event) => commit(Number(event.currentTarget.value))}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                ].includes(event.key)
              )
                commit()
            }}
            onBlur={() => commit()}
          />
        </div>
      ) : null}

      <p id={`${id}-hint`} className="leading-relaxed text-muted-foreground">
        {disabled
          ? t("verifyDialog.concurrency.locked")
          : controller.kind === VERIFICATION_CONCURRENCY_KINDS.Needle
            ? t("verifyDialog.concurrency.needleHint")
            : draftValue === DEFAULT_VERIFICATION_CONCURRENCY && showPresets
              ? t("verifyDialog.concurrency.presetSafeHint")
              : t("verifyDialog.concurrency.routineHint")}
      </p>
      {controller.error ? (
        <p className="text-destructive" role="alert">
          {controller.error === VERIFICATION_CONCURRENCY_ERRORS.Load
            ? t("verifyDialog.concurrency.loadError")
            : t("verifyDialog.concurrency.saveError")}{" "}
          <Button
            size="sm"
            variant="link"
            disabled={controller.saving}
            onClick={() => void controller.retry()}
          >
            {t("verifyDialog.concurrency.retry")}
          </Button>
        </p>
      ) : null}
    </div>
  )
}
