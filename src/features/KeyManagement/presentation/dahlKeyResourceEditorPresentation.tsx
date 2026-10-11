import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { Button, Input, Label } from "~/components/ui"
import type { AccountKeyResourceEditorMode } from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_RESOURCE_EDITOR_MODES } from "~/features/KeyManagement/constants"
import type { AccountKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { defineResourceEditorFieldPolicy } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/resourceNative"
import { isValidDahlKeyName } from "~/services/apiAdapters/dahl/keyNameValue"
import {
  DAHL_KEY_RESOURCE_FIELDS as fields,
  DAHL_KEY_NAME_SYNC_STATES as nameSyncStates,
} from "~/services/apiAdapters/dahl/keyResourceFields"
import { DAHL_KEY_NAME_MAX_LENGTH } from "~/services/apiService/dahl/constants"
import { parseDahlTokenAmount } from "~/services/apiService/dahl/tokenAmount"

const transfer = (values: EditableResourceProjection) => {
  const pool = Number(values[fields.PoolTokens])
  const key = Number(values[fields.KeyTokens])
  const returning = values[fields.TransferDirection] === editActions.Return
  const cap = returning ? key : pool
  const amount = parseDahlTokenAmount(values[fields.TransferAmount])
  const valid =
    amount !== null && amount <= cap && Number.isSafeInteger(key + amount)
  return { pool, key, cap, amount, returning, valid }
}

/** Native transfer controls use exact integer shortcuts, without rounding a Max transfer. */
function DahlTokenTransferField({
  values,
  disabled,
  errorMessage,
  onChange,
}: {
  values: EditableResourceProjection
  disabled: boolean
  errorMessage?: string
  onChange: (value: string) => void
}) {
  const { t, i18n } = useTranslation("keyManagement")
  const { pool, key, cap, amount, returning, valid } = transfer(values)
  const format = (value: number) => value.toLocaleString(i18n.language)
  const text = String(values[fields.TransferAmount] ?? "")
  const invalid = text.trim() !== "" && !valid
  const message =
    errorMessage ||
    (invalid
      ? t("native.editor.dahl.invalidAmount", { max: format(cap) })
      : undefined)
  const id = "resource-editor-transfer_amount"
  return (
    <div className="space-y-3">
      <code className="text-muted-foreground block truncate text-xs">
        {String(values[fields.KeyMask])}
      </code>
      <dl className="border-border grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
        <div>
          <dt className="text-muted-foreground">
            {t("native.editor.dahl.poolBalance")}
          </dt>
          <dd className="font-medium tabular-nums">{format(pool)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("native.editor.dahl.keyBalance")}
          </dt>
          <dd className="font-medium tabular-nums">{format(key)}</dd>
        </div>
      </dl>
      <div>
        <Label htmlFor={id}>{t("native.editor.dahl.transferAmount")}</Label>
        <Input
          id={id}
          type="text"
          autoComplete="off"
          value={text}
          disabled={disabled || cap === 0}
          placeholder={t("native.editor.dahl.amountPlaceholder")}
          aria-invalid={Boolean(message)}
          aria-describedby={`${id}-help${message ? ` ${id}-error` : ""}`}
          onChange={(event) => onChange(event.target.value)}
        />
        <p id={`${id}-help`} className="text-muted-foreground mt-1 text-xs">
          {t("native.editor.dahl.amountHelp", { max: format(cap) })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[0.25, 0.5, 1].map((ratio) => (
          <Button
            key={ratio}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || cap === 0 || Math.floor(cap * ratio) === 0}
            onClick={() =>
              onChange(String(ratio === 1 ? cap : Math.floor(cap * ratio)))
            }
          >
            {ratio === 1 ? t("native.editor.dahl.max") : `${ratio * 100}%`}
          </Button>
        ))}
      </div>
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {message}
        </p>
      ) : null}
      {cap === 0 ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t(
            returning
              ? "native.editor.dahl.noKeyTokens"
              : "native.editor.dahl.noPoolTokens",
          )}
        </p>
      ) : null}
      {valid && amount !== null ? (
        <dl
          aria-live="polite"
          className="bg-muted grid grid-cols-2 gap-3 rounded-lg p-3 text-sm"
        >
          <div>
            <dt className="text-muted-foreground">
              {t("native.editor.dahl.poolAfter")}
            </dt>
            <dd className="font-medium tabular-nums">
              {format(pool + (returning ? amount : -amount))}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("native.editor.dahl.keyAfter")}
            </dt>
            <dd className="font-medium tabular-nums">
              {format(key + (returning ? -amount : amount))}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  )
}

/** Each native action has its own fields and confirmation. */
export function getDahlKeyResourceEditorPresentation(
  mode: AccountKeyResourceEditorMode,
  descriptors?: readonly ResourceFieldDescriptor[],
): AccountKeyResourceEditorPresentation {
  const creating = mode === ACCOUNT_KEY_RESOURCE_EDITOR_MODES.Create
  return {
    title: (t, values) =>
      t(
        creating
          ? "keyManagement:native.editor.dahl.createTitle"
          : values[fields.TransferDirection] === editActions.Rename
            ? "keyManagement:native.editor.dahl.rename"
            : values[fields.TransferDirection] === editActions.Return
              ? "keyManagement:native.editor.dahl.return"
              : "keyManagement:native.editor.dahl.allocate",
      ),
    submitLabel: (t, values) =>
      t(
        creating
          ? "keyManagement:native.editor.dahl.create"
          : values[fields.TransferDirection] === editActions.Rename
            ? "keyManagement:native.editor.dahl.saveName"
            : values[fields.TransferDirection] === editActions.Return
              ? "keyManagement:native.editor.dahl.return"
              : "keyManagement:native.editor.dahl.allocate",
      ),
    canSubmit: (values) =>
      creating || values[fields.TransferDirection] === editActions.Rename
        ? isValidDahlKeyName(values[fields.Name])
        : transfer(values).valid,
    ...(creating
      ? {
          summary: {
            title: (t: TFunction) =>
              t("keyManagement:native.editor.dahl.createTitle"),
            describe: (_values: EditableResourceProjection, t: TFunction) =>
              t("keyManagement:native.editor.dahl.createHelp"),
          },
        }
      : {}),
    policy: defineResourceEditorFieldPolicy({
      fields: creating
        ? [
            {
              fieldId: fields.Name,
              renderer: "text" as const,
              section: "spending",
              order: 0,
              resolveLabel: (t: TFunction) =>
                t("keyManagement:native.editor.dahl.name"),
            },
          ]
        : [
            {
              fieldId: fields.TransferAmount,
              renderer: "text" as const,
              section: "spending",
              order: 1,
              visibleWhen: (values: EditableResourceProjection) =>
                values[fields.TransferDirection] !== editActions.Rename,
              resolveLabel: (t: TFunction) =>
                t("keyManagement:native.editor.dahl.transferAmount"),
              issueLabelResolvers: {
                out_of_range: (t: TFunction) =>
                  t("keyManagement:native.editor.dahl.amountInvalid"),
              },
            },
            {
              fieldId: fields.Name,
              renderer: "text" as const,
              section: "spending",
              order: 1,
              visibleWhen: (values: EditableResourceProjection) =>
                values[fields.TransferDirection] === editActions.Rename,
              resolveLabel: (t: TFunction) =>
                t("keyManagement:native.editor.dahl.name"),
              issueLabelResolvers: {
                out_of_range: (t: TFunction) =>
                  t("keyManagement:native.editor.dahl.nameInvalid"),
              },
            },
          ].filter(
            (field) =>
              !descriptors ||
              descriptors.some(
                (descriptor) => descriptor.fieldId === field.fieldId,
              ),
          ),
      hiddenFields: creating
        ? []
        : [
            fields.PoolTokens,
            fields.KeyTokens,
            fields.KeyMask,
            fields.NameSync,
            fields.TransferDirection,
          ]
            .map((fieldId) => ({
              fieldId,
              reason: "read-only" as const,
            }))
            .filter(
              (field) =>
                !descriptors ||
                descriptors.some(
                  (descriptor) => descriptor.fieldId === field.fieldId,
                ),
            ),
    }),
    sectionOrder: { spending: 0 },
    sectionLabelResolvers: {
      spending: (t) =>
        t(
          creating
            ? "keyManagement:native.editor.dahl.name"
            : "keyManagement:native.editor.dahl.manageTitle",
        ),
    },
    renderField: (field, context) =>
      field.descriptor.fieldId === fields.Name ? (
        <DahlKeyNameField
          value={String(context.values[fields.Name] ?? "")}
          sync={
            creating
              ? ""
              : String(
                  context.initialValues[fields.NameSync] ??
                    nameSyncStates.Cached,
                )
          }
          disabled={field.disabled}
          errorMessage={field.errorMessage}
          onSubmit={context.onSubmit}
          onChange={(value) => context.onValueChange(fields.Name, value)}
        />
      ) : field.descriptor.fieldId === fields.TransferAmount ? (
        <DahlTokenTransferField
          values={{
            ...context.values,
            [fields.PoolTokens]:
              context.initialValues[fields.PoolTokens] ?? null,
            [fields.KeyTokens]: context.initialValues[fields.KeyTokens] ?? null,
            [fields.KeyMask]: context.initialValues[fields.KeyMask] ?? null,
          }}
          disabled={field.disabled}
          errorMessage={field.errorMessage}
          onChange={(value) =>
            context.onValueChange(fields.TransferAmount, value)
          }
        />
      ) : undefined,
  }
}

/** Keep the name's persistence and synchronization state visible while editing. */
function DahlKeyNameField({
  value,
  sync,
  disabled,
  errorMessage,
  onChange,
  onSubmit,
}: {
  value: string
  sync: string
  disabled: boolean
  errorMessage?: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation("keyManagement")
  return (
    <div className="space-y-2">
      <Label htmlFor="dahl-key-name">{t("native.editor.dahl.name")}</Label>
      <Input
        id="dahl-key-name"
        autoFocus
        value={value}
        maxLength={DAHL_KEY_NAME_MAX_LENGTH}
        disabled={disabled}
        aria-describedby="dahl-key-name-help"
        aria-invalid={Boolean(errorMessage)}
        placeholder={t("native.editor.dahl.namePlaceholder")}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      <p id="dahl-key-name-help" className="text-muted-foreground text-xs">
        {t("native.editor.dahl.nameHelp")}
      </p>
      {sync ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t(
            sync === nameSyncStates.Pending
              ? "native.editor.dahl.namePending"
              : sync === nameSyncStates.Synced
                ? "native.editor.dahl.nameSynced"
                : "native.editor.dahl.nameCached",
          )}
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
