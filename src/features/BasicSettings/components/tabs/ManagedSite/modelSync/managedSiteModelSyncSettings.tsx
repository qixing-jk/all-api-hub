import { useTranslation } from "react-i18next"

import ChannelFiltersEditor from "~/components/ChannelFiltersEditor"
import {
  ActionGroup,
  Button,
  Card,
  CardItem,
  CardList,
  CompactMultiSelect,
  Input,
  Modal,
  Switch,
  WorkflowTransitionButton,
} from "~/components/ui"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_MODEL_SYNC_CHANNEL_PROCESSING_TIMEOUT_TARGET_ID } from "~/features/BasicSettings/components/tabs/ManagedSite/modelSync/managedSiteModelSyncTargetIds"
import { useManagedSiteModelSyncSettingsViewModel } from "~/features/BasicSettings/hooks/useManagedSiteModelSyncSettingsViewModel"

/** Model-sync settings view. */
export default function ManagedSiteModelSyncSettings() {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "managedSiteChannels",
    "common",
  ])
  const {
    channelProcessingTimeoutMaxSeconds,
    channelUpstreamModelOptions,
    optionsLoading,
    optionsError,
    preferences,
    isGlobalChannelModelFiltersDialogOpen,
    globalChannelModelFiltersDraft,
    jsonText,
    setJsonText,
    viewMode,
    showVisual,
    showJson,
    handleGlobalFilterFieldChange,
    handleAddGlobalFilter,
    handleRemoveGlobalFilter,
    handleMoveGlobalFilter,
    isSavingGlobalChannelModelFilters,
    savePreferences,
    intervalHoursField,
    concurrencyField,
    maxRetriesField,
    channelProcessingTimeoutField,
    requestsPerMinuteField,
    burstField,
    handleOpenGlobalChannelModelFilters,
    handleCloseGlobalChannelModelFilters,
    handleSaveGlobalChannelModelFilters,
    handleNavigateToExecution,
    resetDisabled,
    handleReset,
  } = useManagedSiteModelSyncSettingsViewModel()

  return (
    <SettingSection
      resetRequiresConfirmation
      resetDisabled={resetDisabled}
      id="managed-site-model-sync"
      title={t("managedSiteModelSync:settings.title")}
      description={t("managedSiteModelSync:description")}
      onReset={handleReset}
    >
      <Card padding="none">
        <CardList>
          {/* Enable Auto-Sync */}
          <CardItem
            id="managed-site-model-sync-enable"
            title={t("managedSiteModelSync:settings.enable")}
            description={t("managedSiteModelSync:settings.enableDesc")}
            rightContent={
              <Switch
                checked={preferences.enableSync}
                onChange={(checked) =>
                  void savePreferences({ enableSync: checked })
                }
              />
            }
          />

          {/* Sync Interval */}
          <CardItem
            id="managed-site-model-sync-interval"
            title={t("managedSiteModelSync:settings.interval")}
            description={t("managedSiteModelSync:settings.intervalDesc")}
            rightContent={
              <div className="gap-y-density-2 flex items-center gap-x-2">
                <Input
                  type="number"
                  min="1"
                  max="720"
                  step="any"
                  value={intervalHoursField.draft}
                  onChange={(event) =>
                    intervalHoursField.setDraft(event.target.value)
                  }
                  onBlur={() => void intervalHoursField.commit()}
                  onKeyDown={intervalHoursField.handleKeyDown}
                  placeholder={String(
                    preferences.intervalMs / (1000 * 60 * 60),
                  )}
                  aria-label={t("managedSiteModelSync:settings.interval")}
                  disabled={intervalHoursField.isCommitting}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">
                  {t("managedSiteModelSync:settings.intervalUnit")}
                </span>
              </div>
            }
          />

          {/* Concurrency */}
          <CardItem
            id="managed-site-model-sync-concurrency"
            title={t("managedSiteModelSync:settings.concurrency")}
            description={t("managedSiteModelSync:settings.concurrencyDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="10"
                step="1"
                value={concurrencyField.draft}
                onChange={(event) =>
                  concurrencyField.setDraft(event.target.value)
                }
                onBlur={() => void concurrencyField.commit()}
                onKeyDown={concurrencyField.handleKeyDown}
                placeholder={String(preferences.concurrency)}
                aria-label={t("managedSiteModelSync:settings.concurrency")}
                disabled={concurrencyField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Max Retries */}
          <CardItem
            id="managed-site-model-sync-max-retries"
            title={t("managedSiteModelSync:settings.maxRetries")}
            description={t("managedSiteModelSync:settings.maxRetriesDesc")}
            rightContent={
              <Input
                type="number"
                min="0"
                max="5"
                step="1"
                value={maxRetriesField.draft}
                onChange={(event) =>
                  maxRetriesField.setDraft(event.target.value)
                }
                onBlur={() => void maxRetriesField.commit()}
                onKeyDown={maxRetriesField.handleKeyDown}
                placeholder={String(preferences.maxRetries)}
                aria-label={t("managedSiteModelSync:settings.maxRetries")}
                disabled={maxRetriesField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Per-Channel Timeout */}
          <CardItem
            id={MANAGED_SITE_MODEL_SYNC_CHANNEL_PROCESSING_TIMEOUT_TARGET_ID}
            title={t("managedSiteModelSync:settings.channelProcessingTimeout")}
            description={t(
              "managedSiteModelSync:settings.channelProcessingTimeoutDesc",
            )}
            rightContent={
              <div className="gap-y-density-2 flex items-center gap-x-2">
                <Input
                  type="number"
                  min="0"
                  max={String(channelProcessingTimeoutMaxSeconds)}
                  step="1"
                  value={channelProcessingTimeoutField.draft}
                  onChange={(event) =>
                    channelProcessingTimeoutField.setDraft(event.target.value)
                  }
                  onBlur={() => void channelProcessingTimeoutField.commit()}
                  onKeyDown={channelProcessingTimeoutField.handleKeyDown}
                  placeholder={String(preferences.channelProcessingTimeout)}
                  aria-label={t(
                    "managedSiteModelSync:settings.channelProcessingTimeout",
                  )}
                  disabled={channelProcessingTimeoutField.isCommitting}
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">
                  {t(
                    "managedSiteModelSync:settings.channelProcessingTimeoutUnit",
                  )}
                </span>
              </div>
            }
          />

          {/* Rate Limit - Requests per Minute */}
          <CardItem
            id="managed-site-model-sync-requests-per-minute"
            title={t("managedSiteModelSync:settings.requestsPerMinute")}
            description={t(
              "managedSiteModelSync:settings.requestsPerMinuteDesc",
            )}
            rightContent={
              <Input
                type="number"
                min="5"
                max="120"
                step="1"
                value={requestsPerMinuteField.draft}
                onChange={(event) =>
                  requestsPerMinuteField.setDraft(event.target.value)
                }
                onBlur={() => void requestsPerMinuteField.commit()}
                onKeyDown={requestsPerMinuteField.handleKeyDown}
                placeholder={String(preferences.rateLimit.requestsPerMinute)}
                aria-label={t(
                  "managedSiteModelSync:settings.requestsPerMinute",
                )}
                disabled={requestsPerMinuteField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Rate Limit - Burst */}
          <CardItem
            id="managed-site-model-sync-burst"
            title={t("managedSiteModelSync:settings.burst")}
            description={t("managedSiteModelSync:settings.burstDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="20"
                step="1"
                value={burstField.draft}
                onChange={(event) => burstField.setDraft(event.target.value)}
                onBlur={() => void burstField.commit()}
                onKeyDown={burstField.handleKeyDown}
                placeholder={String(preferences.rateLimit.burst)}
                aria-label={t("managedSiteModelSync:settings.burst")}
                disabled={burstField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Allowed Models */}
          <CardItem
            id="managed-site-model-sync-allowed-models"
            title={t("managedSiteModelSync:settings.allowedModels")}
            description={t("managedSiteModelSync:settings.allowedModelsDesc")}
          >
            <div className="space-y-density-2 w-full">
              <CompactMultiSelect
                allowCustom
                options={channelUpstreamModelOptions}
                selected={preferences.allowedModels}
                size="default"
                placeholder={t(
                  "managedSiteModelSync:settings.allowedModelsPlaceholder",
                )}
                onChange={(values) => {
                  void savePreferences({ allowedModels: values })
                }}
                disabled={optionsLoading}
              />
              {optionsLoading ? (
                <p className="text-muted-foreground text-xs">
                  {t("managedSiteModelSync:settings.allowedModelsLoading")}
                </p>
              ) : optionsError ? (
                <p className="text-destructive-text text-xs">
                  {t("managedSiteModelSync:settings.allowedModelsLoadFailed", {
                    error: optionsError,
                  })}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t("managedSiteModelSync:settings.allowedModelsHint")}
                </p>
              )}
            </div>
          </CardItem>

          {/* Global Filters */}
          <CardItem
            id="managed-site-model-sync-global-channel-model-filters"
            title={t("managedSiteModelSync:settings.globalChannelModelFilters")}
            description={t(
              "managedSiteModelSync:settings.globalChannelModelFiltersDesc",
            )}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenGlobalChannelModelFilters}
              >
                {t(
                  "managedSiteModelSync:settings.globalChannelModelFiltersButton",
                )}
              </Button>
            }
          />

          {/* View Execution Button */}
          <CardItem
            id="managed-site-model-sync-view-execution"
            title={t("managedSiteModelSync:settings.viewExecution")}
            description={t("managedSiteModelSync:settings.viewExecutionDesc")}
            rightContent={
              <WorkflowTransitionButton
                onClick={handleNavigateToExecution}
                variant="default"
                size="sm"
                className="gap-y-density-2 flex items-center gap-x-2"
              >
                <span>
                  {t("managedSiteModelSync:settings.viewExecutionButton")}
                </span>
              </WorkflowTransitionButton>
            }
          />
        </CardList>
      </Card>

      <Modal
        isOpen={isGlobalChannelModelFiltersDialogOpen}
        onClose={handleCloseGlobalChannelModelFilters}
        size="lg"
        panelClassName="max-h-[85vh]"
        header={
          <div>
            <p className="text-base font-semibold">
              {t(
                "managedSiteModelSync:settings.globalChannelModelFiltersDialogTitle",
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              {t(
                "managedSiteModelSync:settings.globalChannelModelFiltersDialogSubtitle",
              )}
            </p>
          </div>
        }
        footer={
          <ActionGroup>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseGlobalChannelModelFilters}
              disabled={isSavingGlobalChannelModelFilters}
            >
              {t("managedSiteChannels:filters.actions.cancel")}
            </Button>
            <Button
              onClick={handleSaveGlobalChannelModelFilters}
              loading={isSavingGlobalChannelModelFilters}
            >
              {isSavingGlobalChannelModelFilters
                ? t("common:status.saving")
                : t("managedSiteChannels:filters.actions.save")}
            </Button>
          </ActionGroup>
        }
      >
        <ChannelFiltersEditor
          filters={globalChannelModelFiltersDraft}
          viewMode={viewMode}
          jsonText={jsonText}
          isLoading={false}
          onAddFilter={handleAddGlobalFilter}
          onMoveFilter={handleMoveGlobalFilter}
          onRemoveFilter={handleRemoveGlobalFilter}
          onFieldChange={handleGlobalFilterFieldChange}
          onClickViewVisual={showVisual}
          onClickViewJson={showJson}
          onChangeJsonText={setJsonText}
        />
      </Modal>
    </SettingSection>
  )
}
