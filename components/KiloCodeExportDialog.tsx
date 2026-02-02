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
import { useAccountData } from "~/hooks/useAccountData"
import { ensureAccountApiToken } from "~/services/accountOperations"
import { getApiService } from "~/services/apiService"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import {
  buildKiloCodeApiConfigs,
  buildKiloCodeSettingsFile,
  type KiloCodeExportTuple,
} from "~/services/kiloCodeExport"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { stripTrailingOpenAIV1 } from "~/utils/url"

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

type TokenLoadStatus = "idle" | "loading" | "loaded" | "error"

interface TokenInventoryState {
  status: TokenLoadStatus
  tokens: ApiToken[]
  errorMessage?: string
}

type ModelLoadStatus = "idle" | "loading" | "loaded" | "error"

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
 * Build arguments for `fetchAccountTokens` from display-layer account data.
 */
function buildFetchTokenArgs(site: DisplaySiteData) {
  return {
    baseUrl: site.baseUrl,
    accountId: site.id,
    auth: {
      authType: site.authType,
      userId: site.userId,
      accessToken: site.token,
      cookie: site.cookieAuthSessionCookie,
    },
  }
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
  const { t } = useTranslation(["ui", "common"])
  const { accounts, displayData } = useAccountData()

  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [selectedTokenIdsBySite, setSelectedTokenIdsBySite] = useState<
    Record<string, string[]>
  >({})
  const [currentApiConfigName, setCurrentApiConfigName] = useState("")

  const [tokenInventories, setTokenInventories] = useState<
    Record<string, TokenInventoryState>
  >({})
  const [isCreatingToken, setIsCreatingToken] = useState<
    Record<string, boolean>
  >({})

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
    setTokenInventories({})
    setIsCreatingToken({})
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
      return tokenInventories[siteId] ?? { status: "idle", tokens: [] }
    },
    [tokenInventories],
  )

  const getModelInventory = useCallback(
    (tokenSelectionKey: string): ModelInventoryState => {
      return (
        modelInventories[tokenSelectionKey] ?? { status: "idle", modelIds: [] }
      )
    },
    [modelInventories],
  )

  const loadTokensForSite = useCallback(
    async (siteId: string) => {
      const site = displayById.get(siteId)
      if (!site) return

      setTokenInventories((prev) => ({
        ...prev,
        [siteId]: {
          status: "loading",
          tokens: prev[siteId]?.tokens ?? [],
          errorMessage: undefined,
        },
      }))

      try {
        const service = getApiService(site.siteType)
        const tokens = await service.fetchAccountTokens(
          buildFetchTokenArgs(site),
        )
        if (!Array.isArray(tokens)) {
          setTokenInventories((prev) => ({
            ...prev,
            [siteId]: {
              status: "error",
              tokens: [],
              errorMessage: t("ui:dialog.kiloCode.messages.loadTokensFailed"),
            },
          }))
          return
        }

        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: { status: "loaded", tokens, errorMessage: undefined },
        }))

        // UX: default-select the first token (common case is "one token per site"),
        // and keep previous selections if they still exist after refresh.
        setSelectedTokenIdsBySite((prev) => {
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
            status: "error",
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
      if (existingStatus === "loaded") return

      modelLoadsInFlightRef.current.add(tokenSelectionKey)

      setModelInventories((prev) => ({
        ...prev,
        [tokenSelectionKey]: {
          status: "loading",
          modelIds: prev[tokenSelectionKey]?.modelIds ?? [],
          errorMessage: undefined,
        },
      }))

      try {
        const modelIds = await fetchOpenAICompatibleModelIds({
          baseUrl: stripTrailingOpenAIV1(site.baseUrl),
          apiKey: token.key,
        })

        const normalized = modelIds
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)

        if (!isDialogActiveRef.current) return

        setModelInventories((prev) => ({
          ...prev,
          [tokenSelectionKey]: {
            status: "loaded",
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
            status: "error",
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

    const toastId = `kilocode-create-token-${siteId}`

    setIsCreatingToken((prev) => ({ ...prev, [siteId]: true }))
    setTokenInventories((prev) => ({
      ...prev,
      [siteId]: { status: "loading", tokens: prev[siteId]?.tokens ?? [] },
    }))

    try {
      const ensuredToken = await ensureAccountApiToken(account, site, toastId)
      toast.success(t("ui:dialog.kiloCode.messages.tokenCreated"), {
        id: toastId,
      })

      await loadTokensForSite(siteId)

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
          status: "error",
          tokens: prev[siteId]?.tokens ?? [],
          errorMessage: t("ui:dialog.kiloCode.messages.createTokenFailed"),
        },
      }))
    } finally {
      setIsCreatingToken((prev) => ({ ...prev, [siteId]: false }))
    }
  }

  const siteOptions: CompactMultiSelectOption[] = useMemo(() => {
    return displayData
      .map((site) => ({
        value: site.id,
        label: site.name || site.baseUrl,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [displayData])

  const selectedSites = useMemo(() => {
    return selectedSiteIds
      .map((id) => displayById.get(id))
      .filter((site): site is DisplaySiteData => Boolean(site))
      .sort((a, b) => (a.name || a.baseUrl).localeCompare(b.name || b.baseUrl))
  }, [displayById, selectedSiteIds])

  useEffect(() => {
    if (!isOpen) return
    if (selectedSiteIds.length === 0) return

    for (const siteId of selectedSiteIds) {
      const status = tokenInventories[siteId]?.status ?? "idle"
      if (status === "idle") {
        void loadTokensForSite(siteId)
      }
    }
  }, [isOpen, loadTokensForSite, selectedSiteIds, tokenInventories])

  useEffect(() => {
    if (!isOpen) return
    if (selectedSiteIds.length === 0) return

    for (const siteId of selectedSiteIds) {
      const inventory = tokenInventories[siteId]
      if (!inventory || inventory.status !== "loaded") continue

      const tokenIds = selectedTokenIdsBySite[siteId] ?? []
      for (const tokenId of tokenIds) {
        const token = inventory.tokens.find(
          (candidate) => `${candidate.id}` === tokenId,
        )
        if (!token) continue

        const tokenSelectionKey = getTokenSelectionKey(siteId, token.id)
        const modelStatus =
          modelInventories[tokenSelectionKey]?.status ?? "idle"
        if (modelStatus === "idle") {
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

  const { apiConfigs, profileNames } = useMemo(() => {
    return buildKiloCodeApiConfigs({
      selections: exportSelections,
    })
  }, [exportSelections])

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
  const filename = "kilo-code-settings.json"
  const selectionSummary = t("ui:dialog.kiloCode.descriptions.selectedSites", {
    sites: selectedSiteIds.length,
    keys: exportSelections.length,
  })

  const handleCopyApiConfigs = async () => {
    if (typeof navigator === "undefined") return
    if (!canExport) return

    try {
      await navigator.clipboard.writeText(JSON.stringify(apiConfigs, null, 2))
      toast.success(t("ui:dialog.kiloCode.messages.copiedApiConfigs"))
    } catch {
      toast.error(t("ui:dialog.kiloCode.messages.copyFailed"))
    }
  }

  const handleDownloadSettings = async () => {
    if (!canExport) return
    if (!effectiveCurrentApiConfigName) return

    const payload = buildKiloCodeSettingsFile({
      currentApiConfigName: effectiveCurrentApiConfigName,
      apiConfigs,
    })

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("ui:dialog.kiloCode.messages.downloadedSettings"))
  }

  const renderSiteCard = (site: DisplaySiteData) => {
    const siteId = site.id
    const siteName = getSiteDisplayName(site)
    const inventory = getTokenInventory(siteId)
    const isLoadingTokens = inventory.status === "loading"
    const isCreating = Boolean(isCreatingToken[siteId])

    const selectedTokenIds = selectedTokenIdsBySite[siteId] ?? []
    const tokenOptions: CompactMultiSelectOption[] = inventory.tokens.map(
      (token) => ({
      value: `${token.id}`,
      label: getTokenLabel(token, t("common:labels.token")),
      }),
    )

    const statusBadge =
      inventory.status === "error" ? (
        <Badge variant="danger" size="sm">
          {t("common:status.error")}
        </Badge>
      ) : inventory.status === "loading" || inventory.status === "idle" ? (
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

    const actionButton =
      inventory.status === "error" ? (
        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => loadTokensForSite(siteId)}
          disabled={isLoadingTokens || isCreating}
          loading={isLoadingTokens}
        >
          {t("common:actions.retry")}
        </Button>
      ) : inventory.status === "loaded" && inventory.tokens.length === 0 ? (
        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => createDefaultTokenForSite(siteId)}
          disabled={isCreating}
          loading={isCreating}
        >
          {isCreating
            ? t("common:status.creating")
            : t("ui:dialog.kiloCode.actions.createDefaultToken")}
        </Button>
      ) : inventory.status === "loaded" && inventory.tokens.length > 0 ? (
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => loadTokensForSite(siteId)}
          disabled={isLoadingTokens || isCreating}
          loading={isLoadingTokens}
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
            {inventory.status === "loaded" && inventory.tokens.length > 0 && (
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

        {inventory.status === "error" && (
          <div className="text-sm text-red-700 dark:text-red-300">
            {inventory.errorMessage ||
              t("ui:dialog.kiloCode.messages.loadTokensFailed")}
          </div>
        )}

        {(inventory.status === "idle" || inventory.status === "loading") && (
          <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
            {t("ui:dialog.kiloCode.messages.loadingTokens")}
          </div>
        )}

        {inventory.status === "loaded" && inventory.tokens.length === 0 && (
          <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
            {t("ui:dialog.kiloCode.messages.noTokensDescription")}
          </div>
        )}

        {inventory.status === "loaded" && inventory.tokens.length > 0 && (
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

                      const statusBadge =
                        modelInventory.status === "error" ? (
                          <Badge variant="danger" size="sm">
                            {t("common:status.error")}
                          </Badge>
                        ) : modelInventory.status === "loading" ||
                          modelInventory.status === "idle" ? (
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
                              {modelInventory.status === "error" && (
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
                                    modelInventory.status === "loading" ||
                                    modelInventory.status === "idle"
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

                          {modelInventory.status === "error" && (
                            <div className="text-sm text-red-700 dark:text-red-300">
                              {modelInventory.errorMessage ||
                                t(
                                  "ui:dialog.kiloCode.messages.loadModelsFailed",
                                )}
                            </div>
                          )}

                          {modelInventory.status === "loaded" &&
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
            {t("ui:dialog.kiloCode.actions.copyApiConfigs")}
          </Button>
          <Button
            type="button"
            onClick={handleDownloadSettings}
            disabled={!canExport}
          >
            {t("ui:dialog.kiloCode.actions.downloadSettings")}
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
        label={t("ui:dialog.kiloCode.labels.currentApiConfigName")}
        description={t("ui:dialog.kiloCode.descriptions.currentApiConfigName", {
          filename,
        })}
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

      <Alert
        variant="warning"
        title={t("ui:dialog.kiloCode.warning.title")}
        description={t("ui:dialog.kiloCode.warning.description")}
      />

      <Alert
        variant="info"
        title={t("ui:dialog.kiloCode.help.afterExportTitle")}
        description={t("ui:dialog.kiloCode.help.afterExportDescription")}
      >
        <div className="space-y-2 text-sm">
          <div className="space-y-1">
            <div className="font-medium">
              {t("ui:dialog.kiloCode.help.manualTitle")}
            </div>
            <div className="dark:text-dark-text-secondary text-gray-600">
              {t("ui:dialog.kiloCode.help.manualDescription")}
            </div>
          </div>
          <div className="space-y-1">
            <div className="font-medium">
              {t("ui:dialog.kiloCode.help.importTitle")}
            </div>
            <div className="dark:text-dark-text-secondary text-gray-600">
              {t("ui:dialog.kiloCode.help.importDescription", { filename })}
            </div>
          </div>
        </div>
      </Alert>
    </Modal>
  )
}
