import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Alert,
  Button,
  CompactMultiSelect,
  FormField,
  Modal,
  SearchableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type { CompactMultiSelectOption } from "~/components/ui/useCompactMultiSelectModel"
import { useAccountData } from "~/features/AccountManagement/data/useAccountData"
import { KiloCodeAccountExportCard } from "~/features/KiloCodeExport/components/KiloCodeAccountExportCard"
import { useKiloCodeExportActions } from "~/features/KiloCodeExport/hooks/useKiloCodeExportActions"
import { useKiloCodeTokenInventory } from "~/features/KiloCodeExport/hooks/useKiloCodeTokenInventory"
import { type KiloCodeAccountExportSelection } from "~/features/KiloCodeExport/kiloCodeAccountExport"
import { KiloCodeDefaultModelSelect } from "~/features/KiloCodeExport/KiloCodeDefaultModelSelect"
import { KiloCodeExportGuidance } from "~/features/KiloCodeExport/KiloCodeExportGuidance"
import { KILO_CODE_EXPORT_TEST_IDS } from "~/features/KiloCodeExport/kiloCodeExportTestIds"
import {
  getSiteDisplayName,
  getTokenLabel,
  getTokenSelectionKey,
} from "~/features/KiloCodeExport/presentation"
import {
  KILO_CODE_ACCOUNT_MODEL_STATUSES,
  useKiloCodeAccountModelDiscovery,
} from "~/features/KiloCodeExport/useKiloCodeAccountModelDiscovery"
import AddTokenDialog from "~/features/TokenProvisioning/creation/AddTokenDialog"
import { getAccountRuntimeKeyExportId } from "~/services/accounts/keys/accountRuntimeKeys"
import { compareAccountDisplayNames } from "~/services/accounts/utils/accountDisplayName"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import {
  KILO_CODE_EXPORT_TARGET_OPTIONS,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
} from "~/services/integrations/kiloCode/kiloCodeExport"
import type { DisplaySiteData, SiteAccount } from "~/types"

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
  const [exportTarget, setExportTarget] = useState<KiloCodeExportTarget>(
    KILO_CODE_EXPORT_TARGETS.KiloV7,
  )

  const initialSelectionAppliedRef = useRef(false)
  const pendingRetrySelectionIdRef = useRef<string | undefined>(undefined)
  const pendingRemoveSelectionIdRef = useRef<string | undefined>(undefined)
  const retryButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const protocolSelectorRefs = useRef(new Map<string, HTMLButtonElement>())
  const modelSelectorRefs = useRef(new Map<string, HTMLButtonElement>())

  const displayById = useMemo(() => {
    return new Map<string, DisplaySiteData>(
      displayData.map((site) => [site.id, site]),
    )
  }, [displayData])

  const accountById = useMemo(() => {
    return new Map<string, SiteAccount>(accounts.map((acc) => [acc.id, acc]))
  }, [accounts])

  const inventoryState = useKiloCodeTokenInventory({
    isOpen,
    displayById,
    accountById,
    selectedSiteIds,
  })
  const {
    selectedTokenIdsBySite,
    setSelectedTokenIdsBySite,
    getTokenInventory,
    defaultTokenCreateContext,
    handleCloseDefaultTokenCreateDialog,
    handleDefaultTokenCreateSuccess,
  } = inventoryState

  useEffect(() => {
    if (isOpen) return
    setSelectedSiteIds([])
    setExportTarget(KILO_CODE_EXPORT_TARGETS.KiloV7)
    pendingRetrySelectionIdRef.current = undefined
    pendingRemoveSelectionIdRef.current = undefined
    retryButtonRefs.current.clear()
    protocolSelectorRefs.current.clear()
    modelSelectorRefs.current.clear()
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
  }, [
    isOpen,
    initialSelectedSiteIds,
    initialSelectedTokenIdsBySite,
    setSelectedTokenIdsBySite,
  ])

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
  }, [displayById, isOpen, selectedSiteIds, setSelectedTokenIdsBySite])

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
          (candidate) => getAccountRuntimeKeyExportId(candidate) === tokenId,
        )
        if (!token) continue

        const selectionId = getTokenSelectionKey(
          siteId,
          getAccountRuntimeKeyExportId(token),
        )
        const tokenName = getTokenLabel(token, t("common:labels.token"))
        const siteName = getSiteDisplayName(site)
        const credential = createAccountRuntimeKeyExportSource(site, token, {
          preferCurrentSecret: true,
        })

        selections.push({
          selectionId,
          credential,
          sourceSnapshots: [site, token],
          providerName: `${siteName} - ${tokenName}`,
          runtimeKey: {
            accountId: siteId,
            siteName,
            baseUrl: credential.baseUrl,
            tokenId: getAccountRuntimeKeyExportId(token),
            tokenName,
            tokenKey: token.secret,
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

  const modelDiscovery = useKiloCodeAccountModelDiscovery({
    isOpen,
    selections: accountExportSelections,
  })
  const {
    invalidSelection,
    loadModels,
    getModelInventory,
    v7DefaultModel,
    v7Selections,
    preparedCatalog,
    removeV7ManualModel,
    selectV7DefaultProvider,
    selectV7DefaultModel,
  } = modelDiscovery
  const {
    profileNames,
    effectiveCurrentApiConfigName,
    setCurrentApiConfigName,
    isKiloV7Export,
    isExporting,
    canExport,
    missingModelIdCount,
    hasExportableProfiles,
    legacyFilename,
    selectionSummary,
    isDownloadTooLarge,
    invalidateAndClose,
    handleCopyApiConfigs,
    handleDownloadSettings,
    clearDownloadError,
  } = useKiloCodeExportActions({
    isOpen,
    onClose,
    exportTarget,
    accountExportSelections,
    selectedSiteIds,
    modelDiscovery,
  })
  const v7SelectionById = useMemo(
    () =>
      new Map(
        v7Selections.map((selection) => [selection.selectionId, selection]),
      ),
    [v7Selections],
  )
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

  const handleRetryModels = (selectionId: string) => {
    pendingRetrySelectionIdRef.current = selectionId
    clearDownloadError()
    void loadModels(selectionId)
  }

  const handleRemoveManualModel = (selectionId: string) => {
    pendingRemoveSelectionIdRef.current = selectionId
    clearDownloadError()
    removeV7ManualModel(selectionId)
  }

  const defaultTokenQuickCreateSite = defaultTokenCreateContext
    ? displayById.get(defaultTokenCreateContext.siteId)
    : undefined

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={invalidateAndClose}
        size="lg"
        header={
          <div className="pr-8">
            <div className="text-foreground text-base font-semibold">
              {t("ui:dialog.kiloCode.title")}
            </div>
            <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {t("ui:dialog.kiloCode.description")}
            </p>
          </div>
        }
        footer={
          <ActionGroup>
            {selectedSiteIds.length > 0 && (
              <div className="dark:text-secondary-foreground text-muted-foreground mr-auto text-xs">
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
              disabled={!canExport || isExporting}
              loading={isExporting}
            >
              {copyActionLabel}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadSettings}
              disabled={!canExport || isExporting}
              loading={isExporting}
            >
              {downloadActionLabel}
            </Button>
          </ActionGroup>
        }
      >
        <Alert
          variant="primary"
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
          <div className="space-y-density-3">
            {selectedSites.map((site) => (
              <KiloCodeAccountExportCard
                key={site.id}
                site={site}
                inventory={inventoryState}
                modelDiscovery={modelDiscovery}
                isKiloV7Export={isKiloV7Export}
                accountExportSelections={accountExportSelections}
                recovery={{
                  retryButtonRefs,
                  protocolSelectorRefs,
                  modelSelectorRefs,
                  handleRetryModels,
                  handleRemoveManualModel,
                  clearDownloadError,
                }}
              />
            ))}
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
          <div className="gap-y-density-3 grid gap-x-3 sm:grid-cols-2">
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
            variant="default"
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
      {defaultTokenQuickCreateSite ? (
        <AddTokenDialog
          isOpen={true}
          onClose={handleCloseDefaultTokenCreateDialog}
          availableAccounts={[defaultTokenQuickCreateSite]}
          preSelectedAccountId={defaultTokenQuickCreateSite.id}
          prefillNotice={t(
            "messages:tokenProvisioning.createRequiresGroupSelection",
          )}
          onSuccess={handleDefaultTokenCreateSuccess}
        />
      ) : null}
    </>
  )
}
