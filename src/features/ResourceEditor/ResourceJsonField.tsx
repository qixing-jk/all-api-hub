import type { TFunction } from "i18next"
import { Plus, Trash2 } from "lucide-react"
import { useId, useState, type ReactNode } from "react"

import { Button, Input, Label, Textarea } from "~/components/ui"

import { ResourceFieldLabel } from "./ResourceFieldLabel"

const parseRows = (value: string): [string, string][] | undefined => {
  try {
    const parsed: unknown = JSON.parse(value.trim() || "{}")
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (row) =>
          Array.isArray(row) &&
          row.length === 2 &&
          row.every((cell) => typeof cell === "string"),
      )
    ) {
      return parsed as [string, string][]
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((item) => typeof item === "string")
    ) {
      return Object.entries(parsed) as [string, string][]
    }
  } catch {
    /* Keep malformed existing JSON available for repair in text mode. */
  }
  return undefined
}

/** Edits JSON objects with an optional row view; incomplete rows remain invalid drafts. */
export function ResourceJsonField({
  t,
  label,
  help,
  placeholder,
  value,
  onChange,
  disabled,
  errorMessage,
  stringMap = false,
  actions,
}: {
  t: TFunction
  label: string
  help?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  errorMessage?: string
  stringMap?: boolean
  actions?: ReactNode
}) {
  const id = useId()
  const rows = parseRows(value)
  const [jsonMode, setJsonMode] = useState(
    () => stringMap && rows === undefined,
  )
  const showRows = stringMap && !jsonMode && rows !== undefined
  const describedBy = `${id}-help${errorMessage ? ` ${id}-error` : ""}`
  const updateRows = (next: [string, string][]) => {
    const valid =
      next.every(([key]) => key.trim()) &&
      new Set(next.map(([key]) => key.trim())).size === next.length
    // Arrays preserve duplicate/unfinished rows until the user fixes them;
    // the adapter requires an object and will not submit these drafts.
    onChange(
      JSON.stringify(
        valid
          ? Object.fromEntries(next.map(([key, item]) => [key.trim(), item]))
          : next,
      ),
    )
  }
  let canFormat = false
  try {
    JSON.parse(value)
    canFormat = true
  } catch {
    /* No formatting action for invalid JSON. */
  }
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex flex-wrap items-center gap-1">
          {actions}
          {stringMap && (
            <Button
              type="button"
              variant="dashed"
              size="sm"
              disabled={disabled || (!showRows && rows === undefined)}
              onClick={() => setJsonMode(showRows)}
            >
              {t(
                showRows
                  ? "managedSiteChannels:editor.json.editJson"
                  : "managedSiteChannels:editor.json.editRows",
              )}
            </Button>
          )}
          {!showRows && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || !canFormat}
              onClick={() =>
                onChange(JSON.stringify(JSON.parse(value), null, 2))
              }
            >
              {t("managedSiteChannels:editor.json.format")}
            </Button>
          )}
        </div>
      </div>
      {showRows ? (
        <div className="space-y-2">
          {rows.map(([key, item], index) => (
            <div
              key={index}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <ResourceFieldLabel
                  htmlFor={`${id}-${index}-key`}
                  className="text-muted-foreground text-xs"
                >
                  {t("managedSiteChannels:editor.json.key")}
                </ResourceFieldLabel>
                <Input
                  id={`${id}-${index}-key`}
                  aria-label={t("managedSiteChannels:editor.json.keyAt", {
                    field: label,
                    index: index + 1,
                  })}
                  placeholder={t("managedSiteChannels:editor.json.key")}
                  value={key}
                  disabled={disabled}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errorMessage)}
                  onChange={(event) =>
                    updateRows(
                      rows.map((row, i) =>
                        i === index ? [event.target.value, item] : row,
                      ),
                    )
                  }
                />
              </div>
              <div className="min-w-0">
                <ResourceFieldLabel
                  htmlFor={`${id}-${index}-value`}
                  className="text-muted-foreground text-xs"
                >
                  {t("managedSiteChannels:editor.json.value")}
                </ResourceFieldLabel>
                <Input
                  id={`${id}-${index}-value`}
                  aria-label={t("managedSiteChannels:editor.json.valueAt", {
                    field: label,
                    index: index + 1,
                  })}
                  placeholder={t("managedSiteChannels:editor.json.value")}
                  value={item}
                  disabled={disabled}
                  aria-describedby={describedBy}
                  aria-invalid={Boolean(errorMessage)}
                  onChange={(event) =>
                    updateRows(
                      rows.map((row, i) =>
                        i === index ? [key, event.target.value] : row,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={t("managedSiteChannels:editor.json.removeAt", {
                  field: label,
                  index: index + 1,
                })}
                onClick={() => updateRows(rows.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="dashed"
            size="sm"
            className="w-full"
            disabled={disabled}
            onClick={() => updateRows([...rows, ["", ""]])}
          >
            <Plus className="mr-1 size-4" />
            {t("managedSiteChannels:editor.json.addRow")}
          </Button>
        </div>
      ) : (
        <>
          <Label htmlFor={id} className="sr-only">
            {label}
          </Label>
          <Textarea
            id={id}
            rows={5}
            className="font-mono text-xs"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            spellCheck={false}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errorMessage)}
            onChange={(event) => onChange(event.target.value)}
          />
        </>
      )}
      <p
        id={`${id}-help`}
        className="text-muted-foreground mt-1 text-xs leading-relaxed"
      >
        {help}
      </p>
      {errorMessage && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          {errorMessage}
        </p>
      )}
    </fieldset>
  )
}
