import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, SearchableSelect } from "~/components/ui"
import type { AccountKeyScope } from "~/services/apiAdapters/contracts/accountKeyResource"

import { getAccountKeyScopeMessages } from "../../presentation/accountKeyResourcePresentation"
import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"

export type AccountKeyScopeSelectorProps = {
  siteType?: string
  scopes: readonly AccountKeyScope[]
  selectedScope: AccountKeyScope | null
  isLoading?: boolean
  isRetrying?: boolean
  isPartial?: boolean
  error?: "unavailable" | "permission_denied" | "authentication_failed"
  onSelectScope: (scopeKey: string) => void
  onRetry?: () => void
}

/** Selects the validated resource scope; scope IDs are never user-entered. */
export function AccountKeyScopeSelector({
  siteType,
  scopes,
  selectedScope,
  isLoading = false,
  isRetrying = false,
  isPartial = false,
  error,
  onSelectScope,
  onRetry,
}: AccountKeyScopeSelectorProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const messages = getAccountKeyScopeMessages(siteType, t)
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
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-sm font-medium">
          {messages.heading}
        </h2>
      </div>
      {isPartial ? (
        <div className="flex flex-wrap items-center gap-2">
          <Alert
            variant="warning"
            compact
            title={messages.partial}
            className="flex-1"
          />
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              aria-label={messages.retry}
            >
              {messages.retry}
            </Button>
          ) : null}
        </div>
      ) : null}
      <SearchableSelect
        data-testid={KEY_MANAGEMENT_TEST_IDS.openRouterWorkspaceSelect}
        aria-label={messages.label}
        options={options}
        value={selectedScope?.scopeKey ?? ""}
        placeholder={messages.placeholder}
        emptyMessage={messages.empty}
        disabled={isLoading || Boolean(error)}
        onChange={onSelectScope}
      />
      {isLoading ? (
        <p role="status" className="text-muted-foreground text-xs">
          {messages.loading}
        </p>
      ) : null}
      {!isLoading && !error && scopes.length === 0 ? (
        <p className="text-muted-foreground text-xs">{messages.empty}</p>
      ) : null}
      {error ? (
        <Alert
          variant="destructive"
          compact
          title={messages.error}
          description={messages.errorHelp}
        >
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              aria-label={messages.retry}
            >
              {messages.retry}
            </Button>
          ) : null}
        </Alert>
      ) : null}
    </section>
  )
}
