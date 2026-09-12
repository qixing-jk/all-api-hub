import type { TFunction } from "i18next"
import { Plus, Trash2 } from "lucide-react"
import { useId, useState } from "react"

import { Button, IconButton, Input, Label, Textarea } from "~/components/ui"

import type { ResourceFieldPresentation } from "./resourceFieldPolicy"

type Entry = { id: string; source: string }

/** Edits line pairs without rewriting untouched lines or losing incomplete drafts. */
export function ResourceTextEntriesField({
  t,
  label,
  value,
  configuration,
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  t: TFunction
  label: string
  value: string
  configuration: NonNullable<ResourceFieldPresentation["textEntries"]>
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const parse = (text: string): Entry[] =>
    text
      ? text.split("\n").map((source) => ({ id: crypto.randomUUID(), source }))
      : []
  const [draft, setDraft] = useState(() => ({ value, entries: parse(value) }))
  const [raw, setRaw] = useState(false)
  if (draft.value !== value) setDraft({ value, entries: parse(value) })
  const update = (entries: Entry[]) => {
    const next = entries.map((entry) => entry.source).join("\n")
    setDraft({ value: next, entries })
    onChange(next)
  }
  const keyLabel = configuration.resolveKeyLabel(t)
  const valueLabel = configuration.resolveValueLabel(t)
  return (
    <fieldset
      className="min-w-0 space-y-2"
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={invalid}
    >
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Button
          type="button"
          size="sm"
          variant="dashed"
          onClick={() => setRaw(!raw)}
        >
          {raw ? t("ui:textEntries.editRows") : t("ui:textEntries.editText")}
        </Button>
      </div>
      {raw ? (
        <Textarea
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          value={value}
          rows={6}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <>
          {draft.entries.map((entry, index) => {
            const separatorIndex = entry.source.indexOf(configuration.separator)
            const key =
              separatorIndex < 0
                ? entry.source
                : entry.source.slice(0, separatorIndex).trim()
            const entryValue =
              separatorIndex < 0
                ? ""
                : entry.source.slice(separatorIndex + 1).trimStart()
            const change = (nextKey: string, nextValue: string) => {
              const source =
                configuration.omitEmptyValue && !nextValue
                  ? nextKey
                  : `${nextKey}${configuration.separator === ":" ? ": " : " = "}${nextValue}`
              update(
                draft.entries.map((item) =>
                  item.id === entry.id ? { ...item, source } : item,
                ),
              )
            }
            return (
              <div
                key={entry.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
                  <Label
                    htmlFor={`${id}-${entry.id}-key`}
                    className="text-muted-foreground text-xs"
                  >
                    {keyLabel}
                  </Label>
                  <Input
                    id={`${id}-${entry.id}-key`}
                    aria-label={`${keyLabel} ${index + 1}`}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    value={key}
                    onChange={(event) => change(event.target.value, entryValue)}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor={`${id}-${entry.id}-value`}
                    className="text-muted-foreground text-xs"
                  >
                    {valueLabel}
                  </Label>
                  <Input
                    id={`${id}-${entry.id}-value`}
                    aria-label={`${valueLabel} ${index + 1}`}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    placeholder={configuration.resolveValuePlaceholder?.(t)}
                    value={entryValue}
                    onChange={(event) => change(key, event.target.value)}
                  />
                </div>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("ui:textEntries.remove", { number: index + 1 })}
                  onClick={() =>
                    update(draft.entries.filter((item) => item.id !== entry.id))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            )
          })}
          <Button
            type="button"
            variant="dashed"
            size="sm"
            className="w-full"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setDraft({
                ...draft,
                entries: [
                  ...draft.entries,
                  { id: crypto.randomUUID(), source: "" },
                ],
              })
            }
          >
            {t("ui:textEntries.add")}
          </Button>
        </>
      )}
    </fieldset>
  )
}
