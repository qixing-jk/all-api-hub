import { ChevronDown } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type { ModelPricingScenarioSettings } from "~/features/ModelList/pricingScenario"
import {
  PRICING_SCENARIO_EXTRA_FIELDS,
  PRICING_SCENARIO_SELECTION_AXES,
  PRICING_TASK_FIELDS,
  PRICING_TIME_FIELD_ID,
  UNSPECIFIED_PRICING_OPTION,
  type PricingConditionTarget,
} from "~/features/ModelList/pricingScenarioFields"
import { usePricingScenarioNavigation } from "~/features/ModelList/pricingScenarioNavigation"
import { pricingScenarioOptions } from "~/features/ModelList/pricingScenarioOptions"
import {
  PRICING_CONDITION_KINDS,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
  PRICING_SERVICE_TIERS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { normalizeVideoQuality } from "~/services/modelPricing/videoQuality"

/** Converts an instant to the local value expected by datetime-local. */
function toLocalDateTimeInputValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Commits numeric drafts on blur, retaining focus and a stable time snapshot. */
function QuantityField({
  target,
  label,
  value,
  onChange,
  fractional = false,
}: {
  target: PricingConditionTarget
  fractional?: boolean
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value))
  useEffect(() => {
    setDraft(value === undefined ? "" : String(value))
  }, [value])
  return (
    <FormField label={label}>
      <Input
        data-pricing-condition={target}
        aria-label={label}
        type="number"
        min={0}
        step={fractional ? "any" : 1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        onBlur={() => {
          const number = draft.trim() === "" ? undefined : Number(draft)
          const next =
            number !== undefined &&
            (fractional
              ? Number.isFinite(number)
              : Number.isSafeInteger(number)) &&
            number >= 0
              ? number
              : undefined
          setDraft(next === undefined ? "" : String(next))
          onChange(next)
        }}
      />
    </FormField>
  )
}

/** Lets people compare time-based prices at a specific local date and time. */
function PricingTimeField({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(() => toLocalDateTimeInputValue(value))
  useEffect(() => {
    setDraft(toLocalDateTimeInputValue(value))
  }, [value])
  return (
    <FormField
      label={label}
      description={description}
      htmlFor={PRICING_TIME_FIELD_ID}
    >
      <Input
        id={PRICING_TIME_FIELD_ID}
        data-pricing-condition={PRICING_SCENARIO_EXTRA_FIELDS.TIME}
        type="datetime-local"
        step={60}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        onBlur={() => {
          const date = new Date(draft)
          if (draft && !Number.isNaN(date.getTime())) {
            onChange(date.toISOString())
            return
          }
          setDraft(toLocalDateTimeInputValue(value))
        }}
      />
    </FormField>
  )
}

/** Keeps related conditions discoverable without expanding unrelated controls. */
function PricingConditionGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <details className="group/condition py-1">
      <summary className="text-foreground hover:bg-muted/50 flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 -rotate-90 transition-transform group-open/condition:rotate-0"
          aria-hidden="true"
        />
        {title}
      </summary>
      <div className="space-y-3 px-1 pt-1 pb-3">
        <p className="text-muted-foreground text-xs leading-5">{description}</p>
        <div className="grid grid-cols-1 gap-3 [@container(min-width:28rem)]:grid-cols-2 [@container(min-width:48rem)]:grid-cols-3">
          {children}
        </div>
      </div>
    </details>
  )
}

/** Progressive conditions for the same workload used by the model comparison. */
export function PricingScenarioControls({
  settings,
  onChange,
  plans,
  children,
}: {
  children?: (conditions: ReactNode, summary: ReactNode) => ReactNode
  plans?: PricingPlan[]
  settings: ModelPricingScenarioSettings
  onChange: (settings: ModelPricingScenarioSettings) => void
}) {
  const { t, i18n } = useTranslation("modelList")
  const options = pricingScenarioOptions(t)
  const navigation = usePricingScenarioNavigation()
  const usesTextTokenIndex =
    !plans?.length ||
    plans.some(
      (plan) =>
        !plan.comparison &&
        (!plan.usageMode || plan.usageMode === PRICING_USAGE_MODES.TOKENS),
    )
  const conditions = plans?.flatMap((plan) =>
    plan.rules.flatMap((rule) => rule.conditions),
  )
  for (const axis of [
    PRICING_SELECTION_AXES.VIDEO_QUALITY,
    PRICING_SELECTION_AXES.IMAGE_QUALITY,
  ] as const) {
    const values = new Set(
      conditions?.flatMap((condition) =>
        condition.kind === PRICING_CONDITION_KINDS.SELECTION &&
        condition.axis === axis
          ? [
              axis === PRICING_SELECTION_AXES.VIDEO_QUALITY
                ? normalizeVideoQuality(condition.value)
                : condition.value,
            ]
          : [],
      ) ?? [],
    )
    options[axis].push(...[...values].map((value) => ({ value, label: value })))
  }
  const hasAreaCondition = conditions?.some(
    (condition) => condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT,
  )
  const taskFields = PRICING_TASK_FIELDS.filter(({ meter }) =>
    plans?.some(
      (plan) =>
        (plan.comparison || plan.usageMode === PRICING_USAGE_MODES.IMAGE) &&
        (plan.comparison?.meter === meter ||
          plan.rates[meter] ||
          plan.rules.some((rule) => rule.rates[meter]) ||
          plan.issues.some((issue) => issue.meters?.includes(meter))),
    ),
  )
  const hasInputContextCondition =
    conditions === undefined ||
    conditions.some(
      (condition) =>
        condition.kind === PRICING_CONDITION_KINDS.RANGE &&
        condition.axis !== PRICING_RANGE_AXES.OUTPUT_TOKENS,
    )
  const hasOutputContextCondition =
    conditions === undefined ||
    conditions.some(
      (condition) =>
        condition.kind === PRICING_CONDITION_KINDS.RANGE &&
        [
          PRICING_RANGE_AXES.OUTPUT_TOKENS,
          PRICING_RANGE_AXES.TOTAL_TOKENS,
        ].some((axis) => axis === condition.axis),
    )
  const hasContextCondition =
    hasInputContextCondition || hasOutputContextCondition
  const hasTimeCondition =
    conditions === undefined ||
    conditions.some((condition) =>
      [
        PRICING_CONDITION_KINDS.CALENDAR,
        PRICING_CONDITION_KINDS.DATE_WINDOW,
        PRICING_CONDITION_KINDS.TIME_WINDOW,
        PRICING_CONDITION_KINDS.UTC_WINDOW,
      ].some((kind) => kind === condition.kind),
    )
  const supportsSelection = (
    axis: (typeof PRICING_SCENARIO_SELECTION_AXES)[number],
  ) =>
    conditions === undefined ||
    conditions.some(
      (condition) =>
        condition.kind === PRICING_CONDITION_KINDS.SELECTION &&
        condition.axis === axis,
    ) ||
    (axis === PRICING_SELECTION_AXES.RESPONSE_FORMAT &&
      conditions.some(
        (condition) =>
          condition.kind === PRICING_CONDITION_KINDS.RANGE &&
          Boolean(
            condition.inputTokenDeductions || condition.outputTokenDeductions,
          ),
      )) ||
    (axis === PRICING_SELECTION_AXES.SERVICE_TIER
      ? plans?.some((plan) =>
          plan.serviceTiers?.some(
            (tier) => tier !== PRICING_SERVICE_TIERS.STANDARD,
          ),
        ) ||
        (settings.serviceTier &&
          settings.serviceTier !== PRICING_SERVICE_TIERS.STANDARD)
      : settings[axis])
  const imageMeters: PricingConditionTarget[] = [
    PRICING_METERS.IMAGE,
    PRICING_METERS.OUTPUT_MEGAPIXELS,
    PRICING_METERS.REFERENCE_IMAGE,
  ]
  const imageAxes = [
    PRICING_SELECTION_AXES.IMAGE_SIZE,
    PRICING_SELECTION_AXES.IMAGE_QUALITY,
  ] as const
  const videoAxes = [
    PRICING_SELECTION_AXES.VIDEO_QUALITY,
    PRICING_SELECTION_AXES.VIDEO_INPUT,
  ] as const
  const otherAxes = [
    PRICING_SELECTION_AXES.SERVICE_TIER,
    PRICING_SELECTION_AXES.RESPONSE_FORMAT,
  ] as const
  const hasImageFields =
    hasAreaCondition ||
    taskFields.some(({ meter }) => imageMeters.includes(meter)) ||
    imageAxes.some(supportsSelection)
  const hasVideoFields =
    taskFields.some(({ meter }) => meter === PRICING_METERS.VIDEO_SECONDS) ||
    videoAxes.some(supportsSelection)
  const otherTaskFields = taskFields.filter(
    ({ meter }) =>
      !imageMeters.includes(meter) && meter !== PRICING_METERS.VIDEO_SECONDS,
  )
  const hasOtherFields =
    otherTaskFields.length > 0 ||
    otherAxes.some(supportsSelection) ||
    hasTimeCondition

  const renderTaskField = ({
    meter,
    defaultValue,
  }: (typeof PRICING_TASK_FIELDS)[number]) => (
    <QuantityField
      key={meter}
      target={meter}
      label={options.labels[meter]}
      fractional={
        meter === PRICING_METERS.VIDEO_SECONDS ||
        meter === PRICING_METERS.OUTPUT_MEGAPIXELS
      }
      value={
        settings.taskUsage && Object.hasOwn(settings.taskUsage, meter)
          ? settings.taskUsage[meter] ?? undefined
          : defaultValue
      }
      onChange={(value) =>
        onChange({
          ...settings,
          taskUsage: { ...settings.taskUsage, [meter]: value ?? null },
        })
      }
    />
  )
  const renderSelection = (
    axis: (typeof PRICING_SCENARIO_SELECTION_AXES)[number],
  ) => (
    <FormField key={axis} label={options.labels[axis]}>
      <Select
        value={
          (axis === PRICING_SELECTION_AXES.VIDEO_QUALITY &&
          settings.videoQuality
            ? normalizeVideoQuality(settings.videoQuality)
            : settings[axis]) ??
          (axis === PRICING_SELECTION_AXES.SERVICE_TIER
            ? PRICING_SERVICE_TIERS.STANDARD
            : UNSPECIFIED_PRICING_OPTION)
        }
        onValueChange={(value) =>
          onChange({
            ...settings,
            [axis]: value === UNSPECIFIED_PRICING_OPTION ? undefined : value,
          })
        }
      >
        <SelectTrigger
          aria-label={options.labels[axis]}
          data-pricing-condition={axis}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options[axis].map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  )
  const conditionFields =
    hasContextCondition ||
    hasImageFields ||
    hasVideoFields ||
    hasOtherFields ? (
      <div className="divide-y">
        {hasContextCondition && (
          <PricingConditionGroup
            title={t("scenario.groups.tiers")}
            description={t("scenario.contextEffect")}
          >
            {hasInputContextCondition && (
              <QuantityField
                target={PRICING_RANGE_AXES.INPUT_TOKENS}
                label={t("scenario.input")}
                value={settings.inputTokens}
                onChange={(inputTokens) =>
                  onChange({ ...settings, inputTokens })
                }
              />
            )}
            {hasOutputContextCondition && (
              <QuantityField
                target={PRICING_RANGE_AXES.OUTPUT_TOKENS}
                label={t("scenario.output")}
                value={settings.outputTokens}
                onChange={(outputTokens) =>
                  onChange({ ...settings, outputTokens })
                }
              />
            )}
          </PricingConditionGroup>
        )}
        {hasImageFields && (
          <PricingConditionGroup
            title={t("scenario.groups.image")}
            description={t("scenario.mediaSettingsEffect")}
          >
            {hasAreaCondition && (
              <div className="space-y-1">
                <QuantityField
                  target={PRICING_SCENARIO_EXTRA_FIELDS.IMAGE_MEGAPIXELS}
                  label={options.labels.imageMegapixels}
                  fractional
                  value={settings.imageMegapixels}
                  onChange={(imageMegapixels) =>
                    onChange({ ...settings, imageMegapixels })
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {[1024, 1536, 2048].map((edge) => (
                    <button
                      key={edge}
                      type="button"
                      className="text-primary text-xs underline underline-offset-2"
                      onClick={() =>
                        onChange({
                          ...settings,
                          imageMegapixels: (edge * edge) / 1_000_000,
                        })
                      }
                    >
                      {edge} × {edge}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {taskFields
              .filter(({ meter }) => imageMeters.includes(meter))
              .map(renderTaskField)}
            {imageAxes.filter(supportsSelection).map(renderSelection)}
          </PricingConditionGroup>
        )}
        {hasVideoFields && (
          <PricingConditionGroup
            title={t("scenario.groups.video")}
            description={t("scenario.mediaSettingsEffect")}
          >
            {taskFields
              .filter(({ meter }) => meter === PRICING_METERS.VIDEO_SECONDS)
              .map(renderTaskField)}
            {videoAxes.filter(supportsSelection).map(renderSelection)}
          </PricingConditionGroup>
        )}
        {hasOtherFields && (
          <PricingConditionGroup
            title={t("scenario.groups.other")}
            description={t("scenario.otherSettingsEffect")}
          >
            {otherTaskFields.map(renderTaskField)}
            {otherAxes.filter(supportsSelection).map(renderSelection)}
            {hasTimeCondition && (
              <PricingTimeField
                label={t("scenario.pricingTime")}
                description={t("scenario.pricingTimeEffect")}
                value={settings.at}
                onChange={(at) => onChange({ ...settings, at })}
              />
            )}
          </PricingConditionGroup>
        )}
      </div>
    ) : null
  const summary = conditionFields ? (
    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {taskFields.map(({ meter, defaultValue }) => (
        <span key={meter}>
          {options.labels[meter]}:{" "}
          {(settings.taskUsage && Object.hasOwn(settings.taskUsage, meter)
            ? settings.taskUsage[meter]
            : defaultValue
          )?.toLocaleString(i18n.language) ?? "—"}
        </span>
      ))}
      {hasAreaCondition && settings.imageMegapixels !== undefined && (
        <span>
          {options.labels.imageMegapixels}:{" "}
          {settings.imageMegapixels.toLocaleString(i18n.language)}
        </span>
      )}
      {hasTimeCondition && (
        <span>
          {t("scenario.pricingTime")}:{" "}
          {Number.isNaN(new Date(settings.at).getTime())
            ? "—"
            : new Date(settings.at).toLocaleString(i18n.language, {
                dateStyle: "short",
                timeStyle: "short",
              })}
        </span>
      )}
      {hasInputContextCondition && hasOutputContextCondition ? (
        <span>
          {t("scenario.contextSummary", {
            input: settings.inputTokens?.toLocaleString(i18n.language) ?? "—",
            output: settings.outputTokens?.toLocaleString(i18n.language) ?? "—",
          })}
        </span>
      ) : hasContextCondition ? (
        <span>
          {hasInputContextCondition
            ? t("scenario.input")
            : t("scenario.output")}
          :{" "}
          {(hasInputContextCondition
            ? settings.inputTokens
            : settings.outputTokens
          )?.toLocaleString(i18n.language) ?? "—"}
        </span>
      ) : null}
      {PRICING_SCENARIO_SELECTION_AXES.map((axis) =>
        settings[axis] && supportsSelection(axis) ? (
          <span key={axis}>
            {options.labels[axis]}:{" "}
            {options[axis].find(
              (option) =>
                option.value ===
                (axis === PRICING_SELECTION_AXES.VIDEO_QUALITY
                  ? normalizeVideoQuality(settings[axis]!)
                  : settings[axis]),
            )?.label ?? settings[axis]}
          </span>
        ) : null,
      )}
    </div>
  ) : null
  return (
    <section
      ref={navigation?.controlsRef}
      tabIndex={-1}
      aria-label={t("scenario.configure")}
      className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/40 relative mt-4 space-y-3 rounded-md border border-gray-200 bg-gray-50/70 p-3 [&_[data-pricing-highlight]]:ring-2 [&_[data-pricing-highlight]]:ring-blue-500 [&_[data-pricing-highlight]]:ring-offset-2"
    >
      <div className="space-y-1 [@container(min-width:48rem)]:pr-44">
        <h3
          id="model-price-comparison-title"
          className="text-foreground text-sm font-semibold"
        >
          {usesTextTokenIndex
            ? t("scenario.tokenIndex")
            : t("scenario.billingComparison")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {usesTextTokenIndex
            ? t("scenario.compareEffect")
            : t("scenario.conditionsEffect")}
        </p>
      </div>
      {!usesTextTokenIndex ? (
        <>
          {summary}
          {conditionFields}
        </>
      ) : children ? (
        children(conditionFields, summary)
      ) : (
        <>
          {summary}
          {conditionFields && (
            <details>
              <summary>{t("priceComparison.customize")}</summary>
              {conditionFields}
            </details>
          )}
        </>
      )}
    </section>
  )
}
