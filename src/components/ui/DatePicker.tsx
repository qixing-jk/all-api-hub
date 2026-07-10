import type { Locale } from "date-fns"
import dayjs from "dayjs"
import { CalendarIcon } from "lucide-react"
import { useEffect, useId, useMemo, useState, type FocusEvent } from "react"

import { cn } from "~/lib/utils"

import { Button } from "./button"
import { Calendar } from "./calendar"
import {
  isNoExpirationNaturalInput,
  parseNaturalDatePickerValue,
} from "./datePickerNaturalInput"
import { formatDatePickerValue, parseDatePickerValue } from "./datePickerValue"
import { Input } from "./input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

export interface DatePickerNaturalInputLabels {
  invalid: string
  label: string
  openCalendar: string
  placeholder: string
  preview: string
}

export interface DatePickerLabels {
  trigger: string
  placeholder: string
  noExpiration: string
  in7Days: string
  in30Days: string
  in90Days: string
  in1Year: string
  naturalInput?: DatePickerNaturalInputLabels
}

export interface DatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  labels: DatePickerLabels
  disabled?: boolean
  className?: string
  locale?: Locale
  portalContainer?: HTMLElement | null
  naturalInput?: boolean
}

/**
 * Shadcn-style single-date picker that stores values as local YYYY-MM-DD dates.
 */
export function DatePicker({
  id,
  value,
  onChange,
  labels,
  disabled,
  className,
  locale,
  portalContainer,
  naturalInput = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [naturalInputValue, setNaturalInputValue] = useState("")
  const generatedFeedbackId = useId()
  const selectedDate = useMemo(() => parseDatePickerValue(value), [value])
  const triggerLabel = selectedDate ? value : labels.placeholder
  const accessibleTriggerLabel = `${labels.trigger}: ${triggerLabel}`
  const naturalInputLabels = naturalInput ? labels.naturalInput : undefined
  const trimmedNaturalInputValue = naturalInputValue.trim()
  const parsedNaturalInputValue = useMemo(() => {
    if (!naturalInputLabels) {
      return null
    }

    if (trimmedNaturalInputValue.length === 0) return ""

    if (isNoExpirationNaturalInput(trimmedNaturalInputValue)) {
      return ""
    }

    return parseNaturalDatePickerValue(trimmedNaturalInputValue)
  }, [naturalInputLabels, trimmedNaturalInputValue])
  const naturalInputHasFeedback =
    Boolean(naturalInputLabels) && trimmedNaturalInputValue.length > 0
  const naturalInputIsInvalid =
    naturalInputHasFeedback && parsedNaturalInputValue === null
  const naturalInputPreviewDate = parsedNaturalInputValue
    ? parseDatePickerValue(parsedNaturalInputValue)
    : null
  const calendarDefaultMonth =
    naturalInputPreviewDate ?? selectedDate ?? new Date()
  const naturalInputFeedbackId = `${id ?? generatedFeedbackId}-feedback`

  useEffect(() => {
    if (!naturalInput) return

    setNaturalInputValue(selectedDate ? value : "")
  }, [naturalInput, selectedDate, value])

  const selectDate = (date: Date | undefined) => {
    const nextValue = date ? formatDatePickerValue(date) : ""
    onChange(nextValue)
    setNaturalInputValue(nextValue)
    setOpen(false)
  }

  const selectPreset = (date: dayjs.Dayjs) => {
    const nextValue = formatDatePickerValue(date.toDate())
    onChange(nextValue)
    setNaturalInputValue(nextValue)
    setOpen(false)
  }

  const applyNaturalInput = () => {
    if (!naturalInputLabels || parsedNaturalInputValue === null) return

    onChange(parsedNaturalInputValue)
    setNaturalInputValue(parsedNaturalInputValue)
    setOpen(false)
  }

  const handleNaturalInputBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!naturalInputLabels) return

    const nextTarget = event.relatedTarget
    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return
    }
    if (
      nextTarget instanceof Element &&
      nextTarget.closest('[data-slot="popover-content"]')
    ) {
      return
    }
    if (nextTarget instanceof Node && portalContainer?.contains(nextTarget)) {
      return
    }

    if (parsedNaturalInputValue !== null) {
      onChange(parsedNaturalInputValue)
      setNaturalInputValue(parsedNaturalInputValue)
      return
    }

    setNaturalInputValue(selectedDate ? value : "")
  }

  const clearValue = () => {
    onChange("")
    setNaturalInputValue("")
    setOpen(false)
  }

  const calendarContent = (
    <>
      <Calendar
        mode="single"
        selected={selectedDate ?? undefined}
        defaultMonth={calendarDefaultMonth}
        onSelect={selectDate}
        locale={locale}
      />
      <div className="border-border grid grid-cols-2 gap-2 border-t p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => selectPreset(dayjs().add(7, "day"))}
        >
          {labels.in7Days}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => selectPreset(dayjs().add(30, "day"))}
        >
          {labels.in30Days}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => selectPreset(dayjs().add(90, "day"))}
        >
          {labels.in90Days}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => selectPreset(dayjs().add(1, "year"))}
        >
          {labels.in1Year}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="col-span-2"
          onClick={clearValue}
        >
          {labels.noExpiration}
        </Button>
      </div>
    </>
  )

  if (naturalInputLabels) {
    const feedbackText = naturalInputIsInvalid
      ? naturalInputLabels.invalid
      : parsedNaturalInputValue !== null && trimmedNaturalInputValue.length > 0
        ? naturalInputLabels.preview.replace(
            "{{date}}",
            parsedNaturalInputValue || labels.noExpiration,
          )
        : null

    return (
      <div className={cn("space-y-1", className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="relative" onBlur={handleNaturalInputBlur}>
              <Input
                id={id}
                value={naturalInputValue}
                onChange={(event) => setNaturalInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    applyNaturalInput()
                  }
                }}
                placeholder={naturalInputLabels.placeholder}
                aria-label={id ? undefined : naturalInputLabels.label}
                aria-describedby={
                  feedbackText ? naturalInputFeedbackId : undefined
                }
                aria-invalid={naturalInputIsInvalid}
                disabled={disabled}
                className="pr-10"
              />
              <PopoverTrigger asChild disabled={disabled}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${labels.trigger}: ${naturalInputLabels.openCalendar}`}
                  disabled={disabled}
                  className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            className="w-auto p-0"
            container={portalContainer ?? undefined}
          >
            {calendarContent}
          </PopoverContent>
        </Popover>
        {feedbackText && (
          <p
            id={naturalInputFeedbackId}
            aria-live="polite"
            className={cn(
              "text-xs",
              naturalInputIsInvalid
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground",
            )}
          >
            {feedbackText}
          </p>
        )}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={accessibleTriggerLabel}
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        container={portalContainer ?? undefined}
      >
        {calendarContent}
      </PopoverContent>
    </Popover>
  )
}
