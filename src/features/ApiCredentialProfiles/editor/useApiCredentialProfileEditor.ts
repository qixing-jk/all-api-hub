import type { ChangeEvent } from "react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  formatDatePickerTimestamp,
  parseDatePickerTimestamp,
} from "~/components/ui/datePickerValue"
import type { ApiCredentialProfileDialogProps } from "~/features/ApiCredentialProfiles/editor/apiCredentialProfileDialogContracts"
import toast from "~/lib/notify"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import {
  coerceApiCredentialTelemetryJsonPathMap,
  isSupportedApiCredentialTelemetryEndpoint,
  telemetryFinancialMappingSchema,
  type ApiCredentialTelemetryJsonPathField,
} from "~/services/apiCredentialProfiles/telemetry/config"
import { normalizeHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import {
  OPTIONAL_PERMISSION_IDS,
  requestPermissionDetailed,
} from "~/services/permissions/permissionManager"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import type {
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetryFinancialMapping,
  ApiCredentialTelemetryJsonPathMap,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_MODES,
  DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG,
  TELEMETRY_FINANCIAL_ROLES,
  TELEMETRY_FINANCIAL_SCOPES,
} from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ApiCredentialProfileDialog")
const dialogSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog

export const LEGACY_TELEMETRY_ASSET = "legacy"
/**
 * Normalizes a profile baseUrl for safe persistence based on the selected API type.
 */
function normalizeBaseUrl(
  apiType: ApiVerificationApiType,
  baseUrl: string,
): string | null {
  return toProtocolRoot(apiType, baseUrl)
}

/**
 * Falls back to the default telemetry preset when the profile has no mode yet.
 */
function normalizeTelemetryMode(
  mode: ApiCredentialTelemetryConfig["mode"] | undefined,
): ApiCredentialTelemetryCapabilityMode {
  return mode ?? DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG.mode
}

/** Keep edit hydration, validation and permission-aware save in one session owner. */
export function useApiCredentialProfileEditor({
  isOpen,
  onClose,
  profile,
  addPrefill,
  onSave,
}: Pick<
  ApiCredentialProfileDialogProps,
  "isOpen" | "onClose" | "profile" | "addPrefill" | "onSave"
>) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
    "keyManagement",
  ])
  const isEditMode = Boolean(profile)
  const dialogTitle = isEditMode
    ? t("apiCredentialProfiles:dialog.editTitle")
    : t("apiCredentialProfiles:dialog.addTitle")

  const [name, setName] = useState("")
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    API_TYPES.OPENAI_COMPATIBLE,
  )
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [requestHeaderRows, setRequestHeaderRows] = useState<
    Array<{ id: number; name: string; value: string }>
  >([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [expiresAtInput, setExpiresAtInput] = useState("")
  const [telemetryMode, setTelemetryMode] =
    useState<ApiCredentialTelemetryCapabilityMode>(
      DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG.mode,
    )
  const [customAssetKind, setCustomAssetKind] = useState(LEGACY_TELEMETRY_ASSET)
  const [customAssetCode, setCustomAssetCode] = useState("")
  const [customBalanceRole, setCustomBalanceRole] = useState<
    ApiCredentialTelemetryFinancialMapping["role"]
  >(TELEMETRY_FINANCIAL_ROLES.Available)
  const [customBalanceScope, setCustomBalanceScope] = useState<
    ApiCredentialTelemetryFinancialMapping["scope"]
  >(TELEMETRY_FINANCIAL_SCOPES.Unknown)
  const buildFinancialMapping = ():
    ApiCredentialTelemetryFinancialMapping | undefined => {
    if (customAssetKind === LEGACY_TELEMETRY_ASSET) return undefined
    const code = customAssetCode.trim()
    const originalAsset =
      profile?.telemetryConfig?.customEndpoint?.financialMapping?.asset
    const originalCode =
      originalAsset?.kind === ASSET_KINDS.Currency
        ? originalAsset.code
        : originalAsset?.id
    const asset =
      originalAsset?.kind === customAssetKind && originalCode === code
        ? originalAsset
        : customAssetKind === ASSET_KINDS.Crypto
          ? { kind: ASSET_KINDS.Crypto, id: "XNO" }
          : customAssetKind === ASSET_KINDS.Currency
            ? { kind: ASSET_KINDS.Currency, code: code.toUpperCase() }
            : {
                kind: ASSET_KINDS.Quota,
                id: code,
                label: code,
                displayScale: 1,
                displayLabel: code,
              }
    return telemetryFinancialMappingSchema.parse({
      asset,
      role: customBalanceRole,
      scope: customBalanceScope,
    })
  }
  const [customEndpoint, setCustomEndpoint] = useState("")
  const [customBearerToken, setCustomBearerToken] = useState("")
  const [customJsonPaths, setCustomJsonPaths] =
    useState<ApiCredentialTelemetryJsonPathMap>({})

  const [isSaving, setIsSaving] = useState(false)

  const [errors, setErrors] = useState<{
    name?: string
    baseUrl?: string
    apiKey?: string
    requestHeaders?: string
    telemetryEndpoint?: string
    telemetryJsonPaths?: string
  }>({})

  useEffect(() => {
    if (!isOpen) return

    setErrors({})
    const mapping = profile?.telemetryConfig?.customEndpoint?.financialMapping
    setCustomAssetKind(mapping?.asset.kind ?? LEGACY_TELEMETRY_ASSET)
    setCustomAssetCode(
      mapping?.asset.kind === ASSET_KINDS.Currency
        ? mapping.asset.code
        : mapping?.asset.kind === ASSET_KINDS.Quota ||
            mapping?.asset.kind === ASSET_KINDS.Crypto
          ? mapping.asset.id
          : "",
    )
    setCustomBalanceRole(mapping?.role ?? TELEMETRY_FINANCIAL_ROLES.Available)
    setCustomBalanceScope(mapping?.scope ?? TELEMETRY_FINANCIAL_SCOPES.Unknown)

    if (profile) {
      setName(profile.name ?? "")
      setApiType(profile.apiType)
      setBaseUrl(profile.baseUrl ?? "")
      setApiKey(profile.apiKey ?? "")
      setRequestHeaderRows(
        Object.entries(profile.requestHeaders ?? {}).map(
          ([name, value], id) => ({ id, name, value }),
        ),
      )
      setTagIds(profile.tagIds ?? [])
      setNotes(profile.notes ?? "")
      setSourceUrl(profile.sourceUrl ?? "")
      setExpiresAtInput(formatDatePickerTimestamp(profile.expiresAt))
      setTelemetryMode(normalizeTelemetryMode(profile.telemetryConfig?.mode))
      setCustomEndpoint(profile.telemetryConfig?.customEndpoint?.endpoint ?? "")
      setCustomBearerToken(
        profile.telemetryConfig?.customEndpoint?.bearerToken ?? "",
      )
      setCustomJsonPaths(
        profile.telemetryConfig?.customEndpoint?.jsonPaths ?? {},
      )
      return
    }

    setName(addPrefill?.name ?? "")
    setApiType(API_TYPES.OPENAI_COMPATIBLE)
    setBaseUrl(addPrefill?.baseUrl ?? "")
    setApiKey("")
    setRequestHeaderRows([])
    setTagIds([])
    setNotes("")
    setSourceUrl("")
    setExpiresAtInput("")
    setTelemetryMode(DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG.mode)
    setCustomEndpoint("")
    setCustomBearerToken("")
    setCustomJsonPaths({})
  }, [addPrefill, isOpen, profile])

  const normalizedBaseUrlPreview = useMemo(() => {
    const normalized = normalizeBaseUrl(apiType, baseUrl)
    return normalized ?? ""
  }, [apiType, baseUrl])
  const buildRequestHeaders = () => {
    const rows = requestHeaderRows.filter(
      ({ name, value }) => name.trim() || value.trim(),
    )
    const names = rows.map(({ name }) => name.trim().toLowerCase())
    if (new Set(names).size !== names.length) {
      throw new Error(
        t("apiCredentialProfiles:dialog.errors.requestHeadersInvalid"),
      )
    }
    return normalizeHeaderOverrides(
      Object.fromEntries(rows.map(({ name, value }) => [name, value])),
    )
  }

  const validate = () => {
    const nextErrors: typeof errors = {}

    const trimmedName = name.trim()
    if (!trimmedName) {
      nextErrors.name = t("apiCredentialProfiles:dialog.errors.nameRequired")
    }

    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      nextErrors.apiKey = t("apiCredentialProfiles:dialog.errors.keyRequired")
    }

    const normalizedBaseUrl = normalizeBaseUrl(apiType, baseUrl)
    if (!normalizedBaseUrl) {
      nextErrors.baseUrl = t(
        "apiCredentialProfiles:dialog.errors.baseUrlInvalid",
      )
    }

    if (
      telemetryMode === API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint
    ) {
      const trimmedEndpoint = customEndpoint.trim()

      if (!trimmedEndpoint) {
        nextErrors.telemetryEndpoint = t(
          "apiCredentialProfiles:dialog.errors.telemetryEndpointRequired",
        )
      } else if (
        normalizedBaseUrl &&
        !isSupportedApiCredentialTelemetryEndpoint(
          normalizedBaseUrl,
          trimmedEndpoint,
        )
      ) {
        nextErrors.telemetryEndpoint = t(
          "apiCredentialProfiles:dialog.errors.telemetryEndpointInvalid",
        )
      }

      try {
        const mapping = buildFinancialMapping()
        const hasFinancialPaths = [
          customJsonPaths.balanceUsd,
          customJsonPaths.todayCostUsd,
          customJsonPaths.totalUsedUsd,
          customJsonPaths.totalGrantedUsd,
          customJsonPaths.totalAvailableUsd,
        ].some((value) => value?.trim())
        if (
          !mapping &&
          hasFinancialPaths &&
          !profile?.telemetryConfig?.customEndpoint
        )
          throw new Error("Explicit financial mapping required")
      } catch {
        nextErrors.telemetryJsonPaths = t(
          "apiCredentialProfiles:dialog.financialMapping.invalid",
        )
      }
      const jsonPaths = coerceApiCredentialTelemetryJsonPathMap(customJsonPaths)
      const rawJsonPathCount = Object.values(customJsonPaths).filter(
        (value) => typeof value === "string" && value.trim(),
      ).length
      if (rawJsonPathCount === 0) {
        nextErrors.telemetryJsonPaths = t(
          "apiCredentialProfiles:dialog.errors.telemetryJsonPathRequired",
        )
      } else if (Object.keys(jsonPaths).length !== rawJsonPathCount) {
        nextErrors.telemetryJsonPaths = t(
          "apiCredentialProfiles:dialog.errors.telemetryJsonPathInvalid",
        )
      }
    }

    try {
      buildRequestHeaders()
    } catch {
      nextErrors.requestHeaders = t(
        "apiCredentialProfiles:dialog.errors.requestHeadersInvalid",
      )
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0 ? normalizedBaseUrl : null
  }

  const buildTelemetryConfig = (): ApiCredentialTelemetryConfig => {
    if (
      telemetryMode !== API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint
    ) {
      return { mode: telemetryMode }
    }

    return {
      mode: API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint,
      customEndpoint: {
        endpoint: customEndpoint.trim(),
        ...(customBearerToken.trim()
          ? { bearerToken: customBearerToken.trim() }
          : {}),
        jsonPaths: coerceApiCredentialTelemetryJsonPathMap(customJsonPaths),
        ...(buildFinancialMapping()
          ? { financialMapping: buildFinancialMapping() }
          : {}),
      },
    }
  }

  const handleJsonPathChange =
    (field: ApiCredentialTelemetryJsonPathField) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setCustomJsonPaths((prev) => ({
        ...prev,
        [field]: event.target.value,
      }))
    }

  const handleClose = () => {
    if (isSaving) return
    onClose()
  }

  const handleSave = async () => {
    const normalizedBaseUrl = validate()
    if (!normalizedBaseUrl) return

    void trackProductAnalyticsActionStarted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: isEditMode
        ? PRODUCT_ANALYTICS_ACTION_IDS.UpdateApiCredentialProfile
        : PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile,
      surfaceId: dialogSurface,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    setIsSaving(true)
    try {
      const requestHeaders = buildRequestHeaders()
      if (
        requestHeaders["user-agent"] !== undefined &&
        import.meta.env.BROWSER !== "firefox"
      ) {
        // Request from the Save gesture; background refreshes never prompt.
        const result = await requestPermissionDetailed(
          OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
        )
        if (!result.success) {
          setErrors({
            requestHeaders: t(
              "apiCredentialProfiles:dialog.errors.userAgentPermission",
            ),
          })
          return
        }
      }
      await onSave({
        id: profile?.id,
        name: name.trim(),
        apiType,
        baseUrl: normalizedBaseUrl,
        apiKey: apiKey.trim(),
        ...(requestHeaderRows.length || profile?.requestHeaders
          ? { requestHeaders }
          : {}),
        tagIds,
        notes: notes.trim(),
        sourceUrl: sourceUrl.trim(),
        expiresAt: parseDatePickerTimestamp(expiresAtInput),
        telemetryConfig: buildTelemetryConfig(),
      })

      toast.success(
        isEditMode
          ? t("apiCredentialProfiles:messages.updated")
          : t("apiCredentialProfiles:messages.created"),
      )
      handleClose()
    } catch (error) {
      logger.error("Failed to save profile", error)
      toast.error(t("apiCredentialProfiles:messages.saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    isEditMode,
    normalizedBaseUrlPreview,
    dialogTitle,
    name,
    setName,
    apiType,
    setApiType,
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    requestHeaderRows,
    setRequestHeaderRows,
    tagIds,
    setTagIds,
    notes,
    setNotes,
    sourceUrl,
    setSourceUrl,
    expiresAtInput,
    setExpiresAtInput,
    telemetryMode,
    setTelemetryMode,
    customAssetKind,
    setCustomAssetKind,
    customAssetCode,
    setCustomAssetCode,
    customBalanceRole,
    setCustomBalanceRole,
    customBalanceScope,
    setCustomBalanceScope,
    customEndpoint,
    setCustomEndpoint,
    customBearerToken,
    setCustomBearerToken,
    customJsonPaths,
    isSaving,
    errors,
    handleJsonPathChange,
    handleClose,
    handleSave,
  }
}
