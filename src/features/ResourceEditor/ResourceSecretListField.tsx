import type { TFunction } from "i18next"
import { ChevronDown, Eye, EyeOff, Plus, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import { Button, IconButton, Input, Label } from "~/components/ui"
import type {
  ResourceFieldValue,
  ResourceOperationOptions,
  ResourceSecretListDescriptor,
  ResourceSecretListEntry,
  ResourceSecretListValue,
} from "~/services/apiAdapters/contracts/resourceNative"

import type { ResourceFieldPresentation } from "./resourceFieldPolicy"

type Props = {
  t: TFunction
  label: string
  descriptor: ResourceSecretListDescriptor
  presentation: ResourceFieldPresentation
  value: ResourceFieldValue
  disabled?: boolean
  hasErrors?: boolean
  onChange: (value: ResourceSecretListValue) => void
  onLoadSecret?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
}

/** Render reusable credential rows while native adapters own identity and persistence. */
export function ResourceSecretListField({ value, onChange, ...props }: Props) {
  const helpId = useId()
  const entries =
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "secret-list"
      ? value.entries
      : []
  return (
    <fieldset
      className={
        props.presentation.compactSecretRows ? "space-y-2" : "space-y-3"
      }
      disabled={props.disabled}
    >
      <legend className="text-sm font-medium">{props.label}</legend>
      {entries.map((entry, index) => (
        <SecretRow
          {...props}
          helpId={helpId}
          key={entry.id}
          entry={entry}
          index={index}
          onChange={(updated) =>
            onChange({
              kind: "secret-list",
              entries: entries.map((row) =>
                row.id === entry.id ? updated : row,
              ),
            })
          }
          canRemove={entries.length > (props.descriptor.minEntries ?? 0)}
          onRemove={() =>
            onChange({
              kind: "secret-list",
              entries: entries.filter((row) => row.id !== entry.id),
            })
          }
        />
      ))}
      <Button
        type="button"
        variant="dashed"
        size="sm"
        className="w-full"
        leftIcon={<Plus className="h-4 w-4" />}
        disabled={props.disabled}
        onClick={() =>
          onChange({
            kind: "secret-list",
            entries: [
              ...entries,
              {
                id: crypto.randomUUID(),
                secret: { kind: "replace", value: "" },
                fields: {},
              },
            ],
          })
        }
      >
        {props.t("ui:secretList.add")}
      </Button>
      {props.presentation.compactSecretRows &&
        props.presentation.entryFields?.map((field) =>
          field.resolveHelp ? (
            <p
              key={field.fieldId}
              id={`${helpId}-${field.fieldId}`}
              className="text-muted-foreground text-xs"
            >
              {field.resolveLabel(props.t)}: {field.resolveHelp(props.t)}
            </p>
          ) : null,
        )}
    </fieldset>
  )
}

/** Keep revealed secrets local and discard late reads after input, removal or session changes. */
function SecretRow({
  t,
  descriptor,
  presentation,
  entry,
  index,
  disabled,
  onChange,
  onLoadSecret,
  canRemove,
  onRemove,
  hasErrors,
  helpId,
}: Omit<Props, "value" | "onChange"> & {
  entry: ResourceSecretListEntry
  index: number
  canRemove: boolean
  onChange: (value: ResourceSecretListEntry) => void
  onRemove: () => void
  helpId: string
}) {
  const id = useId()
  const saved = descriptor.savedEntries.find(
    (candidate) => candidate.id === entry.id,
  )
  const [expanded, setExpanded] = useState(
    !presentation.compactSecretRows || !saved,
  )
  const open = expanded || Boolean(hasErrors)
  useEffect(() => {
    if (hasErrors) setExpanded(true)
  }, [hasErrors])
  const [revealed, setRevealed] = useState(false)
  const [loaded, setLoaded] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const pending = useRef<AbortController | undefined>(undefined)
  const cancel = useCallback(() => {
    pending.current?.abort()
    pending.current = undefined
    setLoading(false)
  }, [])
  useEffect(() => {
    cancel()
    setLoaded(undefined)
    setRevealed(false)
    setFailed(false)
    return () => {
      pending.current?.abort()
    }
  }, [cancel, onLoadSecret, saved?.loadFieldId, disabled])
  useEffect(() => {
    cancel()
    setLoaded(undefined)
    setFailed(false)
    // Ordinary typing preserves the user's visibility choice; restoring a saved
    // key clears revealed data and returns to the masked, unchanged state.
    if (entry.secret.kind === "unchanged") setRevealed(false)
  }, [cancel, entry.secret])
  const displayValue =
    entry.secret.kind === "replace" ? entry.secret.value : loaded ?? ""
  const show = async () => {
    if (revealed) {
      setRevealed(false)
      setLoaded(undefined)
      return
    }
    if (entry.secret.kind === "replace") {
      setRevealed(true)
      return
    }
    if (!onLoadSecret || !saved?.loadFieldId) return
    cancel()
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    setFailed(false)
    try {
      const secret = await onLoadSecret(saved.loadFieldId, {
        signal: controller.signal,
      })
      if (!controller.signal.aborted) {
        setLoaded(secret)
        setRevealed(true)
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true)
    } finally {
      if (pending.current === controller) {
        pending.current = undefined
        setLoading(false)
      }
    }
  }
  const rowLabel = t("ui:secretList.row", { number: index + 1 })
  const summary = descriptor.entryFields
    .flatMap((field) => {
      const policy = presentation.entryFields?.find(
        (item) => item.fieldId === field.fieldId,
      )
      const value = entry.fields[field.fieldId]
      return policy && value !== undefined && value !== ""
        ? [
            `${policy.resolveLabel(t)}: ${field.type === "number" ? value : t("ui:secretList.configured")}`,
          ]
        : []
    })
    .join(" · ")
  const heading = (
    <>
      {presentation.compactSecretRows && (
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 ${open ? "" : "-rotate-90"}`}
        />
      )}
      <span className="shrink-0 text-sm font-medium">
        {presentation.compactSecretRows
          ? t("ui:secretList.shortRow", { number: index + 1 })
          : rowLabel}
      </span>
      {!open && summary && (
        <span
          id={`${id}-summary`}
          title={summary}
          className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
        >
          {summary}
        </span>
      )}
      <span
        id={`${id}-state`}
        className={
          presentation.compactSecretRows &&
          saved &&
          entry.secret.kind === "unchanged"
            ? "sr-only"
            : `text-muted-foreground text-xs ${open ? "" : "min-w-0 truncate"}`
        }
      >
        {t(
          !saved
            ? "ui:secretList.newState"
            : entry.secret.kind === "replace"
              ? "ui:secretList.replacementState"
              : "ui:secretList.retainedState",
        )}
      </span>
    </>
  )
  return (
    <fieldset
      className={`border-border min-w-0 rounded-lg border ${open ? "space-y-2" : ""} ${presentation.compactSecretRows ? "px-2 py-1" : "p-3"}`}
      aria-label={rowLabel}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex min-w-0 flex-1 items-center gap-x-2 gap-y-1 ${open ? "flex-wrap" : ""}`}
        >
          {presentation.compactSecretRows ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`min-h-8 min-w-0 flex-1 justify-start px-1 text-left font-normal has-[>svg]:px-1 ${open ? "basis-full sm:basis-0" : ""}`}
              aria-describedby={!open && summary ? `${id}-summary` : undefined}
              aria-label={t(
                open ? "ui:secretList.collapse" : "ui:secretList.expand",
                { number: index + 1 },
              )}
              aria-expanded={open}
              aria-controls={`${id}-content`}
              disabled={disabled}
              onClick={() => {
                if (open) {
                  cancel()
                  setLoaded(undefined)
                  setRevealed(false)
                  setFailed(false)
                }
                setExpanded(!open)
              }}
            >
              {heading}
            </Button>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {heading}
            </div>
          )}
          {open && saved && entry.secret.kind === "replace" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange({ ...entry, secret: { kind: "unchanged" } })
              }
            >
              {t("ui:secretList.restore")}
            </Button>
          )}
        </div>
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-red-600 dark:text-red-400"
          aria-label={t("ui:secretList.remove")}
          title={t("ui:secretList.remove")}
          disabled={disabled || !canRemove}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
      <div id={`${id}-content`} hidden={!open} className="space-y-2 pb-1">
        <div className="space-y-1">
          <Label className="sr-only" htmlFor={`${id}-secret`}>
            {rowLabel}
          </Label>
          <Input
            id={`${id}-secret`}
            type={revealed ? "text" : "password"}
            value={displayValue}
            autoComplete="new-password"
            aria-describedby={`${id}-state`}
            disabled={disabled}
            placeholder={t(
              saved
                ? "ui:secretList.keepPlaceholder"
                : "ui:secretList.newPlaceholder",
            )}
            rightIcon={
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  disabled ||
                  (!loading &&
                    entry.secret.kind !== "replace" &&
                    (!saved?.loadFieldId || !onLoadSecret))
                }
                aria-label={t(
                  loading
                    ? "common:actions.cancel"
                    : revealed
                      ? "ui:secretList.hide"
                      : "ui:secretList.show",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => (loading ? cancel() : void show())}
              >
                {loading ? (
                  <X className="h-4 w-4" />
                ) : revealed ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </IconButton>
            }
            onChange={(event) => {
              cancel()
              setLoaded(undefined)
              setFailed(false)
              onChange({
                ...entry,
                secret:
                  !event.target.value && saved
                    ? { kind: "unchanged" }
                    : { kind: "replace", value: event.target.value },
              })
            }}
          />
          {loading && (
            <p role="status" className="text-muted-foreground text-xs">
              {t("common:status.loading")}
            </p>
          )}
        </div>
        {failed && (
          <p role="alert" className="text-destructive text-sm">
            {t("ui:secretList.loadFailed")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {descriptor.entryFields.map((field) => {
            const fieldPolicy = presentation.entryFields?.find(
              (item) => item.fieldId === field.fieldId,
            )
            if (!fieldPolicy)
              throw new Error("Missing credential attribute presentation")
            return (
              <div
                key={field.fieldId}
                className={`min-w-0 space-y-1 ${fieldPolicy.width === "wide" ? "w-full sm:w-auto sm:flex-1" : fieldPolicy.width === "compact" ? "w-24" : "w-full"}`}
              >
                <Label htmlFor={`${id}-${field.fieldId}`}>
                  {fieldPolicy.resolveLabel(t)}
                </Label>
                <Input
                  id={`${id}-${field.fieldId}`}
                  type={field.type}
                  min={field.min}
                  max={field.max}
                  value={entry.fields[field.fieldId] ?? ""}
                  disabled={disabled}
                  aria-describedby={
                    fieldPolicy.resolveHelp
                      ? presentation.compactSecretRows
                        ? `${helpId}-${field.fieldId}`
                        : `${id}-${field.fieldId}-help`
                      : undefined
                  }
                  placeholder={fieldPolicy.resolvePlaceholder?.(t)}
                  onChange={(event) =>
                    onChange({
                      ...entry,
                      fields: {
                        ...entry.fields,
                        [field.fieldId]: event.target.value,
                      },
                    })
                  }
                />
              </div>
            )
          })}
          {!presentation.compactSecretRows &&
            descriptor.entryFields.map((field) => {
              const fieldPolicy = presentation.entryFields?.find(
                (item) => item.fieldId === field.fieldId,
              )
              return fieldPolicy?.resolveHelp ? (
                <p
                  key={field.fieldId}
                  id={`${id}-${field.fieldId}-help`}
                  className="text-muted-foreground w-full text-xs"
                >
                  {fieldPolicy.resolveHelp(t)}
                </p>
              ) : null
            })}
        </div>
      </div>
    </fieldset>
  )
}
