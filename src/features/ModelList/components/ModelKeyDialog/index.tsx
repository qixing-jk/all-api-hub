import { KeyRound, Plus } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Alert,
  Button,
  EmptyState,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  WorkflowTransitionButton,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import type { AccountKeyCreationResult } from "~/services/accounts/accountKeyCreation"
import {
  getDefaultAccountKeyName,
  getPreferredAccountKeyGroup,
} from "~/services/accounts/accountKeyNames"
import { type AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { normalizeGroupNames } from "~/services/modelCatalog/groupFacts"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { openKeysPage } from "~/utils/navigation"

import { MODEL_LIST_TEST_IDS } from "../../testIds"
import {
  useModelKeyDialog,
  type ModelKeyDialogCreateResult,
} from "./hooks/useModelKeyDialog"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const keyDialogSurface = PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog
const logger = createLogger("ModelKeyDialog")

const analyticsResultByCreateResult: Record<
  ModelKeyDialogCreateResult,
  (typeof PRODUCT_ANALYTICS_RESULTS)[keyof typeof PRODUCT_ANALYTICS_RESULTS]
> = {
  success: PRODUCT_ANALYTICS_RESULTS.Success,
  failure: PRODUCT_ANALYTICS_RESULTS.Failure,
  skipped: PRODUCT_ANALYTICS_RESULTS.Skipped,
  "input-required": PRODUCT_ANALYTICS_RESULTS.Skipped,
}

/**
 * Builds a compact label that disambiguates same-named keys across groups.
 */
function getCompatibleRuntimeKeyLabel(runtimeKey: AccountRuntimeKey) {
  const groups = runtimeKey.modelAccess.groups
  return groups?.length
    ? `${runtimeKey.label} · ${groups.join(", ")}`
    : runtimeKey.label
}

/**
 * Builds the group choices available to the model-compatible key creation flow.
 */
function buildCreateGroupOptions(modelEnableGroups?: readonly string[]) {
  if (modelEnableGroups === undefined) {
    return [DEFAULT_MODEL_GROUP]
  }

  return normalizeGroupNames(modelEnableGroups)
}

/**
 * Resolves the group used when the custom create flow opens its default-key form.
 */
function resolveCustomCreateGroup(
  selectedGroup: string,
  groupOptions: readonly string[],
) {
  const normalizedSelectedGroup = selectedGroup.trim()
  return normalizedSelectedGroup || getPreferredAccountKeyGroup(groupOptions)
}

/**
 * Modal used by the Model List to help users select or create a key compatible with a specific model.
 */
interface ModelKeyDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  modelId: string
  modelEnableGroups?: string[]
}

/**
 * Model key compatibility dialog for a specific { account, modelId } scope.
 */
export default function ModelKeyDialog(props: ModelKeyDialogProps) {
  const { isOpen, onClose, account, modelId, modelEnableGroups } = props
  const { t } = useTranslation(["modelList", "common"])
  const [isAddTokenDialogOpen, setIsAddTokenDialogOpen] = useState(false)
  const [lateCreation, setLateCreation] =
    useState<AccountKeyCreationResult | null>(null)
  const [createGroup, setCreateGroup] = useState("")
  const createGroupSelectId = `model-key-dialog-create-group-${useId()}`
  const compatibleKeySelectId = `model-key-dialog-compatible-key-${useId()}`

  const createGroupOptions = useMemo(
    () => buildCreateGroupOptions(modelEnableGroups),
    [modelEnableGroups],
  )
  const hasStrictEmptyGroupScope =
    modelEnableGroups !== undefined && createGroupOptions.length === 0

  const requiresCreateGroupSelection = createGroupOptions.length > 1

  useEffect(() => {
    if (!isOpen || hasStrictEmptyGroupScope) {
      setCreateGroup("")
      setIsAddTokenDialogOpen(false)
      return
    }

    setCreateGroup((prev) => {
      if (prev && createGroupOptions.includes(prev)) {
        return prev
      }

      if (createGroupOptions.length === 1) {
        return createGroupOptions[0]
      }

      return ""
    })
  }, [createGroupOptions, hasStrictEmptyGroupScope, isOpen])

  const {
    compatibleRuntimeKeys,
    isLoading,
    error,
    selectedRuntimeKeyId,
    setSelectedRuntimeKeyId,
    canCreateToken,
    ineligibleDescription,
    isCreating,
    createError,
    oneTimeSecret: currentOneTimeSecret,
    fetchRuntimeKeys,
    copySelectedKey,
    createDefaultKey,
    refreshRuntimeKeysAfterCreate,
    clearOneTimeSecret,
  } = useModelKeyDialog({
    isOpen,
    account,
    modelId,
    modelEnableGroups,
    onLateCreated: setLateCreation,
  })
  const oneTimeSecret = lateCreation?.createdSecret ?? currentOneTimeSecret
  const oneTimeKeySaveAction = oneTimeSecret
    ? buildOneTimeApiKeyProfileSaveAction({
        result: oneTimeSecret,
        t,
        logger,
        source: "ModelKeyDialog",
      })
    : undefined

  const requiresExplicitSelection = compatibleRuntimeKeys.length > 1

  const canCopy = useMemo(() => {
    if (compatibleRuntimeKeys.length === 0) return false
    if (!requiresExplicitSelection) return true
    return selectedRuntimeKeyId !== null
  }, [
    compatibleRuntimeKeys.length,
    requiresExplicitSelection,
    selectedRuntimeKeyId,
  ])

  const handleOpenAddTokenDialog = () => {
    if (hasStrictEmptyGroupScope) return
    setIsAddTokenDialogOpen(true)
  }
  const handleCloseAddTokenDialog = () => setIsAddTokenDialogOpen(false)
  const handleTokenCreated = async (createdToken: AccountKeyCreationResult) => {
    await refreshRuntimeKeysAfterCreate(createdToken)
  }
  const handleOpenKeysPage = () => {
    void openKeysPage(account.id)
  }
  const customCreateGroup = resolveCustomCreateGroup(
    createGroup,
    createGroupOptions,
  )
  const handleRetryFetchRuntimeKeys = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: keyDialogSurface,
      entrypoint: optionsEntrypoint,
    })
    const isLoaded = await fetchRuntimeKeys()
    if (isLoaded) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      return
    }

    tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })
  }
  const handleCreateCompatibleKey = async (group: string) => {
    if (hasStrictEmptyGroupScope) return

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCompatibleModelKey,
      surfaceId: keyDialogSurface,
      entrypoint: optionsEntrypoint,
    })
    const result = await createDefaultKey(group)
    if (result === "input-required") handleOpenAddTokenDialog()

    if (result === "failure") {
      tracker.complete(analyticsResultByCreateResult[result], {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      return
    }

    tracker.complete(analyticsResultByCreateResult[result])
  }

  const header = (
    <div className="min-w-0 pr-10">
      <h2 className="text-foreground truncate text-base font-semibold sm:text-lg">
        {t("modelList:keyDialog.title")}
      </h2>
      <p className="text-muted-foreground mt-density-1 truncate text-sm">
        {t("modelList:keyDialog.subtitle", {
          accountName: account.name,
          modelId,
        })}
      </p>
      <WorkflowTransitionButton
        onClick={handleOpenKeysPage}
        variant="link"
        className="mt-density-1 h-auto min-h-0 px-0 py-0 text-sm"
        data-testid={MODEL_LIST_TEST_IDS.openKeyManagementButton}
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountKeyManagementFromModel,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        {t("modelList:keyDialog.openKeyManagement", {
          accountName: account.name,
        })}
      </WorkflowTransitionButton>
    </div>
  )

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="py-density-10 flex flex-col items-center justify-center">
          <Spinner size="lg" aria-label={t("common:status.loading")} />
          <p className="dark:text-secondary-foreground text-muted-foreground mt-density-3 text-sm">
            {t("modelList:keyDialog.loading")}
          </p>
        </div>
      )
    }

    if (error) {
      return (
        <ProductAnalyticsScope
          entrypoint={optionsEntrypoint}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
          surfaceId={keyDialogSurface}
        >
          <Alert
            variant="destructive"
            title={t("modelList:keyDialog.getFailed")}
          >
            <p className="text-sm">{error}</p>
            <div className="mt-density-3">
              <Button
                onClick={() => {
                  void handleRetryFetchRuntimeKeys()
                }}
                variant="outline"
                size="sm"
              >
                {t("common:actions.retry")}
              </Button>
            </div>
          </Alert>
        </ProductAnalyticsScope>
      )
    }

    return (
      <ProductAnalyticsScope
        entrypoint={optionsEntrypoint}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
        surfaceId={keyDialogSurface}
      >
        <div className="space-y-density-4">
          {!hasStrictEmptyGroupScope &&
          !canCreateToken &&
          ineligibleDescription ? (
            <Alert
              variant="default"
              title={t("modelList:keyDialog.createDisabledTitle")}
              description={ineligibleDescription}
            />
          ) : null}

          {createError ? (
            <Alert
              variant="destructive"
              title={t("modelList:keyDialog.createErrorTitle")}
              description={createError}
            />
          ) : null}

          {compatibleRuntimeKeys.length === 0 ? (
            hasStrictEmptyGroupScope ? (
              <Alert
                variant="default"
                title={t("modelList:keyDialog.createDisabledTitle")}
                description={t("modelList:noUsableGroupsForModel")}
              />
            ) : (
              <div className="space-y-density-4">
                <EmptyState
                  icon={<KeyRound className="h-12 w-12" />}
                  title={t("modelList:keyDialog.noCompatibleTitle", {
                    modelId,
                  })}
                  description={t("modelList:keyDialog.noCompatibleDescription")}
                />

                <div className="space-y-density-3">
                  <div>
                    <label
                      htmlFor={createGroupSelectId}
                      className="text-secondary-foreground text-sm font-medium"
                    >
                      {t("modelList:keyDialog.createGroupLabel")}
                    </label>
                    <div className="mt-density-2">
                      {requiresCreateGroupSelection ? (
                        <Select
                          value={createGroup}
                          onValueChange={setCreateGroup}
                          disabled={!canCreateToken}
                        >
                          <SelectTrigger
                            id={createGroupSelectId}
                            aria-label={t(
                              "modelList:keyDialog.createGroupLabel",
                            )}
                          >
                            <SelectValue
                              placeholder={t(
                                "modelList:keyDialog.createGroupPlaceholder",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {createGroupOptions.map((group) => (
                              <SelectItem key={group} value={group}>
                                {group}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div
                          id={createGroupSelectId}
                          className="dark:bg-card dark:text-foreground border-border bg-surface-subtle text-secondary-foreground flex min-h-(--density-control) items-center rounded-md border px-3 text-sm font-medium"
                        >
                          {createGroupOptions[0]}
                        </div>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-density-2 text-sm">
                      {requiresCreateGroupSelection
                        ? t("modelList:keyDialog.createGroupHint")
                        : t("modelList:keyDialog.createGroupAutoSelectedHint")}
                    </p>
                  </div>

                  <ActionGroup className="items-stretch justify-start">
                    <Button
                      onClick={() => {
                        void handleCreateCompatibleKey(
                          createGroup || createGroupOptions[0],
                        )
                      }}
                      disabled={
                        !canCreateToken ||
                        (requiresCreateGroupSelection && !createGroup)
                      }
                      loading={isCreating}
                      variant="default"
                      leftIcon={<Plus className="h-4 w-4" />}
                    >
                      {isCreating
                        ? t("common:status.creating")
                        : t("modelList:keyDialog.createKey")}
                    </Button>

                    <Button
                      onClick={handleOpenAddTokenDialog}
                      variant="secondary"
                      disabled={!canCreateToken}
                      data-testid={MODEL_LIST_TEST_IDS.createCustomKeyButton}
                      analyticsAction={
                        PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey
                      }
                    >
                      {t("modelList:keyDialog.createCustomKey")}
                    </Button>
                  </ActionGroup>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-density-4">
              <div>
                <label
                  htmlFor={compatibleKeySelectId}
                  className="text-secondary-foreground text-sm font-medium"
                >
                  {t("modelList:keyDialog.selectLabel")}
                </label>
                <div className="mt-density-2">
                  <Select
                    value={
                      selectedRuntimeKeyId === null ? "" : selectedRuntimeKeyId
                    }
                    onValueChange={(value) => setSelectedRuntimeKeyId(value)}
                    disabled={compatibleRuntimeKeys.length === 1}
                  >
                    <SelectTrigger
                      id={compatibleKeySelectId}
                      aria-label={t("modelList:keyDialog.selectLabel")}
                    >
                      <SelectValue
                        placeholder={t("modelList:keyDialog.selectPlaceholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {compatibleRuntimeKeys.map((runtimeKey) => (
                        <SelectItem key={runtimeKey.id} value={runtimeKey.id}>
                          {getCompatibleRuntimeKeyLabel(runtimeKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {requiresExplicitSelection && selectedRuntimeKeyId === null ? (
                  <p className="text-muted-foreground mt-density-2 text-sm">
                    {t("modelList:keyDialog.selectHint")}
                  </p>
                ) : null}
              </div>

              <ActionGroup className="items-stretch justify-start">
                <Button
                  onClick={copySelectedKey}
                  disabled={!canCopy}
                  variant="default"
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedModelKey
                  }
                >
                  {t("common:actions.copyKey")}
                </Button>
                <Button
                  onClick={handleOpenAddTokenDialog}
                  variant="secondary"
                  disabled={!canCreateToken || hasStrictEmptyGroupScope}
                  data-testid={MODEL_LIST_TEST_IDS.createCustomKeyButton}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey
                  }
                >
                  {t("modelList:keyDialog.createAnotherKey")}
                </Button>
              </ActionGroup>
            </div>
          )}
        </div>
      </ProductAnalyticsScope>
    )
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="md"
        header={header}
        panelTestId={MODEL_LIST_TEST_IDS.modelKeyDialog}
      >
        {renderContent()}
      </Modal>
      <AddTokenDialog
        isOpen={isAddTokenDialogOpen && !hasStrictEmptyGroupScope}
        onClose={handleCloseAddTokenDialog}
        availableAccounts={[account]}
        preSelectedAccountId={account.id}
        createPrefill={{
          modelId: "",
          defaultName: getDefaultAccountKeyName(customCreateGroup),
          group: customCreateGroup,
          allowedGroups: createGroupOptions,
        }}
        onSuccess={handleTokenCreated}
        showOneTimeKeyDialog={false}
      />
      <OneTimeSecretDialog
        isOpen={!!oneTimeSecret}
        result={oneTimeSecret}
        onClose={() => {
          setLateCreation(null)
          clearOneTimeSecret()
        }}
        saveAction={oneTimeKeySaveAction}
      />
    </>
  )
}
