import { ArrowUp, RotateCcw, Square } from "lucide-react"
import { useId, useRef, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { PromptModelSelector } from "~/components/ai-elements/model-selector"
import Tooltip from "~/components/Tooltip"
import { Spinner, type Button } from "~/components/ui"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "~/components/ui/input-group"

import { useVerificationModel } from "./VerificationModelContext"

export type VerificationPromptComposerProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  running?: boolean
  saving?: boolean
  onReset?: () => void
  resetLabel?: string
  resetDisabled?: boolean
  error?: string
  placeholder?: string
  action?: Pick<
    ComponentProps<typeof Button>,
    "onClick" | "disabled" | "loading"
  >
  modelSelector?: ReactNode | false
  saveHint?: ReactNode
  accessory?: ReactNode
}

/** AI Elements Prompt Input pattern, using the application's shared controls. */
export function VerificationPromptComposer({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  running = false,
  saving = false,
  onReset,
  resetLabel,
  resetDisabled,
  error,
  placeholder,
  action,
  modelSelector,
  saveHint,
  accessory,
}: VerificationPromptComposerProps) {
  const { t } = useTranslation("aiApiVerification")
  const modelContext = useVerificationModel()
  const sendRef = useRef<HTMLButtonElement>(null)
  const errorId = useId()
  const keyboardHintId = useId()

  const effectiveResetLabel =
    resetLabel ?? t("verifyDialog.tools.prompts.resetOne")
  const renderedModelSelector = (() => {
    if (modelSelector !== undefined) {
      return modelSelector || null
    }
    if (!modelContext) return null
    return (
      <PromptModelSelector
        value={modelContext.modelId}
        onChange={modelContext.onModelChange}
        options={modelContext.options}
        disabled={disabled || running || modelContext.disabled}
        loading={modelContext.loading}
        portalContainer={modelContext.portalContainer}
        placeholder={t("verifyDialog.meta.modelPlaceholder")}
        aria-label={t("verifyDialog.meta.model")}
      />
    )
  })()

  return (
    <div
      data-verification-composer
      className="order-last mt-auto shrink-0 space-y-2 pt-3"
    >
      {accessory}
      <InputGroup className="overflow-hidden rounded-2xl border-border-subtle bg-card shadow-sm [&>div.relative]:w-full">
        <InputGroupTextarea
          autoSize
          aria-label={label}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            [action ? keyboardHintId : null, error ? errorId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          value={value}
          placeholder={placeholder}
          rows={3}
          disabled={disabled || running}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (
              action &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault()
              if (!running) sendRef.current?.click()
            }
          }}
          className="max-h-40! min-h-16 w-full overflow-y-auto px-4 text-sm"
        />
        <InputGroupAddon
          align="block-end"
          className="flex-wrap items-center gap-2 px-3 pb-3"
        >
          <div className="min-w-0 flex-1 [&>[data-slot=model-selector-trigger]]:max-w-full">
            {renderedModelSelector}
          </div>
          {saveHint && !saving ? (
            <Tooltip anchorAsChild content={saveHint}>
              <span
                tabIndex={0}
                aria-label={t("verifyDialog.composer.autoSave")}
                className="shrink-0 rounded-sm text-2xs font-normal text-muted-foreground focus-visible:outline-ring"
              >
                {t("verifyDialog.composer.autoSave")}
              </span>
            </Tooltip>
          ) : null}
          {saving ? <Spinner size="sm" variant="gray" /> : null}
          {onReset ? (
            <InputGroupButton
              aria-label={effectiveResetLabel}
              title={effectiveResetLabel}
              size="icon-sm"
              disabled={disabled || running || resetDisabled}
              onClick={onReset}
            >
              <RotateCcw aria-hidden="true" />
            </InputGroupButton>
          ) : null}
          {action ? (
            <InputGroupButton
              disabled={disabled || action.disabled}
              onClick={action.onClick}
              ref={sendRef}
              type="button"
              size="sm"
              variant="default"
              loading={false}
              className="shrink-0 gap-1.5 rounded-lg px-3"
              aria-label={
                running
                  ? t("verifyDialog.tools.stop")
                  : t("verifyDialog.actions.runOne")
              }
              title={
                running
                  ? t("verifyDialog.tools.stop")
                  : t("verifyDialog.composer.keyboardHint")
              }
            >
              {running ? (
                <Square aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
              {running
                ? t("verifyDialog.tools.stop")
                : t("verifyDialog.actions.runOne")}
            </InputGroupButton>
          ) : null}
        </InputGroupAddon>
      </InputGroup>
      {action ? (
        <p id={keyboardHintId} className="sr-only">
          {t("verifyDialog.composer.keyboardHint")}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive-text">
          {error}
        </p>
      ) : null}
    </div>
  )
}
