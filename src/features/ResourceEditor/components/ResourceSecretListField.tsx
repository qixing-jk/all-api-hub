import type { TFunction } from "i18next"
import {
  ChevronDown,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  Plus,
  X,
} from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"

import {
  Button,
  IconButton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import { ResourceFieldLabel } from "~/features/ResourceEditor/components/ResourceFieldLabel"
import type { ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { cn } from "~/lib/utils"
import type {
  ResourceFieldValue,
  ResourceOperationOptions,
  ResourceSecretListDescriptor,
  ResourceSecretListEntry,
  ResourceSecretListValue,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  maskSecretForDisplay,
  normalizeSecretMaskForDisplay,
} from "~/utils/core/formatters"

type Props = {
  t: TFunction
  label: string
  descriptor: ResourceSecretListDescriptor
  presentation: ResourceFieldPresentation
  /**
   * Absent or non-`secret-list` values render as an empty list.
   */
  value?: ResourceFieldValue
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
  const [editingId, setEditingId] = useState<string>()
  const entries =
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "secret-list"
      ? value.entries
      : []
  return (
    <fieldset className="min-w-0" disabled={props.disabled}>
      <legend className="mb-density-1-5 text-sm leading-5 font-medium">
        {props.label}
      </legend>
      <div className="space-y-density-2">
        {entries.map((entry, index) => (
          <SecretRow
            {...props}
            helpId={helpId}
            key={entry.id}
            entry={entry}
            index={index}
            listOpen={editingId === entry.id}
            onListOpenChange={(open) =>
              setEditingId(open ? entry.id : undefined)
            }
            onChange={(updated) =>
              onChange({
                kind: "secret-list",
                entries: entries.map((row) =>
                  row.id === entry.id ? updated : row,
                ),
              })
            }
            canRemove={entries.length > (props.descriptor.minEntries ?? 0)}
            onBulkPaste={
              props.descriptor.allowBulkPaste
                ? (keys) => {
                    const unique = [...new Set(keys)]
                    onChange({
                      kind: "secret-list",
                      entries: entries.flatMap((row) =>
                        row.id !== entry.id
                          ? [row]
                          : unique.map((key, index) => ({
                              ...row,
                              id: index === 0 ? row.id : crypto.randomUUID(),
                              secret: { kind: "replace" as const, value: key },
                            })),
                      ),
                    })
                  }
                : undefined
            }
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
          onClick={() => {
            const id = crypto.randomUUID()
            setEditingId(id)
            onChange({
              kind: "secret-list",
              entries: [
                ...entries,
                {
                  id,
                  secret: { kind: "replace", value: "" },
                  fields: {},
                },
              ],
            })
          }}
        >
          {props.t("ui:secretList.add")}
        </Button>
      </div>
      {entries.length > 0 &&
        props.presentation.compactSecretRows &&
        props.presentation.entryFields
          ?.filter((field) =>
            props.descriptor.entryFields.some(
              (descriptor) => descriptor.fieldId === field.fieldId,
            ),
          )
          .map((field) =>
            field.resolveHelp ? (
              <p
                key={field.fieldId}
                id={`${helpId}-${field.fieldId}`}
                className="text-muted-foreground mt-density-1 text-xs"
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
  onBulkPaste,
  listOpen,
  onListOpenChange,
}: Omit<Props, "value" | "onChange"> & {
  entry: ResourceSecretListEntry
  index: number
  canRemove: boolean
  onChange: (value: ResourceSecretListEntry) => void
  onRemove: () => void
  helpId: string
  onBulkPaste?: (keys: string[]) => void
  listOpen: boolean
  onListOpenChange: (open: boolean) => void
}) {
  const id = useId()
  const saved = descriptor.savedEntries.find(
    (candidate) => candidate.id === entry.id,
  )
  const [expanded, setExpanded] = useState(
    !presentation.compactSecretRows || !saved,
  )
  const list = presentation.secretListLayout === "list"
  const open = list ? listOpen : expanded || Boolean(hasErrors)
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
  useEffect(() => {
    if (!open) {
      cancel()
      setLoaded(undefined)
      setRevealed(false)
      setFailed(false)
    }
  }, [cancel, open])
  const displayValue =
    entry.secret.kind === "replace"
      ? entry.secret.value
      : loaded ??
        (saved?.canReplace === false
          ? normalizeSecretMaskForDisplay(saved.maskedValue ?? "")
          : "")
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
  const summary =
    presentation.resolveEntrySummary?.(t, entry.fields) ??
    descriptor.entryFields
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
  const description = presentation.resolveEntryDescription?.(t, entry.fields)
  const canReveal =
    entry.secret.kind === "replace" ||
    Boolean(saved?.loadFieldId && onLoadSecret)
  const listSummary =
    entry.secret.kind === "replace"
      ? [
          maskSecretForDisplay(entry.secret.value),
          t(
            saved ? "ui:secretList.replacementState" : "ui:secretList.newState",
          ),
        ]
          .filter(Boolean)
          .join(" · ")
      : summary ||
        (saved?.maskedValue
          ? normalizeSecretMaskForDisplay(saved.maskedValue)
          : t("ui:secretList.retainedState"))
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
      className={cn(
        "border-border min-w-0",
        list ? "py-density-2 border-b" : "rounded-lg border",
        open && "space-y-density-2",
        !list &&
          (presentation.compactSecretRows
            ? "py-density-1 px-2"
            : "py-density-3 px-3"),
      )}
      aria-label={rowLabel}
    >
      <div className="gap-y-density-2 flex items-center justify-between gap-x-2">
        <div
          className={`gap-y-density-1 flex min-w-0 flex-1 items-center gap-x-2 ${open ? "flex-wrap" : ""}`}
        >
          {list ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {presentation.resolveEntryTitle?.(t, entry.fields) ||
                  t("ui:secretList.shortRow", { number: index + 1 })}
              </div>
              <div
                className="text-muted-foreground truncate text-xs"
                title={listSummary}
              >
                {listSummary}
              </div>
              <span id={`${id}-state`} className="sr-only">
                {t(
                  !saved
                    ? "ui:secretList.newState"
                    : "ui:secretList.retainedState",
                )}
              </span>
            </div>
          ) : presentation.compactSecretRows ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`min-h-(--density-control-sm) min-w-0 flex-1 justify-start px-1 text-left font-normal has-[>svg]:px-1 ${open ? "basis-full sm:basis-0" : ""}`}
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
            <div className="gap-y-density-2 flex min-w-0 flex-wrap items-center gap-x-2">
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
        {list &&
          descriptor.entryFields
            .filter((field) => field.type === "boolean")
            .map((field) => (
              <Switch
                key={field.fieldId}
                size="sm"
                aria-label={presentation.entryFields
                  ?.find((item) => item.fieldId === field.fieldId)
                  ?.resolveLabel(t)}
                checked={entry.fields[field.fieldId] !== "false"}
                disabled={disabled}
                aria-describedby={
                  presentation.entryFields?.find(
                    (item) => item.fieldId === field.fieldId,
                  )?.resolveHelp
                    ? `${helpId}-${field.fieldId}`
                    : undefined
                }
                onChange={(checked) =>
                  onChange({
                    ...entry,
                    fields: {
                      ...entry.fields,
                      [field.fieldId]: String(checked),
                    },
                  })
                }
              />
            ))}
        {list && (
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-label={t(
              open ? "ui:secretList.collapse" : "ui:secretList.expand",
              { number: index + 1 },
            )}
            title={t(open ? "common:actions.close" : "common:actions.edit")}
            aria-expanded={open}
            aria-controls={`${id}-content`}
            disabled={disabled}
            onClick={() => onListOpenChange(!open)}
          >
            {open ? (
              <ChevronDown aria-hidden className="h-4 w-4" />
            ) : (
              <Pencil aria-hidden className="h-4 w-4" />
            )}
          </IconButton>
        )}
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive-text shrink-0"
          aria-label={t("ui:secretList.remove")}
          title={t("ui:secretList.remove")}
          disabled={disabled || !canRemove}
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div
        id={`${id}-content`}
        hidden={!open}
        className="space-y-density-2 pb-density-1"
      >
        {!presentation.compactSecretRows &&
          presentation.resolveEntrySummary &&
          summary && <p className="text-muted-foreground text-xs">{summary}</p>}
        <div className="space-y-density-1">
          <Label className="sr-only" htmlFor={`${id}-secret`}>
            {rowLabel}
          </Label>
          <Input
            id={`${id}-secret`}
            data-testid={`${descriptor.fieldId}-secret-input-${index}`}
            type={revealed || saved?.canReplace === false ? "text" : "password"}
            readOnly={saved?.canReplace === false}
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
              canReveal ? (
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
                  aria-busy={loading}
                  onClick={() => (loading ? cancel() : void show())}
                >
                  {loading ? (
                    <LoaderCircle
                      aria-hidden
                      className="h-4 w-4 animate-spin"
                    />
                  ) : revealed ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </IconButton>
              ) : undefined
            }
            onChange={(event) => {
              if (saved?.canReplace === false) return
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
            onPaste={(event) => {
              if (saved || !onBulkPaste) return
              const keys = event.clipboardData
                .getData("text")
                .split(/[,;，；\s]+/)
                .map((key) => key.replace(/^["'`]+|["'`]+$/g, ""))
                .filter(Boolean)
              if (keys.length < 2) return
              event.preventDefault()
              onBulkPaste(keys)
            }}
          />
          {!canReveal && saved?.canReplace === false && (
            <p className="text-muted-foreground text-xs">
              {t("ui:secretList.maskedOnly")}
            </p>
          )}
        </div>
        {failed && (
          <p role="alert" className="text-destructive-text text-sm">
            {t("ui:secretList.loadFailed")}
          </p>
        )}
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
        <div
          className={
            list
              ? "gap-y-density-2 grid grid-cols-2 items-end gap-x-3"
              : "gap-y-density-2 flex flex-wrap gap-x-2"
          }
        >
          {descriptor.entryFields
            .filter((field) => !list || field.type !== "boolean")
            .map((field) => {
              const fieldPolicy = presentation.entryFields?.find(
                (item) => item.fieldId === field.fieldId,
              )
              if (!fieldPolicy)
                throw new Error("Missing credential attribute presentation")
              const FieldLabel =
                field.type === "boolean" ? Label : ResourceFieldLabel
              return (
                <div
                  key={field.fieldId}
                  className={
                    list
                      ? `min-w-0 ${fieldPolicy.width ? "col-span-2 sm:col-span-1" : "col-span-2"}`
                      : `min-w-0 ${field.type === "boolean" ? "gap-y-density-3 flex items-center justify-between gap-x-3" : ""} ${fieldPolicy.width === "wide" ? "w-full sm:w-auto sm:flex-1" : fieldPolicy.width === "compact" ? "w-24" : "w-full"}`
                  }
                >
                  <FieldLabel htmlFor={`${id}-${field.fieldId}`}>
                    {fieldPolicy.resolveLabel(t)}
                  </FieldLabel>
                  {field.type === "boolean" ? (
                    <Switch
                      id={`${id}-${field.fieldId}`}
                      size="sm"
                      aria-describedby={
                        fieldPolicy.resolveHelp
                          ? presentation.compactSecretRows
                            ? `${helpId}-${field.fieldId}`
                            : `${id}-${field.fieldId}-help`
                          : undefined
                      }
                      checked={entry.fields[field.fieldId] !== "false"}
                      disabled={disabled}
                      onChange={(checked) =>
                        onChange({
                          ...entry,
                          fields: {
                            ...entry.fields,
                            [field.fieldId]: String(checked),
                          },
                        })
                      }
                    />
                  ) : field.type === "select" ? (
                    <Select
                      value={`option-${field.options?.findIndex((option) => option.value === (entry.fields[field.fieldId] ?? ""))}`}
                      disabled={disabled}
                      onValueChange={(token) => {
                        const selected = field.options?.[Number(token.slice(7))]
                        if (selected)
                          onChange({
                            ...entry,
                            fields: {
                              ...entry.fields,
                              [field.fieldId]: selected.value,
                            },
                          })
                      }}
                    >
                      <SelectTrigger id={`${id}-${field.fieldId}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option, index) => (
                          <SelectItem
                            key={option.value}
                            value={`option-${index}`}
                          >
                            {fieldPolicy.optionLabelResolvers?.[option.value]?.(
                              t,
                            ) ??
                              option.displayLabel ??
                              option.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
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
                  )}
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
