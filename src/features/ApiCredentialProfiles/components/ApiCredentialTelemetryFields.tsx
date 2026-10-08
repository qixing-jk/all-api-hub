import { KeyRound } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { FormField, Input, SearchableSelect } from "~/components/ui"
import { type useApiCredentialProfileEditor } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfileEditor"
import { API_CREDENTIAL_TELEMETRY_JSON_PATH_FIELDS } from "~/services/apiCredentialProfiles/telemetry/config"
import type { ApiCredentialTelemetryCapabilityMode } from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_TELEMETRY_MODES } from "~/types/apiCredentialProfiles"

/** Present telemetry settings without owning draft or save lifecycle. */
export function ApiCredentialTelemetryFields({
  editor,
}: {
  editor: Pick<
    ReturnType<typeof useApiCredentialProfileEditor>,
    | "telemetryMode"
    | "setTelemetryMode"
    | "customEndpoint"
    | "setCustomEndpoint"
    | "customBearerToken"
    | "setCustomBearerToken"
    | "customJsonPaths"
    | "handleJsonPathChange"
    | "errors"
    | "isSaving"
  >
}) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "common",
    "keyManagement",
  ])
  const {
    telemetryMode,
    setTelemetryMode,
    customEndpoint,
    setCustomEndpoint,
    customBearerToken,
    setCustomBearerToken,
    customJsonPaths,
    handleJsonPathChange,
    errors,
    isSaving,
  } = editor
  const telemetryModeInputId = "api-credential-profile-telemetry-mode"
  const customEndpointInputId =
    "api-credential-profile-telemetry-custom-endpoint"
  const customBearerTokenInputId =
    "api-credential-profile-telemetry-bearer-token"

  const telemetryJsonPathFields = useMemo(() => {
    const labels = {
      balanceUsd: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.balanceUsd",
      ),
      todayCostUsd: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.todayCostUsd",
      ),
      todayRequests: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.todayRequests",
      ),
      todayPromptTokens: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.todayPromptTokens",
      ),
      todayCompletionTokens: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.todayCompletionTokens",
      ),
      todayTotalTokens: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.todayTotalTokens",
      ),
      totalUsedUsd: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.totalUsedUsd",
      ),
      totalGrantedUsd: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.totalGrantedUsd",
      ),
      totalAvailableUsd: t(
        "apiCredentialProfiles:dialog.telemetryJsonPaths.totalAvailableUsd",
      ),
      expiresAt: t("apiCredentialProfiles:dialog.telemetryJsonPaths.expiresAt"),
    }
    return API_CREDENTIAL_TELEMETRY_JSON_PATH_FIELDS.map((field) => ({
      field,
      label: labels[field],
    }))
  }, [t])

  return (
    <>
      <FormField
        label={t("apiCredentialProfiles:dialog.fields.telemetryPreset")}
        description={t("apiCredentialProfiles:dialog.hints.telemetryPreset")}
        htmlFor={telemetryModeInputId}
      >
        <SearchableSelect
          id={telemetryModeInputId}
          aria-label={t("apiCredentialProfiles:dialog.fields.telemetryPreset")}
          options={[
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.Auto,
              label: t("apiCredentialProfiles:dialog.telemetryModes.auto"),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.Disabled,
              label: t("apiCredentialProfiles:dialog.telemetryModes.disabled"),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance,
              label: t(
                "apiCredentialProfiles:dialog.telemetryModes.deepSeekBalance",
              ),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.GlmQuota,
              label: t("apiCredentialProfiles:dialog.telemetryModes.glmQuota"),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.KimiQuota,
              label: t("apiCredentialProfiles:dialog.telemetryModes.kimiQuota"),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance,
              label: t(
                "apiCredentialProfiles:dialog.telemetryModes.kimiOpenPlatformBalance",
              ),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage,
              label: t(
                "apiCredentialProfiles:dialog.telemetryModes.openCodeGoUsage",
              ),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
              label: t(
                "apiCredentialProfiles:dialog.telemetryModes.newApiTokenUsage",
              ),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
              label: t(
                "apiCredentialProfiles:dialog.telemetryModes.sub2apiUsage",
              ),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
              label: t(
                "apiCredentialProfiles:dialog.telemetryModes.openaiBilling",
              ),
            },
            {
              value: API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint,
              label: t(
                "apiCredentialProfiles:dialog.telemetryModes.customReadOnlyEndpoint",
              ),
            },
          ]}
          value={telemetryMode}
          onChange={(value) =>
            setTelemetryMode(value as ApiCredentialTelemetryCapabilityMode)
          }
          placeholder={t(
            "apiCredentialProfiles:dialog.placeholders.telemetryPreset",
          )}
          disabled={isSaving}
        />
      </FormField>

      {telemetryMode ===
        API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint && (
        <details
          open
          className="border-border py-density-3 rounded-lg border px-3"
        >
          <summary className="dark:text-foreground text-secondary-foreground cursor-pointer text-sm font-medium">
            {t("apiCredentialProfiles:dialog.customTelemetry.title")}
          </summary>
          <div className="mt-density-3 space-y-density-4">
            <FormField
              label={t("apiCredentialProfiles:dialog.fields.telemetryEndpoint")}
              required
              error={errors.telemetryEndpoint}
              description={t(
                "apiCredentialProfiles:dialog.hints.telemetryEndpoint",
              )}
              htmlFor={customEndpointInputId}
            >
              <Input
                id={customEndpointInputId}
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                placeholder={t(
                  "apiCredentialProfiles:dialog.placeholders.telemetryEndpoint",
                )}
                disabled={isSaving}
              />
            </FormField>

            <FormField
              label={t(
                "apiCredentialProfiles:dialog.fields.telemetryBearerToken",
              )}
              description={t(
                "apiCredentialProfiles:dialog.hints.telemetryBearerToken",
              )}
              htmlFor={customBearerTokenInputId}
            >
              <Input
                id={customBearerTokenInputId}
                type="password"
                revealable
                revealLabels={{
                  show: t("keyManagement:actions.showKey"),
                  hide: t("keyManagement:actions.hideKey"),
                }}
                value={customBearerToken}
                onChange={(event) => setCustomBearerToken(event.target.value)}
                placeholder={t(
                  "apiCredentialProfiles:dialog.placeholders.telemetryBearerToken",
                )}
                disabled={isSaving}
                leftIcon={<KeyRound className="h-5 w-5" />}
              />
            </FormField>

            <div className="space-y-density-2">
              <div>
                <div className="dark:text-foreground text-secondary-foreground text-sm font-medium">
                  {t("apiCredentialProfiles:dialog.customTelemetry.paths")}
                </div>
                <p className="dark:text-secondary-foreground text-muted-foreground text-xs">
                  {t("apiCredentialProfiles:dialog.hints.telemetryJsonPaths")}
                </p>
              </div>
              <div className="gap-y-density-3 grid gap-x-3 sm:grid-cols-2">
                {telemetryJsonPathFields.map(({ field, label }) => {
                  const inputId = `api-credential-profile-telemetry-path-${field}`
                  return (
                    <FormField key={field} label={label} htmlFor={inputId}>
                      <Input
                        id={inputId}
                        value={customJsonPaths[field] ?? ""}
                        onChange={handleJsonPathChange(field)}
                        placeholder={t(
                          "apiCredentialProfiles:dialog.placeholders.telemetryJsonPath",
                        )}
                        disabled={isSaving}
                      />
                    </FormField>
                  )
                })}
              </div>
              {errors.telemetryJsonPaths && (
                <p className="text-destructive-text text-xs">
                  {errors.telemetryJsonPaths}
                </p>
              )}
            </div>
          </div>
        </details>
      )}
    </>
  )
}
