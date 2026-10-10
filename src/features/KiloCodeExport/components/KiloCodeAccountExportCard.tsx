import type { RefObject } from "react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  Card,
  CompactMultiSelect,
  FormField,
  SearchableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import type { CompactMultiSelectOption } from "~/components/ui/useCompactMultiSelectModel"
import { type KiloCodeAccountExportSelection } from "~/features/KiloCodeExport/kiloCodeAccountExport"
import { KILO_CODE_EXPORT_TEST_IDS } from "~/features/KiloCodeExport/kiloCodeExportTestIds"
import {
  KILO_CODE_ACCOUNT_MODEL_STATUSES,
  type useKiloCodeAccountModelDiscovery,
} from "~/features/KiloCodeExport/useKiloCodeAccountModelDiscovery"
import { getAccountRuntimeKeyExportId } from "~/services/accounts/keys/accountRuntimeKeys"
import { KILO_CODE_PROVIDER_PROTOCOLS } from "~/services/integrations/kiloCode/kiloCodeExport"
import type { DisplaySiteData } from "~/types"

import type { useKiloCodeTokenInventory } from "../hooks/useKiloCodeTokenInventory"
import {
  getSiteDisplayName,
  getTokenLabel,
  getTokenSelectionKey,
  KILO_CODE_INVENTORY_STATUSES,
  KILO_CODE_PROTOCOL_OPTIONS,
} from "../presentation"

type CardProps = {
  site: DisplaySiteData
  inventory: ReturnType<typeof useKiloCodeTokenInventory>
  modelDiscovery: ReturnType<typeof useKiloCodeAccountModelDiscovery>
  isKiloV7Export: boolean
  accountExportSelections: KiloCodeAccountExportSelection[]
  recovery: {
    retryButtonRefs: RefObject<Map<string, HTMLButtonElement>>
    protocolSelectorRefs: RefObject<Map<string, HTMLButtonElement>>
    modelSelectorRefs: RefObject<Map<string, HTMLButtonElement>>
    handleRetryModels: (selectionId: string) => void
    handleRemoveManualModel: (selectionId: string) => void
    clearDownloadError: () => void
  }
}
/** Render one account inventory and its protocol/model recovery controls. */
export function KiloCodeAccountExportCard({
  site,
  inventory: inventoryState,
  modelDiscovery,
  isKiloV7Export,
  accountExportSelections,
  recovery,
}: CardProps) {
  const { t } = useTranslation(["ui", "common", "messages"])
  const {
    getTokenInventory,
    isCreatingToken,
    selectedTokenIdsBySite,
    loadTokensForSite,
    createDefaultTokenForSite,
    setSelectedTokenIdsBySite,
  } = inventoryState
  const {
    getModelInventory,
    selectV7Protocol,
    selectV7ManualModel,
    selectLegacyModel,
  } = modelDiscovery
  const {
    retryButtonRefs,
    protocolSelectorRefs,
    modelSelectorRefs,
    handleRetryModels,
    handleRemoveManualModel,
    clearDownloadError,
  } = recovery
  const v7SelectionById = new Map(
    modelDiscovery.v7Selections.map((selection) => [
      selection.selectionId,
      selection,
    ]),
  )
  const legacySelectionById = new Map(
    modelDiscovery.legacySelections.map((selection) => [
      selection.selectionId,
      selection,
    ]),
  )

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
      value: getAccountRuntimeKeyExportId(token),
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
    <Card key={siteId} padding="sm" className="space-y-density-2">
      <div className="gap-y-density-2 flex items-center gap-x-2">
        <div className="gap-y-density-2 flex min-w-0 flex-1 items-center gap-x-2">
          <div
            className="text-foreground truncate text-sm font-medium"
            title={siteName}
          >
            {siteName}
          </div>
          <div
            className="dark:text-secondary-foreground text-muted-foreground truncate text-xs"
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
        <div className="gap-y-density-2 flex shrink-0 items-center gap-x-2">
          {actionButton}
        </div>
      </div>

      {isTokenInventoryError && (
        <div className="text-destructive-text text-sm">
          {inventory.errorMessage ||
            t("ui:dialog.kiloCode.messages.loadTokensFailed")}
        </div>
      )}

      {(isTokenInventoryIdle || isLoadingTokens) && (
        <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
          {t("ui:dialog.kiloCode.messages.loadingTokens")}
        </div>
      )}

      {isTokenInventoryLoaded && inventory.tokens.length === 0 && (
        <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
          {t("ui:dialog.kiloCode.messages.noTokensDescription")}
        </div>
      )}

      {isTokenInventoryLoaded && inventory.tokens.length > 0 && (
        <div className="space-y-density-3">
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
              <div className="space-y-density-2">
                {inventory.tokens
                  .filter((token) =>
                    selectedTokenIds.includes(
                      getAccountRuntimeKeyExportId(token),
                    ),
                  )
                  .map((token) => {
                    const selectionId = getTokenSelectionKey(
                      siteId,
                      getAccountRuntimeKeyExportId(token),
                    )
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
                    const modelOptions = modelInventory.modelIds.map((id) => ({
                      value: id,
                      label: id,
                    }))
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
                        className="space-y-density-2"
                      >
                        <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center">
                          <div className="gap-y-density-2 flex min-w-0 flex-1 items-center gap-x-2">
                            <div
                              className="text-foreground truncate text-sm font-medium"
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
                          <div className="gap-y-density-2 flex w-full min-w-0 flex-col items-stretch gap-x-2 sm:w-auto sm:shrink-0 sm:flex-row sm:items-center">
                            {showRetry && (
                              <Button
                                ref={(element) => {
                                  if (element) {
                                    retryButtonRefs.current.set(
                                      selectionId,
                                      element,
                                    )
                                  } else {
                                    retryButtonRefs.current.delete(selectionId)
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
                                    selectV7Protocol(selectionId, option.value)
                                    clearDownloadError()
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
                                    clearDownloadError()
                                  }}
                                  placeholder={t(
                                    "ui:dialog.kiloCode.placeholders.modelId",
                                  )}
                                  loading={
                                    isModelInventoryLoading ||
                                    isModelInventoryIdle
                                  }
                                  options={modelOptions}
                                  allowCustomValue
                                />
                              </FormField>
                            )}
                          </div>
                        </div>

                        {isModelInventoryError && (
                          <div className="text-destructive-text text-sm">
                            {t("ui:dialog.kiloCode.messages.loadModelsFailed")}
                          </div>
                        )}

                        {showV7ManualRecovery && isKiloV7Export && (
                          <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
                            {t(
                              "ui:dialog.kiloCode.messages.v7ProviderModelsRequired",
                            )}
                          </div>
                        )}

                        {isKiloV7Export && manualModelId.trim() && (
                          <div className="border-border gap-y-density-3 py-density-2 flex min-w-0 items-center justify-between gap-x-3 rounded-md border px-3 text-sm">
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
