import { Plus, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button, FormField, Input } from "~/components/ui"
import { type useApiCredentialProfileEditor } from "~/features/ApiCredentialProfiles/editor/useApiCredentialProfileEditor"

/** Present header rows and errors while the editor owns persisted draft semantics. */
export function ApiCredentialRequestHeaderFields({
  editor,
}: {
  editor: Pick<
    ReturnType<typeof useApiCredentialProfileEditor>,
    "requestHeaderRows" | "setRequestHeaderRows" | "errors" | "isSaving"
  >
}) {
  const { t } = useTranslation(["apiCredentialProfiles", "keyManagement"])
  const { requestHeaderRows, setRequestHeaderRows, errors, isSaving } = editor
  return (
    <>
      <details
        open={requestHeaderRows.length > 0}
        className="border-border py-density-3 rounded-lg border px-3"
      >
        <summary className="dark:text-foreground text-secondary-foreground cursor-pointer text-sm font-medium">
          {t("apiCredentialProfiles:dialog.requestHeaders.title")}
        </summary>
        <div className="mt-density-3 space-y-density-3">
          {requestHeaderRows.map((row) => (
            <div
              key={row.id}
              className="gap-density-3 grid grid-cols-[minmax(0,1fr)_auto] items-end sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]"
            >
              <FormField
                className="col-span-2 min-w-0 sm:col-span-1"
                label={t("apiCredentialProfiles:dialog.requestHeaders.name")}
                htmlFor={`api-credential-header-name-${row.id}`}
              >
                <Input
                  id={`api-credential-header-name-${row.id}`}
                  containerClassName="w-full"
                  placeholder="User-Agent"
                  value={row.name}
                  disabled={isSaving}
                  onChange={(event) =>
                    setRequestHeaderRows((rows) =>
                      rows.map((item) =>
                        item.id === row.id
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </FormField>
              <FormField
                className="min-w-0"
                label={t("apiCredentialProfiles:dialog.requestHeaders.value")}
                htmlFor={`api-credential-header-value-${row.id}`}
              >
                <Input
                  id={`api-credential-header-value-${row.id}`}
                  containerClassName="w-full"
                  placeholder={t(
                    "apiCredentialProfiles:dialog.requestHeaders.value",
                  )}
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("keyManagement:actions.showKey"),
                    hide: t("keyManagement:actions.hideKey"),
                  }}
                  value={row.value}
                  disabled={isSaving}
                  onChange={(event) =>
                    setRequestHeaderRows((rows) =>
                      rows.map((item) =>
                        item.id === row.id
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </FormField>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={isSaving}
                aria-label={t(
                  "apiCredentialProfiles:dialog.requestHeaders.remove",
                )}
                onClick={() =>
                  setRequestHeaderRows((rows) =>
                    rows.filter((item) => item.id !== row.id),
                  )
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() =>
              setRequestHeaderRows((rows) => [
                ...rows,
                {
                  id: Math.max(-1, ...rows.map((row) => row.id)) + 1,
                  name: "",
                  value: "",
                },
              ])
            }
          >
            <Plus className="h-4 w-4" />
            {t("apiCredentialProfiles:dialog.requestHeaders.add")}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t("apiCredentialProfiles:dialog.requestHeaders.hint")}
          </p>
        </div>
      </details>

      {errors.requestHeaders && (
        <p role="alert" className="text-destructive-text text-xs">
          {errors.requestHeaders}
        </p>
      )}
    </>
  )
}
