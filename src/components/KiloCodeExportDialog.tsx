import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Badge,
  Button,
  Card,
  CompactMultiSelect,
  FormField,
  Modal,
  SearchableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type CompactMultiSelectOption,
} from "~/components/ui"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { buildDefaultTokenCreatePrefill } from "~/features/TokenProvisioning/components/AddTokenDialog/defaultTokenCreatePrefill"
import { useAccountData } from "~/hooks/useAccountData"
import {
  ensureAccountApiToken,
  resolveDefaultTokenQuickCreateResolution,
} from "~/services/accounts/accountOperations"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import { compareAccountDisplayNames } from "~/services/accounts/utils/accountDisplayName"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
} from "~/services/accounts/utils/apiServiceRequest"
import { resolveExportTokenForSecret } from "~/services/accounts/utils/exportTokenSecret"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import {
  buildKiloCodeApiConfigs,
  KILO_CODE_EXPORT_FILENAMES,
  KILO_CODE_EXPORT_TARGET_OPTIONS,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
  type KiloCodeExportTuple,
} from "~/services/integrations/kiloCodeExport"
import { getKiloCodeExportAnalyticsTarget } from "~/services/integrations/kiloCodeExportAnalytics"
import {
  buildKiloCodeExportOutput,
  type BuildKiloCodeExportOutputOptions,
  type KiloCodeExportOutput,
} from "~/services/integrations/kiloCodeExportPolicy"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { stripTrailingOpenAIV1 } from "~/utils/core/url"

import { KiloCodeExportGuidance } from "./KiloCodeExportGuidance"
import { pickNewestKiloCodeToken } from "./kiloCodeTokenSelection"

const kiloCodeAccountExportAnalyticsContext = {
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountTokenKiloCodeExportDialog,
}

const KILO_CODE_INVENTORY_STATUSES = {
  Idle: "idle",
  Loading: "loading",
  Loaded: "loaded",
  Error: "error",
} as const

/**
 * Builds the stable toast id used while Kilo Code export creates a missing token.
 */
export function buildKiloCodeCreateTokenToastId(siteId: string) {
  return `kilocode-create-token-${siteId}`
}

interface KiloCodeExportDialogProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Optional initial selection for opening the dialog from contextual entry points
   * (e.g. Key Management token actions). Applied once per open.
   */
  initialSelectedSiteIds?: string[]
  /**
   * Optional initial token selection per site (token ids as strings). Applied once per open.
   */
  initialSelectedTokenIdsBySite?: Record<string, string[]>
}

type TokenLoadStatus =
  (typeof KILO_CODE_INVENTORY_STATUSES)[keyof typeof KILO_CODE_INVENTORY_STATUSES]

interface TokenInventoryState {
  status: TokenLoadStatus
  tokens: ApiToken[]
  errorMessage?: string
}

type DefaultTokenCreateContext = {
  siteId: string
  allowedGroups: string[]
}

type ModelLoadStatus =
  (typeof KILO_CODE_INVENTORY_STATUSES)[keyof typeof KILO_CODE_INVENTORY_STATUSES]

interface ModelInventoryState {
  status: ModelLoadStatus
  modelIds: string[]
  errorMessage?: string
}

/**
 * Build a safe, human-readable token label for selection UI (never reveals the key).
 */
function getTokenLabel(token: ApiToken, fallbackPrefix: string) {
  const trimmedName = (token.name ?? "").trim()
  if (trimmedName) return trimmedName
  return `${fallbackPrefix} #${token.id}`
}

/**
 * Build a compact label for displaying a site in dense UI (prefers name, falls back to hostname).
 */
function getSiteDisplayName(site: DisplaySiteData) {
  const trimmedName = (site.name ?? "").trim()
  if (trimmedName) return trimmedName
  try {
    return new URL(site.baseUrl).host
  } catch {
    return site.baseUrl.trim()
  }
}

/**
 * Unique key for state maps tracking (siteId, tokenId) combinations in this dialog.
 */
function getTokenSelectionKey(siteId: string, tokenId: number) {
  return `${siteId}:${tokenId}`
}

/**
 * Modal for exporting selected accounts/tokens into Kilo Code / Roo Code settings JSON.
 *
 * Security: exported JSON contains API keys in plaintext; this component never logs
 * token keys or the full export payload.
 */
export function KiloCodeExportDialog({
  isOpen,
  onClose,
  initialSelectedSiteIds,
  initialSelectedTokenIdsBySite,
}: KiloCodeExportDialogProps) {
  const { t } = useTranslation(["ui", "common", "messages"])
  const { enabledAccounts: accounts, enabledDisplayData: displayData } =
    useAccountData()

  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [selectedTokenIdsBySite, setSelectedTokenIdsBySite] = useState<
    Record<string, string[]>
  >({})
  const [currentApiConfigName, setCurrentApiConfigName] = useState("")
  const [exportTarget, setExportTarget] = useState<KiloCodeExportTarget>(
    KILO_CODE_EXPORT_TARGETS.KiloV7,
  )

  const [tokenInventories, setTokenInventories] = useState<
    Record<string, TokenInventoryState>
  >({})
  const [isCreatingToken, setIsCreatingToken] = useState<
    Record<string, boolean>
  >({})
  const [defaultTokenCreateContext, setDefaultTokenCreateContext] =
    useState<DefaultTokenCreateContext | null>(null)

  const [modelInventories, setModelInventories] = useState<
    Record<string, ModelInventoryState>
  >({})
  const [selectedModelIdByToken, setSelectedModelIdByToken] = useState<
    Record<string, string>
  >({})

  /**
   * Prevents duplicate model fetches when selection effects fire in quick succession.
   */
  const modelLoadsInFlightRef = useRef<Set<string>>(new Set())
  const initialSelectionAppliedRef = useRef(false)
  const isDialogActiveRef = useRef(false)

  useEffect(() => {
    isDialogActiveRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    setSelectedSiteIds([])
    setSelectedTokenIdsBySite({})
    setCurrentApiConfigName("")
    setExportTarget(KILO_CODE_EXPORT_TARGETS.KiloV7)
    setTokenInventories({})
    setIsCreatingToken({})
    setDefaultTokenCreateContext(null)
    setModelInventories({})
    setSelectedModelIdByToken({})
    modelLoadsInFlightRef.current.clear()
    initialSelectionAppliedRef.current = false
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (initialSelectionAppliedRef.current) return

    const tokenSelectionMap = initialSelectedTokenIdsBySite ?? {}
    const siteIdsFromTokens = Object.keys(tokenSelectionMap)
    const siteIds = Array.from(
      new Set([...(initialSelectedSiteIds ?? []), ...siteIdsFromTokens]),
    )

    if (siteIds.length > 0) {
      setSelectedSiteIds(siteIds)
    }

    if (siteIdsFromTokens.length > 0) {
      setSelectedTokenIdsBySite(tokenSelectionMap)
    }

    initialSelectionAppliedRef.current = true
  }, [isOpen, initialSelectedSiteIds, initialSelectedTokenIdsBySite])

  const displayById = useMemo(() => {
    return new Map<string, DisplaySiteData>(
      displayData.map((site) => [site.id, site]),
    )
  }, [displayData])

  const accountById = useMemo(() => {
    return new Map<string, SiteAccount>(accounts.map((acc) => [acc.id, acc]))
  }, [accounts])

  const getTokenInventory = useCallback(
    (siteId: string): TokenInventoryState => {
      return (
        tokenInventories[siteId] ?? {
          status: KILO_CODE_INVENTORY_STATUSES.Idle,
          tokens: [],
        }
      )
    },
    [tokenInventories],
  )

  const getModelInventory = useCallback(
    (tokenSelectionKey: string): ModelInventoryState => {
      return (
        modelInventories[tokenSelectionKey] ?? {
          status: KILO_CODE_INVENTORY_STATUSES.Idle,
          modelIds: [],
        }
      )
    },
    [modelInventories],
  )

  const loadTokensForSite = useCallback(
    async (siteId: string, options?: { preferNewest?: boolean }) => {
      const site = displayById.get(siteId)
      if (!site) return

      setTokenInventories((prev) => ({
        ...prev,
        [siteId]: {
          status: KILO_CODE_INVENTORY_STATUSES.Loading,
          tokens: prev[siteId]?.tokens ?? [],
          errorMessage: undefined,
        },
      }))

      try {
        const { keyManagement, request } = createDisplayAccountApiContext(site)
        const tokens = await requireDisplayAccountKeyManagement(
          site,
          keyManagement,
        ).fetchTokens(request)
        if (!Array.isArray(tokens)) {
          setTokenInventories((prev) => ({
            ...prev,
            [siteId]: {
              status: KILO_CODE_INVENTORY_STATUSES.Error,
              tokens: [],
              errorMessage: t("ui:dialog.kiloCode.messages.loadTokensFailed"),
            },
          }))
          return
        }

        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: {
            status: KILO_CODE_INVENTORY_STATUSES.Loaded,
            tokens,
            errorMessage: undefined,
          },
        }))

        // UX: default-select the first token (common case is "one token per site"),
        // and keep previous selections if they still exist after refresh.
        setSelectedTokenIdsBySite((prev) => {
          if (options?.preferNewest && tokens.length > 0) {
            const newestToken = pickNewestKiloCodeToken(tokens)
            return { ...prev, [siteId]: [`${newestToken.id}`] }
          }

          const existingSelections = prev[siteId] ?? []
          const remainingSelections = existingSelections.filter((id) =>
            tokens.some((token) => `${token.id}` === id),
          )
          if (remainingSelections.length > 0) {
            return { ...prev, [siteId]: remainingSelections }
          }

          if (!tokens.length) {
            if (!prev[siteId]) return prev
            const { [siteId]: _unused, ...rest } = prev
            return rest
          }

          return { ...prev, [siteId]: [`${tokens[0].id}`] }
        })
      } catch {
        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: {
            status: KILO_CODE_INVENTORY_STATUSES.Error,
            tokens: [],
            errorMessage: t("ui:dialog.kiloCode.messages.loadTokensFailed"),
          },
        }))
      }
    },
    [displayById, t],
  )

  const loadModelsForToken = useCallback(
    async (siteId: string, token: ApiToken) => {
      const site = displayById.get(siteId)
      if (!site) return

      const tokenSelectionKey = getTokenSelectionKey(siteId, token.id)
      if (modelLoadsInFlightRef.current.has(tokenSelectionKey)) return

      const existingStatus = modelInventories[tokenSelectionKey]?.status
      if (existingStatus === KILO_CODE_INVENTORY_STATUSES.Loaded) return

      modelLoadsInFlightRef.current.add(tokenSelectionKey)

      setModelInventories((prev) => ({
        ...prev,
        [tokenSelectionKey]: {
          status: KILO_CODE_INVENTORY_STATUSES.Loading,
          modelIds: prev[tokenSelectionKey]?.modelIds ?? [],
          errorMessage: undefined,
        },
      }))

      try {
        const resolvedToken = await resolveExportTokenForSecret(site, token)
        const modelIds = await fetchOpenAICompatibleModelIds({
          baseUrl: stripTrailingOpenAIV1(site.baseUrl),
          apiKey: resolvedToken.key,
        })

        const normalized = modelIds
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)

        if (!isDialogActiveRef.current) return

        setModelInventories((prev) => ({
          ...prev,
          [tokenSelectionKey]: {
            status: KILO_CODE_INVENTORY_STATUSES.Loaded,
            modelIds: normalized,
            errorMessage: undefined,
          },
        }))

        // UX: default to the first upstream model for this API key unless the user already chose something.
        setSelectedModelIdByToken((prev) => {
          if (prev[tokenSelectionKey] !== undefined) return prev
          if (!normalized.length) return prev
          return { ...prev, [tokenSelectionKey]: normalized[0] }
        })
      } catch {
        if (!isDialogActiveRef.current) return

        setModelInventories((prev) => ({
          ...prev,
          [tokenSelectionKey]: {
            status: KILO_CODE_INVENTORY_STATUSES.Error,
            modelIds: prev[tokenSelectionKey]?.modelIds ?? [],
            errorMessage: t("ui:dialog.kiloCode.messages.loadModelsFailed"),
          },
        }))
      } finally {
        modelLoadsInFlightRef.current.delete(tokenSelectionKey)
      }
    },
    [displayById, modelInventories, t],
  )

  const createDefaultTokenForSite = async (siteId: string) => {
    const site = displayById.get(siteId)
    const account = accountById.get(siteId)
    if (!site || !account) {
      toast.error(t("ui:dialog.kiloCode.messages.accountNotFound"))
      return
    }

    const toastId = buildKiloCodeCreateTokenToastId(siteId)

    setIsCreatingToken((prev) => ({ ...prev, [siteId]: true }))
    setTokenInventories((prev) => ({
      ...prev,
      [siteId]: {
        status: KILO_CODE_INVENTORY_STATUSES.Loading,
        tokens: prev[siteId]?.tokens ?? [],
      },
    }))

    try {
      const resolution = await resolveDefaultTokenQuickCreateResolution(site)
      if (resolution.kind === TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked) {
        const userMessage = resolution.message?.trim()
          ? resolution.message
          : t("ui:dialog.kiloCode.messages.createTokenBlockedFallback")

        toast.error(userMessage, { id: toastId })
        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: {
            status: KILO_CODE_INVENTORY_STATUSES.Error,
            tokens: prev[siteId]?.tokens ?? [],
            errorMessage: userMessage,
          },
        }))
        return
      }

      if (
        resolution.kind ===
        TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
      ) {
        setDefaultTokenCreateContext({
          siteId,
          allowedGroups: resolution.allowedGroups,
        })
        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: {
            status: KILO_CODE_INVENTORY_STATUSES.Loaded,
            tokens: prev[siteId]?.tokens ?? [],
            errorMessage: undefined,
          },
        }))
        return
      }

      const ensuredToken = await ensureAccountApiToken(account, site, {
        toastId,
        defaultTokenData: resolution.tokenData,
      })

      toast.success(t("ui:dialog.kiloCode.messages.tokenCreated"), {
        id: toastId,
      })

      await loadTokensForSite(siteId, { preferNewest: true })

      setSelectedTokenIdsBySite((prev) => ({
        ...prev,
        [siteId]: [`${ensuredToken.id}`],
      }))
    } catch {
      toast.error(t("ui:dialog.kiloCode.messages.createTokenFailed"), {
        id: toastId,
      })
      setTokenInventories((prev) => ({
        ...prev,
        [siteId]: {
          status: KILO_CODE_INVENTORY_STATUSES.Error,
          tokens: prev[siteId]?.tokens ?? [],
          errorMessage: t("ui:dialog.kiloCode.messages.createTokenFailed"),
        },
      }))
    } finally {
      setIsCreatingToken((prev) => ({ ...prev, [siteId]: false }))
    }
  }

  const siteOptions: CompactMultiSelectOption[] = useMemo(() => {
    return [...displayData]
      .sort((a, b) => compareAccountDisplayNames(a, b))
      .map((site) => ({
        value: site.id,
        label: site.name || site.baseUrl,
      }))
  }, [displayData])

  const selectedSites = useMemo(() => {
    return selectedSiteIds
      .map((id) => displayById.get(id))
      .filter((site): site is DisplaySiteData => Boolean(site))
      .sort((a, b) => compareAccountDisplayNames(a, b))
  }, [displayById, selectedSiteIds])

  useEffect(() => {
    if (!isOpen) return
    if (selectedSiteIds.length === 0) return

    const nextSelectedSiteIds = selectedSiteIds.filter((id) =>
      displayById.has(id),
    )
    if (nextSelectedSiteIds.length === selectedSiteIds.length) return

    setSelectedSiteIds(nextSelectedSiteIds)
    setSelectedTokenIdsBySite((prev) => {
      const next: Record<string, string[]> = {}
      for (const siteId of nextSelectedSiteIds) {
        const tokenIds = prev[siteId]
        if (Array.isArray(tokenIds) && tokenIds.length > 0) {
          next[siteId] = tokenIds
        }
      }
      return next
    })
  }, [displayById, isOpen, selectedSiteIds])

  useEffect(() => {
    if (!isOpen) return
    if (selectedSiteIds.length === 0) return

    for (const siteId of selectedSiteIds) {
      const status =
        tokenInventories[siteId]?.status ?? KILO_CODE_INVENTORY_STATUSES.Idle
      if (status === KILO_CODE_INVENTORY_STATUSES.Idle) {
        void loadTokensForSite(siteId)
      }
    }
  }, [isOpen, loadTokensForSite, selectedSiteIds, tokenInventories])

  useEffect(() => {
    if (!isOpen) return
    if (selectedSiteIds.length === 0) return

    for (const siteId of selectedSiteIds) {
      const inventory = tokenInventories[siteId]
      if (
        !inventory ||
        inventory.status !== KILO_CODE_INVENTORY_STATUSES.Loaded
      )
        continue

      const tokenIds = selectedTokenIdsBySite[siteId] ?? []
      for (const tokenId of tokenIds) {
        const token = inventory.tokens.find(
          (candidate) => `${candidate.id}` === tokenId,
        )
        if (!token) continue

        const tokenSelectionKey = getTokenSelectionKey(siteId, token.id)
        const modelStatus =
          modelInventories[tokenSelectionKey]?.status ??
          KILO_CODE_INVENTORY_STATUSES.Idle
        if (modelStatus === KILO_CODE_INVENTORY_STATUSES.Idle) {
          void loadModelsForToken(siteId, token)
        }
      }
    }
  }, [
    isOpen,
    loadModelsForToken,
    modelInventories,
    selectedSiteIds,
    selectedTokenIdsBySite,
    tokenInventories,
  ])

  const exportSelections: KiloCodeExportTuple[] = useMemo(() => {
    if (!displayData.length) return []

    const selections: KiloCodeExportTuple[] = []

    for (const siteId of selectedSiteIds) {
      const tokenIds = selectedTokenIdsBySite[siteId] ?? []
      if (tokenIds.length === 0) continue

      const site = displayById.get(siteId)
      if (!site) continue

      const inventory = getTokenInventory(siteId)
      const uniqueTokenIds = Array.from(new Set(tokenIds))
      for (const tokenId of uniqueTokenIds) {
        const token = inventory.tokens.find(
          (candidate) => `${candidate.id}` === tokenId,
        )
        if (!token) continue

        const tokenSelectionKey = getTokenSelectionKey(siteId, token.id)

        selections.push({
          accountId: siteId,
          siteName: site.name || site.baseUrl,
          baseUrl: site.baseUrl,
          tokenId: token.id,
          tokenName: token.name,
          tokenKey: token.key,
          modelId: selectedModelIdByToken[tokenSelectionKey],
        })
      }
    }

    return selections
  }, [
    displayData.length,
    displayById,
    getTokenInventory,
    selectedSiteIds,
    selectedModelIdByToken,
    selectedTokenIdsBySite,
  ])

  const { profileNames } = useMemo(() => {
    return buildKiloCodeApiConfigs({
      selections: exportSelections,
    })
  }, [exportSelections])

  const buildResolvedExportSelections = useCallback(async () => {
    const selections: KiloCodeExportTuple[] = []

    for (const siteId of selectedSiteIds) {
      const tokenIds = selectedTokenIdsBySite[siteId] ?? []
      if (tokenIds.length === 0) continue

      const site = displayById.get(siteId)
      if (!site) continue

      const inventory = getTokenInventory(siteId)
      const uniqueTokenIds = Array.from(new Set(tokenIds))

      for (const tokenId of uniqueTokenIds) {
        const token = inventory.tokens.find(
          (candidate) => `${candidate.id}` === tokenId,
        )
        if (!token) continue

        const resolvedToken = await resolveExportTokenForSecret(site, token)
        const tokenSelectionKey = getTokenSelectionKey(siteId, token.id)

        selections.push({
          accountId: siteId,
          siteName: site.name || site.baseUrl,
          baseUrl: site.baseUrl,
          tokenId: token.id,
          tokenName: token.name,
          tokenKey: resolvedToken.key,
          modelId: selectedModelIdByToken[tokenSelectionKey],
        })
      }
    }

    return selections
  }, [
    displayById,
    getTokenInventory,
    selectedModelIdByToken,
    selectedSiteIds,
    selectedTokenIdsBySite,
  ])

  useEffect(() => {
    if (profileNames.length === 0) {
      setCurrentApiConfigName("")
      return
    }
    if (!currentApiConfigName || !profileNames.includes(currentApiConfigName)) {
      setCurrentApiConfigName(profileNames[0])
    }
  }, [currentApiConfigName, profileNames])

  const missingModelIdCount = useMemo(() => {
    return exportSelections.filter((tuple) => !tuple.modelId?.trim()).length
  }, [exportSelections])

  const hasExportableProfiles = profileNames.length > 0
  const canExport = hasExportableProfiles && missingModelIdCount === 0
  const effectiveCurrentApiConfigName =
    currentApiConfigName || profileNames[0] || ""
  const legacyFilename = KILO_CODE_EXPORT_FILENAMES.Legacy
  const selectionSummary = t("ui:dialog.kiloCode.descriptions.selectedSites", {
    sites: selectedSiteIds.length,
    keys: exportSelections.length,
  })
  const exportInsights = {
    itemCount: exportSelections.length,
    modelCount: exportSelections.filter((tuple) => tuple.modelId?.trim())
      .length,
    selectedCount: selectedSiteIds.length,
    kiloCodeExportTarget: getKiloCodeExportAnalyticsTarget(exportTarget),
  }
  const isKiloV7Export = exportTarget === KILO_CODE_EXPORT_TARGETS.KiloV7
  const copyActionLabel = isKiloV7Export
    ? t("ui:dialog.kiloCode.actions.copyKiloV7Provider")
    : t("ui:dialog.kiloCode.actions.copyLegacyApiConfigs")
  const downloadActionLabel = isKiloV7Export
    ? t("ui:dialog.kiloCode.actions.downloadKiloV7Settings")
    : t("ui:dialog.kiloCode.actions.downloadLegacySettings")
  const handleCopyApiConfigs = async () => {
    if (!canExport) return

    const tracker = startProductAnalyticsAction({
      ...kiloCodeAccountExportAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyKiloCodeAccountExportConfig,
    })

    try {
      if (typeof navigator === "undefined") {
        throw new Error(t("ui:dialog.kiloCode.messages.copyFailed"))
      }

      const resolvedSelections = await buildResolvedExportSelections()
      const outputOptions: BuildKiloCodeExportOutputOptions = {
        target: exportTarget,
        selections: resolvedSelections,
        currentLegacyProfileName: effectiveCurrentApiConfigName,
      }
      const output: KiloCodeExportOutput =
        buildKiloCodeExportOutput(outputOptions)
      await navigator.clipboard.writeText(
        JSON.stringify(output.copyPayload, null, 2),
      )
      toast.success(t("ui:dialog.kiloCode.messages.copiedExportConfig"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: exportInsights,
      })
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("ui:dialog.kiloCode.messages.copyFailed")),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: exportInsights,
      })
    }
  }

  const handleDownloadSettings = async () => {
    if (!canExport) return

    const tracker = startProductAnalyticsAction({
      ...kiloCodeAccountExportAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportKiloCodeAccountSettingsFile,
    })

    let url: string | null = null
    let link: HTMLAnchorElement | null = null

    try {
      const resolvedSelections = await buildResolvedExportSelections()
      const output = buildKiloCodeExportOutput({
        target: exportTarget,
        selections: resolvedSelections,
        currentLegacyProfileName: effectiveCurrentApiConfigName,
      })

      const blob = new Blob([JSON.stringify(output.downloadPayload, null, 2)], {
        type: "application/json",
      })
      url = URL.createObjectURL(blob)
      link = document.createElement("a")
      link.href = url
      link.download = output.filename
      document.body.appendChild(link)
      link.click()

      toast.success(t("ui:dialog.kiloCode.messages.downloadedSettings"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: exportInsights,
      })
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("ui:dialog.kiloCode.messages.downloadFailed")),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: exportInsights,
      })
    } finally {
      if (link && document.body.contains(link)) {
        document.body.removeChild(link)
      }
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }

  const handleCloseDefaultTokenCreateDialog = () => {
    setDefaultTokenCreateContext(null)
  }

  const handleDefaultTokenCreateSuccess = async () => {
    if (!defaultTokenCreateContext) return

    const { siteId } = defaultTokenCreateContext
    setDefaultTokenCreateContext(null)
    await loadTokensForSite(siteId, { preferNewest: true })
  }

  const defaultTokenQuickCreateSite = defaultTokenCreateContext
    ? displayById.get(defaultTokenCreateContext.siteId)
    : undefined
  const defaultTokenQuickCreatePrefill = buildDefaultTokenCreatePrefill(
    defaultTokenCreateContext?.allowedGroups,
  )

  const renderSiteCard = (site: DisplaySiteData) => {
    const siteId = site.id
    const siteName = getSiteDisplayName(site)
    const inventory = getTokenInventory(siteId)
    const isLoadingTokens =
      inventory.status === KILO_CODE_INVENTORY_STATUSES.Loading
    const isTokenInventoryIdle =
      inventory.status === KILO_CODE_INVENTORY_STATUSES.Idle
    const isTokenInventoryLoaded =
      inventory.status === KILO_CODE_INVENTORY_STATUSES.Loaded
    const isTokenInventoryError =
      inventory.status === KILO_CODE_INVENTORY_STATUSES.Error
    const isCreating = Boolean(isCreatingToken[siteId])

    const selectedTokenIds = selectedTokenIdsBySite[siteId] ?? []
    const tokenOptions: CompactMultiSelectOption[] = inventory.tokens.map(
      (token) => ({
        value: `${token.id}`,
        label: getTokenLabel(token, t("common:labels.token")),
      }),
    )

    const statusBadge = isTokenInventoryError ? (
      <Badge variant="danger" size="sm">
        {t("common:status.error")}
      </Badge>
    ) : isLoadingTokens || isTokenInventoryIdle ? (
      <Badge variant="info" size="sm">
        {t("common:status.loading")}
      </Badge>
    ) : inventory.tokens.length === 0 ? (
      <Badge variant="warning" size="sm">
        {t("ui:dialog.kiloCode.messages.noTokensTitle")}
      </Badge>
    ) : (
      <Badge variant="success" size="sm">
        {t("common:status.success")}
      </Badge>
    )

    const actionButton = isTokenInventoryError ? (
      <Button
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => loadTokensForSite(siteId)}
        disabled={isCreating}
      >
        {t("common:actions.retry")}
      </Button>
    ) : isTokenInventoryLoaded && inventory.tokens.length === 0 ? (
      <Button
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => createDefaultTokenForSite(siteId)}
        loading={isCreating}
      >
        {isCreating
          ? t("common:status.creating")
          : t("ui:dialog.kiloCode.actions.createDefaultToken")}
      </Button>
    ) : isTokenInventoryLoaded && inventory.tokens.length > 0 ? (
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => loadTokensForSite(siteId)}
        disabled={isCreating}
      >
        {t("common:actions.refresh")}
      </Button>
    ) : null

    return (
      <Card key={siteId} padding="sm" className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className="dark:text-dark-text-primary truncate text-sm font-medium text-gray-900"
              title={siteName}
            >
              {siteName}
            </div>
            <div
              className="dark:text-dark-text-tertiary truncate text-xs text-gray-500"
              title={site.baseUrl}
            >
              {site.baseUrl}
            </div>
            {statusBadge}
            {isTokenInventoryLoaded && inventory.tokens.length > 0 && (
              <Badge
                variant="secondary"
                size="sm"
                title={t("ui:dialog.kiloCode.labels.selectedTokens")}
              >
                {selectedTokenIds.length}/{inventory.tokens.length}
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">{actionButton}</div>
        </div>

        {isTokenInventoryError && (
          <div className="text-sm text-red-700 dark:text-red-300">
            {inventory.errorMessage ||
              t("ui:dialog.kiloCode.messages.loadTokensFailed")}
          </div>
        )}

        {(isTokenInventoryIdle || isLoadingTokens) && (
          <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
            {t("ui:dialog.kiloCode.messages.loadingTokens")}
          </div>
        )}

        {isTokenInventoryLoaded && inventory.tokens.length === 0 && (
          <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
            {t("ui:dialog.kiloCode.messages.noTokensDescription")}
          </div>
        )}

        {isTokenInventoryLoaded && inventory.tokens.length > 0 && (
          <div className="space-y-3">
            <FormField label={t("common:labels.apiKey")}>
              <CompactMultiSelect
                options={tokenOptions}
                selected={selectedTokenIds}
                onChange={(values) => {
                  setSelectedTokenIdsBySite((prev) => ({
                    ...prev,
                    [siteId]: values,
                  }))
                }}
                size="default"
                placeholder={t("ui:dialog.kiloCode.placeholders.selectTokens")}
                clearable
              />
            </FormField>

            {selectedTokenIds.length > 0 && (
              <FormField
                label={t("ui:dialog.kiloCode.labels.modelId")}
                description={t("ui:dialog.kiloCode.descriptions.modelId")}
              >
                <div className="space-y-2">
                  {inventory.tokens
                    .filter((token) => selectedTokenIds.includes(`${token.id}`))
                    .map((token) => {
                      const tokenSelectionKey = getTokenSelectionKey(
                        siteId,
                        token.id,
                      )
                      const modelInventory =
                        getModelInventory(tokenSelectionKey)
                      const selectedModelId =
                        selectedModelIdByToken[tokenSelectionKey] ?? ""
                      const isModelInventoryIdle =
                        modelInventory.status ===
                        KILO_CODE_INVENTORY_STATUSES.Idle
                      const isModelInventoryLoading =
                        modelInventory.status ===
                        KILO_CODE_INVENTORY_STATUSES.Loading
                      const isModelInventoryLoaded =
                        modelInventory.status ===
                        KILO_CODE_INVENTORY_STATUSES.Loaded
                      const isModelInventoryError =
                        modelInventory.status ===
                        KILO_CODE_INVENTORY_STATUSES.Error

                      const modelOptions = Array.from(
                        new Set(
                          modelInventory.modelIds
                            .map((id) =>
                              typeof id === "string" ? id.trim() : "",
                            )
                            .filter(Boolean),
                        ),
                      )
                        .sort((a, b) => a.localeCompare(b))
                        .map((id) => ({ value: id, label: id }))

                      const statusBadge = isModelInventoryError ? (
                        <Badge variant="danger" size="sm">
                          {t("common:status.error")}
                        </Badge>
                      ) : isModelInventoryLoading || isModelInventoryIdle ? (
                        <Badge variant="info" size="sm">
                          {t("common:status.loading")}
                        </Badge>
                      ) : modelInventory.modelIds.length === 0 ? (
                        <Badge variant="warning" size="sm">
                          {t("ui:dialog.kiloCode.messages.noModelsTitle")}
                        </Badge>
                      ) : (
                        <Badge variant="success" size="sm">
                          {t("common:status.success")}
                        </Badge>
                      )

                      return (
                        <div key={tokenSelectionKey} className="space-y-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <div
                                className="dark:text-dark-text-primary truncate text-sm font-medium text-gray-900"
                                title={getTokenLabel(
                                  token,
                                  t("common:labels.token"),
                                )}
                              >
                                {getTokenLabel(token, t("common:labels.token"))}
                              </div>
                              {statusBadge}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {isModelInventoryError && (
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="secondary"
                                  onClick={() =>
                                    loadModelsForToken(siteId, token)
                                  }
                                >
                                  {t("common:actions.retry")}
                                </Button>
                              )}
                              <div className="w-full min-w-[220px] sm:w-[280px]">
                                <SearchableSelect
                                  value={selectedModelId}
                                  onChange={(value) => {
                                    setSelectedModelIdByToken((prev) => ({
                                      ...prev,
                                      [tokenSelectionKey]: value,
                                    }))
                                  }}
                                  placeholder={
                                    isModelInventoryLoading ||
                                    isModelInventoryIdle
                                      ? t("common:status.loading")
                                      : t(
                                          "ui:dialog.kiloCode.placeholders.modelId",
                                        )
                                  }
                                  options={modelOptions}
                                  allowCustomValue
                                />
                              </div>
                            </div>
                          </div>

                          {isModelInventoryError && (
                            <div className="text-sm text-red-700 dark:text-red-300">
                              {modelInventory.errorMessage ||
                                t(
                                  "ui:dialog.kiloCode.messages.loadModelsFailed",
                                )}
                            </div>
                          )}

                          {isModelInventoryLoaded &&
                            modelInventory.modelIds.length === 0 && (
                              <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
                                {t(
                                  "ui:dialog.kiloCode.messages.noModelsDescription",
                                )}
                              </div>
                            )}
                        </div>
                      )
                    })}
                </div>
              </FormField>
            )}
          </div>
        )}
      </Card>
    )
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="lg"
        header={
          <div className="pr-8">
            <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
              {t("ui:dialog.kiloCode.title")}
            </div>
            <p className="dark:text-dark-text-secondary text-sm text-gray-500">
              {t("ui:dialog.kiloCode.description")}
            </p>
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selectedSiteIds.length > 0 && (
              <div className="dark:text-dark-text-tertiary mr-auto text-xs text-gray-500">
                {selectionSummary}
              </div>
            )}
            <Button variant="ghost" type="button" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCopyApiConfigs}
              disabled={!canExport}
            >
              {copyActionLabel}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadSettings}
              disabled={!canExport}
            >
              {downloadActionLabel}
            </Button>
          </div>
        }
      >
        <Alert
          variant="info"
          title={t("ui:dialog.kiloCode.help.perSiteTitle")}
          description={t("ui:dialog.kiloCode.help.perSiteDescription")}
        />

        <FormField
          label={t("ui:dialog.kiloCode.labels.selectedSites")}
          description={selectionSummary}
        >
          <CompactMultiSelect
            options={siteOptions}
            selected={selectedSiteIds}
            onChange={setSelectedSiteIds}
            size="default"
            placeholder={t("ui:dialog.kiloCode.placeholders.selectSites")}
            clearable
          />
        </FormField>

        {selectedSites.length > 0 && (
          <div className="space-y-3">
            {selectedSites.map((site) => renderSiteCard(site))}
          </div>
        )}

        <FormField
          label={t("ui:dialog.kiloCode.labels.exportTarget")}
          htmlFor="kilo-code-account-export-target"
        >
          <Select
            value={exportTarget}
            onValueChange={(value) => {
              const target = KILO_CODE_EXPORT_TARGET_OPTIONS.find(
                (candidate) => candidate === value,
              )
              if (target) setExportTarget(target)
            }}
          >
            <SelectTrigger id="kilo-code-account-export-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KILO_CODE_EXPORT_TARGETS.KiloV7}>
                {t("ui:dialog.kiloCode.targets.kiloV7")}
              </SelectItem>
              <SelectItem value={KILO_CODE_EXPORT_TARGETS.Legacy}>
                {t("ui:dialog.kiloCode.targets.legacy")}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {!isKiloV7Export && (
          <FormField
            label={t("ui:dialog.kiloCode.labels.currentApiConfigName")}
            description={t(
              "ui:dialog.kiloCode.descriptions.currentApiConfigName",
              {
                filename: legacyFilename,
              },
            )}
          >
            <Select
              value={effectiveCurrentApiConfigName}
              onValueChange={setCurrentApiConfigName}
              disabled={!hasExportableProfiles}
            >
              <SelectTrigger className="min-w-[240px]">
                <SelectValue
                  placeholder={t(
                    "ui:dialog.kiloCode.placeholders.currentApiConfigName",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {profileNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        {hasExportableProfiles && missingModelIdCount > 0 && (
          <Alert
            variant="warning"
            title={t("ui:dialog.kiloCode.messages.modelIdRequiredTitle")}
            description={t(
              "ui:dialog.kiloCode.messages.modelIdRequiredDescription",
              {
                count: missingModelIdCount,
              },
            )}
          />
        )}

        {!hasExportableProfiles && (
          <Alert
            variant="info"
            title={t("ui:dialog.kiloCode.messages.nothingToExportTitle")}
            description={t(
              "ui:dialog.kiloCode.messages.nothingToExportDescription",
            )}
          />
        )}

        <KiloCodeExportGuidance target={exportTarget} />

        <Alert
          variant="warning"
          title={t("ui:dialog.kiloCode.warning.title")}
          description={t("ui:dialog.kiloCode.warning.description")}
        />
      </Modal>
      {defaultTokenQuickCreateSite && defaultTokenQuickCreatePrefill ? (
        <AddTokenDialog
          isOpen={true}
          onClose={handleCloseDefaultTokenCreateDialog}
          availableAccounts={[defaultTokenQuickCreateSite]}
          preSelectedAccountId={defaultTokenQuickCreateSite.id}
          createPrefill={defaultTokenQuickCreatePrefill}
          prefillNotice={t(
            "messages:tokenProvisioning.createRequiresGroupSelection",
          )}
          onSuccess={handleDefaultTokenCreateSuccess}
        />
      ) : null}
    </>
  )
}
