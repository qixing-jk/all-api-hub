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
import {
  getKiloCodeApiConfigProfileNames,
  KILO_CODE_EXPORT_FILENAMES,
  KILO_CODE_EXPORT_TARGET_OPTIONS,
  KILO_CODE_EXPORT_TARGETS,
  KILO_CODE_PROVIDER_PROTOCOLS,
  type KiloCodeExportTarget,
} from "~/services/integrations/kiloCodeExport"
import { getKiloCodeExportAnalyticsTarget } from "~/services/integrations/kiloCodeExportAnalytics"
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

import {
  resolveKiloCodeAccountExportOutput,
  type KiloCodeAccountExportSelection,
  type KiloCodeAccountSecretSource,
} from "./kiloCodeAccountExport"
import { KiloCodeDefaultModelSelect } from "./KiloCodeDefaultModelSelect"
import { KiloCodeExportGuidance } from "./KiloCodeExportGuidance"
import { KILO_CODE_EXPORT_TEST_IDS } from "./kiloCodeExportTestIds"
import { pickNewestKiloCodeToken } from "./kiloCodeTokenSelection"
import {
  KILO_CODE_ACCOUNT_MODEL_STATUSES,
  useKiloCodeAccountModelDiscovery,
} from "./useKiloCodeAccountModelDiscovery"

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

const KILO_CODE_PROTOCOL_OPTIONS = [
  {
    value: KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible,
    label: "ui:dialog.kiloCode.protocols.openAICompatible",
  },
  {
    value: KILO_CODE_PROVIDER_PROTOCOLS.OpenAIResponses,
    label: "ui:dialog.kiloCode.protocols.openAIResponses",
  },
  {
    value: KILO_CODE_PROVIDER_PROTOCOLS.AnthropicMessages,
    label: "ui:dialog.kiloCode.protocols.anthropicMessages",
  },
] as const

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

/** Compare resolver inputs by identity without serializing credential fields. */
function haveMatchingSecretSourceIdentities(
  previous: ReadonlyMap<string, KiloCodeAccountSecretSource>,
  current: ReadonlyMap<string, KiloCodeAccountSecretSource>,
) {
  if (previous.size !== current.size) return false

  for (const [selectionId, previousSource] of previous) {
    const currentSource = current.get(selectionId)
    if (
      !currentSource ||
      currentSource.site !== previousSource.site ||
      currentSource.token !== previousSource.token
    ) {
      return false
    }
  }

  return true
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

  const [isDownloadTooLarge, setIsDownloadTooLarge] = useState(false)
  const initialSelectionAppliedRef = useRef(false)
  const pendingRetrySelectionIdRef = useRef<string | undefined>(undefined)
  const pendingRemoveSelectionIdRef = useRef<string | undefined>(undefined)
  const retryButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const protocolSelectorRefs = useRef(new Map<string, HTMLButtonElement>())
  const modelSelectorRefs = useRef(new Map<string, HTMLButtonElement>())
  const actionGenerationRef = useRef(0)
  const actionContextRef = useRef({
    isOpen,
    exportTarget,
    exportActionSignature: "",
  })

  useEffect(() => {
    if (isOpen) return
    actionGenerationRef.current += 1
    setSelectedSiteIds([])
    setSelectedTokenIdsBySite({})
    setCurrentApiConfigName("")
    setExportTarget(KILO_CODE_EXPORT_TARGETS.KiloV7)
    setTokenInventories({})
    setIsCreatingToken({})
    setDefaultTokenCreateContext(null)
    setIsDownloadTooLarge(false)
    pendingRetrySelectionIdRef.current = undefined
    pendingRemoveSelectionIdRef.current = undefined
    retryButtonRefs.current.clear()
    protocolSelectorRefs.current.clear()
    modelSelectorRefs.current.clear()
    initialSelectionAppliedRef.current = false
  }, [isOpen])

  const invalidateAndClose = useCallback(() => {
    actionGenerationRef.current += 1
    onClose()
  }, [onClose])

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

  const accountExportSelections = useMemo<
    KiloCodeAccountExportSelection[]
  >(() => {
    const selections: KiloCodeAccountExportSelection[] = []

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

        const selectionId = getTokenSelectionKey(siteId, token.id)
        const tokenName = getTokenLabel(token, t("common:labels.token"))
        const siteName = getSiteDisplayName(site)

        selections.push({
          selectionId,
          site,
          token,
          providerName: `${siteName} - ${tokenName}`,
          runtimeKey: {
            accountId: siteId,
            siteName,
            baseUrl: site.baseUrl,
            tokenId: token.id,
            tokenName,
            tokenKey: token.key,
          },
        })
      }
    }

    return selections
  }, [
    displayById,
    getTokenInventory,
    selectedSiteIds,
    selectedTokenIdsBySite,
    t,
  ])

  const {
    getModelInventory,
    invalidSelection,
    legacySelections,
    loadModels,
    preparedCatalog,
    removeV7ManualModel,
    selectLegacyModel,
    selectV7DefaultModel,
    selectV7DefaultProvider,
    selectV7ManualModel,
    selectV7Protocol,
    v7DefaultModel,
    v7Selections,
  } = useKiloCodeAccountModelDiscovery({
    isOpen,
    selections: accountExportSelections,
  })

  const v7SelectionById = useMemo(
    () =>
      new Map(
        v7Selections.map((selection) => [selection.selectionId, selection]),
      ),
    [v7Selections],
  )
  const legacySelectionById = useMemo(
    () =>
      new Map(
        legacySelections.map((selection) => [selection.selectionId, selection]),
      ),
    [legacySelections],
  )
  const secretSourcesBySelectionId = useMemo(
    () =>
      new Map(
        accountExportSelections.map((selection) => [
          selection.selectionId,
          { site: selection.site, token: selection.token },
        ]),
      ),
    [accountExportSelections],
  )
  const previousSecretSourcesBySelectionIdRef = useRef(
    secretSourcesBySelectionId,
  )

  useEffect(() => {
    const previous = previousSecretSourcesBySelectionIdRef.current
    previousSecretSourcesBySelectionIdRef.current = secretSourcesBySelectionId
    if (
      !haveMatchingSecretSourceIdentities(previous, secretSourcesBySelectionId)
    ) {
      actionGenerationRef.current += 1
    }
  }, [secretSourcesBySelectionId])
  const profileNames = useMemo(
    () => getKiloCodeApiConfigProfileNames({ selections: legacySelections }),
    [legacySelections],
  )

  useEffect(() => {
    if (profileNames.length === 0) {
      setCurrentApiConfigName("")
      return
    }
    if (!currentApiConfigName || !profileNames.includes(currentApiConfigName)) {
      setCurrentApiConfigName(profileNames[0])
    }
  }, [currentApiConfigName, profileNames])

  const effectiveCurrentApiConfigName =
    currentApiConfigName || profileNames[0] || ""
  const isKiloV7Export = exportTarget === KILO_CODE_EXPORT_TARGETS.KiloV7
  const exportActionSignature = useMemo(
    () =>
      JSON.stringify(
        isKiloV7Export
          ? {
              defaultModel: v7DefaultModel,
              selections: v7Selections.map((selection) => ({
                selectionId: selection.selectionId,
                accountId: selection.accountId,
                siteName: selection.siteName,
                baseUrl: selection.baseUrl,
                tokenId: selection.tokenId,
                tokenName: selection.tokenName,
                providerName: selection.providerName ?? "",
                protocol: selection.protocol,
                discoveredModelIds: selection.discoveredModelIds,
                manualModelId: selection.manualModelId ?? "",
              })),
            }
          : {
              currentLegacyProfileName: effectiveCurrentApiConfigName,
              selections: legacySelections.map((selection) => ({
                selectionId: selection.selectionId,
                accountId: selection.accountId,
                siteName: selection.siteName,
                baseUrl: selection.baseUrl,
                tokenId: selection.tokenId,
                tokenName: selection.tokenName,
                legacyModelId: selection.legacyModelId ?? "",
              })),
            },
      ),
    [
      effectiveCurrentApiConfigName,
      isKiloV7Export,
      legacySelections,
      v7DefaultModel,
      v7Selections,
    ],
  )

  actionContextRef.current = {
    isOpen,
    exportTarget,
    exportActionSignature,
  }

  const isCurrentExportAction = useCallback(
    (generation: number, signature: typeof actionContextRef.current) =>
      generation === actionGenerationRef.current &&
      actionContextRef.current.isOpen &&
      actionContextRef.current.exportTarget === signature.exportTarget &&
      actionContextRef.current.exportActionSignature ===
        signature.exportActionSignature,
    [],
  )

  useEffect(() => {
    setIsDownloadTooLarge(false)
    actionGenerationRef.current += 1
  }, [exportActionSignature])
  const missingModelIdCount = isKiloV7Export
    ? v7Selections.filter(
        (selection) =>
          !selection.discoveredModelIds.length &&
          !selection.manualModelId?.trim(),
      ).length
    : legacySelections.filter((selection) => !selection.legacyModelId?.trim())
        .length
  const hasExportableProfiles =
    accountExportSelections.length > 0 &&
    v7Selections.length === accountExportSelections.length &&
    legacySelections.length === accountExportSelections.length
  const canExportV7 = Boolean(
    hasExportableProfiles &&
      !invalidSelection &&
      preparedCatalog?.providers.length === v7Selections.length &&
      v7DefaultModel,
  )
  const canExportLegacy = Boolean(
    hasExportableProfiles &&
      !invalidSelection &&
      effectiveCurrentApiConfigName &&
      legacySelections.every((selection) => selection.legacyModelId?.trim()),
  )
  const canExport = isKiloV7Export ? canExportV7 : canExportLegacy
  const legacyFilename = KILO_CODE_EXPORT_FILENAMES.Legacy
  const selectionSummary = t("ui:dialog.kiloCode.descriptions.selectedSites", {
    sites: selectedSiteIds.length,
    keys: accountExportSelections.length,
  })
  const exportInsights = {
    itemCount: accountExportSelections.length,
    modelCount: isKiloV7Export
      ? preparedCatalog?.modelCount ?? 0
      : legacySelections.filter((selection) => selection.legacyModelId?.trim())
          .length,
    selectedCount: selectedSiteIds.length,
    kiloCodeExportTarget: getKiloCodeExportAnalyticsTarget(exportTarget),
  }
  const defaultProviderOptions =
    preparedCatalog?.providers.map((provider) => ({
      value: provider.selectionId,
      label: provider.providerName,
    })) ?? []
  const selectedDefaultProvider = preparedCatalog?.providers.find(
    (provider) => provider.selectionId === v7DefaultModel?.selectionId,
  )
  const copyActionLabel = isKiloV7Export
    ? t("ui:dialog.kiloCode.actions.copyKiloV7Provider")
    : t("ui:dialog.kiloCode.actions.copyLegacyApiConfigs")
  const downloadActionLabel = isKiloV7Export
    ? t("ui:dialog.kiloCode.actions.downloadKiloV7Settings")
    : t("ui:dialog.kiloCode.actions.downloadLegacySettings")
  const modelStatusSignature = accountExportSelections
    .map(
      (selection) =>
        `${selection.selectionId}:${getModelInventory(selection.selectionId).status}`,
    )
    .join("|")

  useEffect(() => {
    const selectionId = pendingRetrySelectionIdRef.current
    if (!selectionId) return
    const status = getModelInventory(selectionId).status
    if (status === KILO_CODE_ACCOUNT_MODEL_STATUSES.Loading) return

    pendingRetrySelectionIdRef.current = undefined
    if (status === KILO_CODE_ACCOUNT_MODEL_STATUSES.Error) {
      retryButtonRefs.current.get(selectionId)?.focus()
      return
    }
    if (isKiloV7Export) {
      protocolSelectorRefs.current.get(selectionId)?.focus()
      return
    }
    modelSelectorRefs.current.get(selectionId)?.focus()
  }, [getModelInventory, isKiloV7Export, modelStatusSignature])

  useEffect(() => {
    const selectionId = pendingRemoveSelectionIdRef.current
    if (!selectionId || v7SelectionById.get(selectionId)?.manualModelId?.trim())
      return
    pendingRemoveSelectionIdRef.current = undefined
    const recoverySelector = modelSelectorRefs.current.get(selectionId)
    if (recoverySelector) {
      recoverySelector.focus()
      return
    }
    protocolSelectorRefs.current.get(selectionId)?.focus()
  }, [v7SelectionById])

  const buildCurrentExportOutput = useCallback(() => {
    if (isKiloV7Export) {
      if (!v7DefaultModel) {
        throw new Error("A valid V7 default model is required")
      }
      return resolveKiloCodeAccountExportOutput({
        target: KILO_CODE_EXPORT_TARGETS.KiloV7,
        selections: v7Selections,
        secretSourcesBySelectionId,
        defaultModel: v7DefaultModel,
        resolveToken: resolveExportTokenForSecret,
      })
    }

    return resolveKiloCodeAccountExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: legacySelections,
      secretSourcesBySelectionId,
      currentLegacyProfileName: effectiveCurrentApiConfigName,
      resolveToken: resolveExportTokenForSecret,
    })
  }, [
    effectiveCurrentApiConfigName,
    isKiloV7Export,
    legacySelections,
    secretSourcesBySelectionId,
    v7DefaultModel,
    v7Selections,
  ])

  const handleRetryModels = (selectionId: string) => {
    pendingRetrySelectionIdRef.current = selectionId
    setIsDownloadTooLarge(false)
    void loadModels(selectionId)
  }

  const handleRemoveManualModel = (selectionId: string) => {
    pendingRemoveSelectionIdRef.current = selectionId
    removeV7ManualModel(selectionId)
    setIsDownloadTooLarge(false)
  }

  const handleCopyApiConfigs = async () => {
    if (!canExport) return

    const generation = ++actionGenerationRef.current
    const signature = actionContextRef.current

    const tracker = startProductAnalyticsAction({
      ...kiloCodeAccountExportAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyKiloCodeAccountExportConfig,
    })

    let actionInsights = exportInsights
    try {
      if (typeof navigator === "undefined") {
        throw new Error(t("ui:dialog.kiloCode.messages.copyFailed"))
      }

      const output = await buildCurrentExportOutput()
      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      actionInsights = {
        ...exportInsights,
        itemCount: output.itemCount,
        modelCount: output.modelCount,
      }
      await navigator.clipboard.writeText(
        JSON.stringify(output.copyPayload, null, 2),
      )
      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      toast.success(t("ui:dialog.kiloCode.messages.copiedExportConfig"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: actionInsights,
      })
    } catch (error) {
      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      toast.error(
        getErrorMessage(error, t("ui:dialog.kiloCode.messages.copyFailed")),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: actionInsights,
      })
    }
  }

  const handleDownloadSettings = async () => {
    if (!canExport) return

    const generation = ++actionGenerationRef.current
    const signature = actionContextRef.current

    const tracker = startProductAnalyticsAction({
      ...kiloCodeAccountExportAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportKiloCodeAccountSettingsFile,
    })

    let url: string | null = null
    let link: HTMLAnchorElement | null = null
    let actionInsights = exportInsights
    setIsDownloadTooLarge(false)

    try {
      const output = await buildCurrentExportOutput()
      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      actionInsights = {
        ...exportInsights,
        itemCount: output.itemCount,
        modelCount: output.modelCount,
      }

      if (output.isDownloadTooLarge) {
        if (!isCurrentExportAction(generation, signature)) {
          return
        }
        setIsDownloadTooLarge(true)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: actionInsights,
        })
        return
      }

      const blob = new Blob([output.downloadJson], {
        type: "application/json",
      })
      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      url = URL.createObjectURL(blob)
      link = document.createElement("a")
      link.href = url
      link.download = output.filename
      document.body.appendChild(link)
      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      link.click()

      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      toast.success(t("ui:dialog.kiloCode.messages.downloadedSettings"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: actionInsights,
      })
    } catch (error) {
      if (!isCurrentExportAction(generation, signature)) {
        return
      }
      toast.error(
        getErrorMessage(error, t("ui:dialog.kiloCode.messages.downloadFailed")),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: actionInsights,
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
                label={
                  isKiloV7Export
                    ? undefined
                    : t("ui:dialog.kiloCode.labels.legacyModelId")
                }
                description={
                  isKiloV7Export
                    ? undefined
                    : t("ui:dialog.kiloCode.descriptions.modelId")
                }
              >
                <div className="space-y-2">
                  {inventory.tokens
                    .filter((token) => selectedTokenIds.includes(`${token.id}`))
                    .map((token) => {
                      const selectionId = getTokenSelectionKey(siteId, token.id)
                      const selection = accountExportSelections.find(
                        (candidate) => candidate.selectionId === selectionId,
                      )
                      if (!selection) return null

                      const modelInventory = getModelInventory(selectionId)
                      const isModelInventoryIdle =
                        modelInventory.status ===
                        KILO_CODE_ACCOUNT_MODEL_STATUSES.Idle
                      const isModelInventoryLoading =
                        modelInventory.status ===
                        KILO_CODE_ACCOUNT_MODEL_STATUSES.Loading
                      const isModelInventoryLoaded =
                        modelInventory.status ===
                        KILO_CODE_ACCOUNT_MODEL_STATUSES.Loaded
                      const isModelInventoryError =
                        modelInventory.status ===
                        KILO_CODE_ACCOUNT_MODEL_STATUSES.Error
                      const showRetry =
                        isModelInventoryError ||
                        (isModelInventoryLoaded &&
                          modelInventory.modelIds.length === 0)
                      const showV7ManualRecovery =
                        showRetry && modelInventory.modelIds.length === 0
                      const modelOptions = modelInventory.modelIds.map(
                        (id) => ({
                          value: id,
                          label: id,
                        }),
                      )
                      const manualModelId =
                        v7SelectionById.get(selectionId)?.manualModelId ?? ""
                      const selectedModelId = isKiloV7Export
                        ? manualModelId
                        : legacySelectionById.get(selectionId)?.legacyModelId ??
                          ""

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
                        <div
                          key={selectionId}
                          role="group"
                          aria-label={selection.providerName}
                          className="space-y-2"
                        >
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
                              {isModelInventoryLoaded && (
                                <Badge variant="secondary" size="sm">
                                  {modelInventory.modelIds.length}
                                </Badge>
                              )}
                            </div>
                            <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:items-center">
                              {showRetry && (
                                <Button
                                  ref={(element) => {
                                    if (element) {
                                      retryButtonRefs.current.set(
                                        selectionId,
                                        element,
                                      )
                                    } else {
                                      retryButtonRefs.current.delete(
                                        selectionId,
                                      )
                                    }
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleRetryModels(selectionId)}
                                >
                                  {t("ui:dialog.kiloCode.actions.retryModels")}
                                </Button>
                              )}
                              {isKiloV7Export && (
                                <FormField
                                  className="w-full min-w-0 sm:w-[220px]"
                                  label={t(
                                    "ui:dialog.kiloCode.labels.providerProtocol",
                                  )}
                                >
                                  <Select
                                    value={
                                      v7SelectionById.get(selectionId)
                                        ?.protocol ??
                                      KILO_CODE_PROVIDER_PROTOCOLS.OpenAICompatible
                                    }
                                    onValueChange={(value) => {
                                      const option =
                                        KILO_CODE_PROTOCOL_OPTIONS.find(
                                          (candidate) =>
                                            candidate.value === value,
                                        )
                                      if (!option) return
                                      selectV7Protocol(
                                        selectionId,
                                        option.value,
                                      )
                                      setIsDownloadTooLarge(false)
                                    }}
                                  >
                                    <SelectTrigger
                                      ref={(element) => {
                                        if (element) {
                                          protocolSelectorRefs.current.set(
                                            selectionId,
                                            element,
                                          )
                                        } else {
                                          protocolSelectorRefs.current.delete(
                                            selectionId,
                                          )
                                        }
                                      }}
                                      aria-label={`${selection.providerName} ${t(
                                        "ui:dialog.kiloCode.labels.providerProtocol",
                                      )}`}
                                    >
                                      <SelectValue
                                        placeholder={t(
                                          "ui:dialog.kiloCode.labels.providerProtocol",
                                        )}
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {KILO_CODE_PROTOCOL_OPTIONS.map(
                                        (option) => (
                                          <SelectItem
                                            key={option.value}
                                            value={option.value}
                                          >
                                            {t(option.label)}
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                </FormField>
                              )}
                              {(!isKiloV7Export || showV7ManualRecovery) && (
                                <FormField
                                  className="w-full min-w-0 sm:w-[280px]"
                                  label={
                                    isKiloV7Export
                                      ? t("ui:dialog.kiloCode.labels.modelId")
                                      : undefined
                                  }
                                >
                                  <SearchableSelect
                                    ref={(element) => {
                                      if (element) {
                                        modelSelectorRefs.current.set(
                                          selectionId,
                                          element,
                                        )
                                      } else {
                                        modelSelectorRefs.current.delete(
                                          selectionId,
                                        )
                                      }
                                    }}
                                    aria-label={`${selection.providerName} ${t(
                                      isKiloV7Export
                                        ? "ui:dialog.kiloCode.labels.modelId"
                                        : "ui:dialog.kiloCode.labels.legacyModelId",
                                    )}`}
                                    value={selectedModelId}
                                    onChange={(value) => {
                                      if (isKiloV7Export) {
                                        selectV7ManualModel(selectionId, value)
                                      } else {
                                        selectLegacyModel(selectionId, value)
                                      }
                                      setIsDownloadTooLarge(false)
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
                                </FormField>
                              )}
                            </div>
                          </div>

                          {isModelInventoryError && (
                            <div className="text-sm text-red-700 dark:text-red-300">
                              {t(
                                "ui:dialog.kiloCode.messages.loadModelsFailed",
                              )}
                            </div>
                          )}

                          {showV7ManualRecovery && isKiloV7Export && (
                            <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
                              {t(
                                "ui:dialog.kiloCode.messages.v7ProviderModelsRequired",
                              )}
                            </div>
                          )}

                          {isKiloV7Export && manualModelId.trim() && (
                            <div className="dark:border-dark-bg-tertiary flex min-w-0 items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm">
                              <span className="min-w-0 flex-1 break-all">
                                {manualModelId}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                data-testid={
                                  KILO_CODE_EXPORT_TEST_IDS.removeManualModel
                                }
                                onClick={() =>
                                  handleRemoveManualModel(selectionId)
                                }
                              >
                                {t(
                                  "ui:dialog.kiloCode.actions.removeManualModel",
                                )}
                              </Button>
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
        onClose={invalidateAndClose}
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
            <Button variant="ghost" type="button" onClick={invalidateAndClose}>
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
            aria-label={t("ui:dialog.kiloCode.labels.selectedSites")}
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
              if (target) {
                setExportTarget(target)
                setIsDownloadTooLarge(false)
              }
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

        {isKiloV7Export && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t("ui:dialog.kiloCode.labels.defaultProvider")}
              htmlFor="kilo-code-account-default-provider"
            >
              <SearchableSelect
                id="kilo-code-account-default-provider"
                aria-label={t("ui:dialog.kiloCode.labels.defaultProvider")}
                data-testid={KILO_CODE_EXPORT_TEST_IDS.defaultProvider}
                value={v7DefaultModel?.selectionId ?? ""}
                options={defaultProviderOptions}
                onChange={(selectionId) => {
                  selectV7DefaultProvider(selectionId)
                  setIsDownloadTooLarge(false)
                }}
                placeholder={t("ui:dialog.kiloCode.labels.defaultProvider")}
                disabled={!preparedCatalog}
              />
            </FormField>

            <FormField label={t("ui:dialog.kiloCode.labels.defaultModel")}>
              <KiloCodeDefaultModelSelect
                aria-label={t("ui:dialog.kiloCode.labels.defaultModel")}
                value={v7DefaultModel?.modelId ?? ""}
                modelIds={selectedDefaultProvider?.modelIds ?? []}
                onChange={(modelId) => {
                  selectV7DefaultModel(modelId)
                  setIsDownloadTooLarge(false)
                }}
                placeholder={t("ui:dialog.kiloCode.placeholders.modelId")}
                allowCustomValue
                disabled={!selectedDefaultProvider}
              />
            </FormField>
          </div>
        )}

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

        {invalidSelection && hasExportableProfiles && (
          <Alert
            variant="destructive"
            title={t("ui:dialog.kiloCode.messages.invalidProfile")}
          />
        )}

        {isDownloadTooLarge && (
          <Alert
            variant="warning"
            title={t("ui:dialog.kiloCode.warning.title")}
            description={t(
              "ui:dialog.kiloCode.messages.settingsFileTooLargeMultiple",
            )}
          />
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
