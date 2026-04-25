import { useCallback, useEffect, useMemo, useState } from "react"
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
  type CompactMultiSelectOption,
} from "~/components/ui"
import { useAccountData } from "~/hooks/useAccountData"
import { compareAccountDisplayNames } from "~/services/accounts/utils/accountDisplayName"
import {
  batchExportToCCH,
  exportToCCH,
  verifyCCHConnection,
} from "~/services/integrations/claudeCodeHubService"
import type { CCHExportResult, CCHExportSelection } from "~/types/claudeCodeHub"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"

interface CCHExportDialogProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Optional initial selection for opening the dialog from contextual entry points.
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

/**
 * Build a safe, human-readable token label for selection UI.
 */
function getTokenLabel(token: ApiToken, fallbackPrefix: string) {
  const trimmedName = (token.name ?? "").trim()
  if (trimmedName) return trimmedName
  return `${fallbackPrefix} #${token.id}`
}

/**
 * Build a compact label for displaying a site in dense UI.
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
 * Modal for exporting selected accounts/tokens to Claude Code Hub.
 */
export function CCHExportDialog({
  isOpen,
  onClose,
  initialSelectedSiteIds,
  initialSelectedTokenIdsBySite,
}: CCHExportDialogProps) {
  const { t } = useTranslation(["ui", "common"])
  const { enabledAccounts: accounts, enabledDisplayData: displayData } =
    useAccountData()

  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [selectedTokenIdsBySite, setSelectedTokenIdsBySite] = useState<
    Record<string, string[]>
  >({})
  const [tokenInventories, setTokenInventories] = useState<
    Record<string, TokenInventoryState>
  >({})
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{
    completed: number
    total: number
  } | null>(null)
  const [isConnectionVerified, setIsConnectionVerified] = useState(false)
  const [isVerifyingConnection, setIsVerifyingConnection] = useState(false)

  const initialSelectionAppliedRef = useMemo(() => ({ current: false }), [])
  const isDialogActiveRef = useMemo(() => ({ current: false }), [])

  useEffect(() => {
    isDialogActiveRef.current = isOpen
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setSelectedSiteIds([])
    setSelectedTokenIdsBySite({})
    setTokenInventories({})
    setIsExporting(false)
    setExportProgress(null)
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
        const { getApiService } = await import("~/services/apiService")
        const service = getApiService(site.siteType)
        const tokens = await service.fetchAccountTokens({
          baseUrl: site.baseUrl,
          accountId: site.id,
          auth: {
            authType: site.authType,
            userId: site.userId,
            accessToken: site.token,
            cookie: site.cookieAuthSessionCookie,
          },
        })

        if (!Array.isArray(tokens)) {
          setTokenInventories((prev) => ({
            ...prev,
            [siteId]: {
              status: "error",
              tokens: [],
              errorMessage: t("ui:dialog.cch.messages.loadTokensFailed"),
            },
          }))
          return
        }

        setTokenInventories((prev) => ({
          ...prev,
          [siteId]: { status: "loaded", tokens, errorMessage: undefined },
        }))

        // Default select the first token
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
            errorMessage: t("ui:dialog.cch.messages.loadTokensFailed"),
          },
        }))
      }
    },
    [displayById, t],
  )

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
      const status = tokenInventories[siteId]?.status ?? "idle"
      if (status === "idle") {
        void loadTokensForSite(siteId)
      }
    }
  }, [isOpen, loadTokensForSite, selectedSiteIds, tokenInventories])

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

  const exportSelections: CCHExportSelection[] = useMemo(() => {
    const selections: CCHExportSelection[] = []

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

        selections.push({
          account: site,
          token,
        })
      }
    }

    return selections
  }, [displayById, getTokenInventory, selectedSiteIds, selectedTokenIdsBySite])

  const hasExportableProfiles = exportSelections.length > 0
  const selectionSummary = t("ui:dialog.cch.descriptions.selectedSites", {
    sites: selectedSiteIds.length,
    keys: exportSelections.length,
  })

  const handleVerifyConnection = async () => {
    setIsVerifyingConnection(true)
    try {
      const result = await verifyCCHConnection()
      if (result.success) {
        setIsConnectionVerified(true)
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error(t("ui:dialog.cch.messages.connectionCheckFailed"))
    } finally {
      setIsVerifyingConnection(false)
    }
  }

  const handleExport = async () => {
    if (!hasExportableProfiles) return

    setIsExporting(true)
    setExportProgress({ completed: 0, total: exportSelections.length })

    try {
      const result = await batchExportToCCH(
        exportSelections,
        (completed, total) => {
          setExportProgress({ completed, total })
        },
      )

      if (result.success > 0) {
        toast.success(
          t("ui:dialog.cch.messages.exportSuccess", {
            success: result.success,
            total: result.total,
            failed: result.failed,
          }),
        )
      }

      if (result.failed > 0) {
        const failedResults = result.results.filter((r) => !r.success)
        if (failedResults.length > 0) {
          toast.error(
            t("ui:dialog.cch.messages.exportPartialSuccess", {
              failed: result.failed,
            }),
          )
          failedResults.forEach((r) => {
            toast.error(`${r.accountBaseUrl}: ${r.message}`)
          })
        }
      }

      if (result.success === result.total) {
        onClose()
      }
    } catch {
      toast.error(t("ui:dialog.cch.messages.exportFailed"))
    } finally {
      setIsExporting(false)
      setExportProgress(null)
    }
  }

  const handleClose = () => {
    if (isExporting) return
    onClose()
  }

  const renderSiteCard = (site: DisplaySiteData) => {
    const siteId = site.id
    const siteName = getSiteDisplayName(site)
    const inventory = getTokenInventory(siteId)
    const isLoadingTokens = inventory.status === "loading"

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
          {t("ui:dialog.cch.messages.noTokensTitle")}
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
          disabled={isLoadingTokens}
          loading={isLoadingTokens}
        >
          {t("common:actions.retry")}
        </Button>
      ) : inventory.status === "loaded" && inventory.tokens.length > 0 ? (
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => loadTokensForSite(siteId)}
          disabled={isLoadingTokens}
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
                title={t("ui:dialog.cch.labels.selectedTokens")}
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
              t("ui:dialog.cch.messages.loadTokensFailed")}
          </div>
        )}

        {(inventory.status === "idle" || inventory.status === "loading") && (
          <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
            {t("ui:dialog.cch.messages.loadingTokens")}
          </div>
        )}

        {inventory.status === "loaded" && inventory.tokens.length === 0 && (
          <div className="dark:text-dark-text-tertiary text-sm text-gray-500">
            {t("ui:dialog.cch.messages.noTokensDescription")}
          </div>
        )}

        {inventory.status === "loaded" && inventory.tokens.length > 0 && (
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
              placeholder={t("ui:dialog.cch.placeholders.selectTokens")}
              clearable
            />
          </FormField>
        )}
      </Card>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      header={
        <div className="pr-8">
          <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
            {t("ui:dialog.cch.title")}
          </div>
          <p className="dark:text-dark-text-secondary text-sm text-gray-500">
            {t("ui:dialog.cch.description")}
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
          {!isConnectionVerified && (
            <Button
              variant="secondary"
              type="button"
              onClick={handleVerifyConnection}
              disabled={isVerifyingConnection || isExporting}
              loading={isVerifyingConnection}
            >
              {t("ui:dialog.cch.actions.verifyConnection")}
            </Button>
          )}
          <Button variant="ghost" type="button" onClick={handleClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={!hasExportableProfiles || isExporting}
            loading={isExporting}
          >
            {isExporting && exportProgress
              ? t("ui:dialog.cch.actions.exporting", {
                  completed: exportProgress.completed,
                  total: exportProgress.total,
                })
              : t("ui:dialog.cch.actions.export")}
          </Button>
        </div>
      }
    >
      <Alert
        variant="info"
        title={t("ui:dialog.cch.help.prerequisitesTitle")}
        description={t("ui:dialog.cch.help.prerequisitesDescription")}
      />

      <FormField
        label={t("ui:dialog.cch.labels.selectedSites")}
        description={selectionSummary}
      >
        <CompactMultiSelect
          options={siteOptions}
          selected={selectedSiteIds}
          onChange={setSelectedSiteIds}
          placeholder={t("ui:dialog.cch.placeholders.selectSites")}
          clearable
        />
      </FormField>

      {selectedSites.length > 0 && (
        <div className="space-y-3">
          {selectedSites.map((site) => renderSiteCard(site))}
        </div>
      )}

      {isExporting && exportProgress && (
        <Alert
          variant="info"
          title={t("ui:dialog.cch.messages.exportingTitle")}
          description={t("ui:dialog.cch.messages.exportingDescription", {
            completed: exportProgress.completed,
            total: exportProgress.total,
          })}
        />
      )}

      <Alert
        variant="warning"
        title={t("ui:dialog.cch.warning.title")}
        description={t("ui:dialog.cch.warning.description")}
      />
    </Modal>
  )
}
