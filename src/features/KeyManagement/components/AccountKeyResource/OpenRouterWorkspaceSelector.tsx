import { useTranslation } from "react-i18next"

import { Alert, Button, SearchableSelect } from "~/components/ui"
import type { AccountKeyScope } from "~/services/apiAdapters/contracts/accountKeyResource"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"

export type OpenRouterWorkspaceSelectorProps = {
  scopes: readonly AccountKeyScope[]
  selectedScope: AccountKeyScope | null
  isLoading?: boolean
  isRetrying?: boolean
  isPartial?: boolean
  error?: "unavailable" | "permission_denied" | "authentication_failed"
  onSelectScope: (scopeKey: string) => void
  onRetry?: () => void
}

/** Selects the validated workspace route scope; workspace IDs are never user-entered. */
export function OpenRouterWorkspaceSelector({
  scopes,
  selectedScope,
  isLoading = false,
  isRetrying = false,
  isPartial = false,
  error,
  onSelectScope,
  onRetry,
}: OpenRouterWorkspaceSelectorProps) {
  const { t } = useTranslation()
  const options = scopes.map((scope) => ({
    value: scope.scopeKey,
    label: `${scope.displayName} (${scope.routeKey})`,
    ...(scope.secondaryLabel && scope.secondaryLabel !== scope.routeKey
      ? {
          suffix: (
            <span className="text-muted-foreground ml-2 max-w-1/2 truncate text-xs">
              {scope.secondaryLabel}
            </span>
          ),
        }
      : {}),
  }))

  return (
    <section
      aria-labelledby="openrouter-workspace-heading"
      className="space-y-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="openrouter-workspace-heading" className="text-sm font-medium">
          {t("keyManagement:openRouter.workspace.heading")}
        </h2>
      </div>
      {isPartial ? (
        <div className="flex flex-wrap items-center gap-2">
          <Alert
            variant="warning"
            compact
            title={t("keyManagement:openRouter.workspace.partial")}
            className="flex-1"
          />
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              aria-label={t("keyManagement:openRouter.workspace.retry")}
            >
              {t("keyManagement:openRouter.workspace.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <SearchableSelect
        data-testid={KEY_MANAGEMENT_TEST_IDS.openRouterWorkspaceSelect}
        aria-label={t("keyManagement:openRouter.workspace.label")}
        options={options}
        value={selectedScope?.scopeKey ?? ""}
        placeholder={t("keyManagement:openRouter.workspace.placeholder")}
        emptyMessage={t("keyManagement:openRouter.workspace.empty")}
        disabled={isLoading || Boolean(error)}
        onChange={onSelectScope}
      />
      {isLoading ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t("keyManagement:openRouter.workspace.loading")}
        </p>
      ) : null}
      {!isLoading && !error && scopes.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("keyManagement:openRouter.workspace.empty")}
        </p>
      ) : null}
      {error ? (
        <Alert
          variant="destructive"
          compact
          title={t("keyManagement:openRouter.workspace.error")}
          description={t("keyManagement:openRouter.workspace.errorHelp")}
        >
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              aria-label={t("keyManagement:openRouter.workspace.retry")}
            >
              {t("keyManagement:openRouter.workspace.retry")}
            </Button>
          ) : null}
        </Alert>
      ) : null}
    </section>
  )
}
