import { useId, type Dispatch, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"

import { Checkbox, InlineMessage, ToggleButton } from "~/components/ui"
import type { getNewApiTokenCatalogPermissions } from "~/services/apiService/newApiFamily/accessTokens/creation"
import { NEW_API_TOKEN_ACCESS_SCOPES as ACCESS_SCOPES } from "~/services/apiService/newApiFamily/accessTokens/protocol"

import { useNewApiTokenScopeLabels } from "./useNewApiTokenScopeLabels"

const readOnlyScopes = new Set<string>([
  ACCESS_SCOPES.PROFILE_READ,
  ACCESS_SCOPES.USAGE_READ,
  ACCESS_SCOPES.WALLET_READ,
  ACCESS_SCOPES.API_KEY_READ,
])
const coreScopes = new Set<string>([
  ...readOnlyScopes,
  ACCESS_SCOPES.API_KEY_WRITE,
  ACCESS_SCOPES.API_KEY_REVEAL,
  ACCESS_SCOPES.WALLET_WRITE,
])

/** Displays the grantable permissions and presets from the site's catalog. */
export function NewApiTokenPermissions({
  catalogPermissions,
  grantedScopes,
  setScopes,
  disabled,
}: {
  catalogPermissions: ReturnType<typeof getNewApiTokenCatalogPermissions>
  grantedScopes: string[]
  setScopes: Dispatch<SetStateAction<string[]>>
  disabled: boolean
}) {
  const { t } = useTranslation("accountDialog")
  const id = useId()
  const catalogScopes = catalogPermissions.map(({ scope }) => scope)
  const scopeLabels = useNewApiTokenScopeLabels()
  const scopeHints: Partial<Record<string, string>> = {
    [ACCESS_SCOPES.WALLET_WRITE]: t("tokenCreation.walletWriteHint"),
  }
  const corePermissions = catalogPermissions.filter(({ scope }) =>
    coreScopes.has(scope),
  )
  const reservedPermissions = catalogPermissions.filter(
    ({ scope }) => !coreScopes.has(scope),
  )
  const core = corePermissions.map(({ scope }) => scope)
  const readOnly = core.filter((scope) => readOnlyScopes.has(scope))
  const presets = [
    { label: t("tokenCreation.presetAll"), scopes: catalogScopes },
    ...(core.length < catalogScopes.length
      ? [{ label: t("tokenCreation.presetStandard"), scopes: core }]
      : []),
    ...(readOnly.length < core.length
      ? [{ label: t("tokenCreation.presetReadOnly"), scopes: readOnly }]
      : []),
  ]
  const renderScope = ({
    scope,
    label,
  }: (typeof catalogPermissions)[number]) => {
    const hint = scopeHints[scope]
    const labelId = hint ? `${id}-${scope}-label` : undefined
    const hintId = hint ? `${id}-${scope}-hint` : undefined
    return (
      <label
        key={scope}
        className="flex cursor-pointer items-start gap-2.5 py-1 text-sm has-disabled:cursor-default"
      >
        <Checkbox
          className="mt-0.5"
          aria-labelledby={labelId}
          aria-describedby={hintId}
          disabled={scope === ACCESS_SCOPES.PROFILE_READ || disabled}
          checked={grantedScopes.includes(scope)}
          onCheckedChange={(checked) =>
            setScopes((current) =>
              checked === true
                ? [...current, scope]
                : current.filter((value) => value !== scope),
            )
          }
        />
        <span className="min-w-0">
          <span id={labelId} title={scope}>
            {scopeLabels[scope] ?? label}
            {scope === ACCESS_SCOPES.PROFILE_READ && (
              <>
                {" "}
                <span className="text-xs text-muted-foreground">
                  ({t("tokenCreation.requiredPermission")})
                </span>
              </>
            )}
          </span>
          {hint && (
            <span
              id={hintId}
              className="block text-xs leading-relaxed text-muted-foreground"
            >
              {hint}
            </span>
          )}
        </span>
      </label>
    )
  }
  return (
    <section
      aria-labelledby={`${id}-permissions`}
      className="space-y-3 border-t border-border-subtle pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={`${id}-permissions`} className="font-medium">
          {t("tokenCreation.permissions")}
        </h3>
        {catalogScopes.some(
          (scope) => scope !== ACCESS_SCOPES.PROFILE_READ,
        ) && (
          <div
            role="group"
            aria-label={t("tokenCreation.permissionPresets")}
            className="flex flex-wrap items-center gap-1 rounded-lg bg-muted px-1 py-0.5"
          >
            {presets.map((preset) => (
              <ToggleButton
                key={preset.label}
                type="button"
                size="sm"
                disabled={disabled}
                isActive={
                  preset.scopes.length === grantedScopes.length &&
                  preset.scopes.every((scope) => grantedScopes.includes(scope))
                }
                className="min-h-7 px-2 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                onClick={() => setScopes(preset.scopes)}
              >
                {preset.label}
              </ToggleButton>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("tokenCreation.permissionsHint")}
      </p>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">
            {t("tokenCreation.corePermissions")}
          </h4>
          {corePermissions.map(renderScope)}
        </div>
        {reservedPermissions.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">
              {t("tokenCreation.reservedPermissions")}
            </h4>
            {reservedPermissions.map(renderScope)}
          </div>
        )}
      </div>
      {reservedPermissions.some(({ scope }) =>
        grantedScopes.includes(scope),
      ) && (
        <InlineMessage role="note" tone="neutral" size="sm">
          {t("tokenCreation.reservedWarning")}
        </InlineMessage>
      )}
    </section>
  )
}
