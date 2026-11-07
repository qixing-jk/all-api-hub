import type { Locale } from "date-fns"
import { useState } from "react"

import { Calendar } from "~/components/ui/calendar"
import {
  formatDatePickerValue,
  parseDatePickerValue,
} from "~/components/ui/datePickerValue"
import { Input } from "~/components/ui/input"

interface BalanceHistoryDateFieldProps {
  label: string
  value: string
  minDayKey: string
  maxDayKey: string
  locale: Locale | undefined
  onChange: (value: string) => void
}

/** Keep the inline calendar and typed date on the same range endpoint. */
export function BalanceHistoryDateField({
  label,
  value,
  minDayKey,
  maxDayKey,
  locale,
  onChange,
}: BalanceHistoryDateFieldProps) {
  const [navigation, setNavigation] = useState<{
    value: string
    month?: Date
  }>({ value })
  const selected = parseDatePickerValue(value) ?? undefined
  const minDate = parseDatePickerValue(minDayKey)
  const maxDate = parseDatePickerValue(maxDayKey)
  const displayedMonth =
    (navigation.value === value ? navigation.month : undefined) ??
    selected ??
    maxDate

  if (navigation.value !== value) setNavigation({ value })

  return (
    <fieldset className="space-y-density-2 min-w-0">
      <legend className="text-sm font-medium">{label}</legend>
      <Input
        type="date"
        value={value}
        min={minDayKey}
        max={maxDayKey}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        disabled={!minDate || !maxDate}
      />
      {minDate && maxDate && minDate <= maxDate && displayedMonth && (
        <Calendar
          mode="single"
          required
          fixedWeeks
          showOutsideDays={false}
          month={
            displayedMonth < minDate
              ? minDate
              : displayedMonth > maxDate
                ? maxDate
                : displayedMonth
          }
          onMonthChange={(nextMonth) =>
            setNavigation({ value, month: nextMonth })
          }
          selected={selected}
          onSelect={(date) => onChange(formatDatePickerValue(date))}
          startMonth={minDate}
          endMonth={maxDate}
          disabled={[{ before: minDate }, { after: maxDate }]}
          locale={locale}
          className="border-border bg-surface-subtle [&_.rdp-month]:gap-y-density-2 [&_.rdp-week]:mt-density-1 w-full rounded-lg border px-2.5 [--cell-size:--spacing(7)] [&_.rdp-week]:min-h-(--density-control-sm)"
        />
      )}
    </fieldset>
  )
}
