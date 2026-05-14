import { KeyIcon, PlusIcon } from "@heroicons/react/24/outline"
import { useEffect, useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
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
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { OneTimeApiKeyDialog } from "~/features/KeyManagement/components/OneTimeApiKeyDialog"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { ApiToken, DisplaySiteData } from "~/types"
import { openKeysPage } from "~/utils/navigation"

import {
  useModelKeyDialog,
  type ModelKeyDialogCreateResult,
} from "./hooks/useModelKeyDialog"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const keyDialogSurface = PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog

/**
 * Modal used by the Model List to help users select or create a key compatible with a specific model.
 */
interface ModelKeyDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData
  modelId: string
  modelEnableGroups: string[]
}

/**
 * Model key compatibility dialog for a specific { account, modelId } scope.
 */
export default function ModelKeyDialog(props: ModelKeyDialogProps) {
  const { isOpen, onClose, account, modelId, modelEnableGroups } = props
  const { t } = useTranslation(["modelList", "common"])
  const [isAddTokenDialogOpen, setIsAddTokenDialogOpen] = useState(false)
  const [createGroup, setCreateGroup] = useState("")
  const createGroupSelectId = `model-key-dialog-create-group-${useId()}`
  const compatibleKeySelectId = `model-key-dialog-compatible-key-${useId()}`

  const createGroupOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: string[] = []

    modelEnableGroups
      .map((group) => (typeof group === "string" ? group.trim() : ""))
      .filter(Boolean)
      .forEach((group) => {
        if (seen.has(group)) return
        seen.add(group)
        options.push(group)
      })

    return options.length > 0 ? options : [DEFAULT_MODEL_GROUP]
  }, [modelEnableGroups])

  const requiresCreateGroupSelection = createGroupOptions.length > 1

  useEffect(() => {
    if (!isOpen) {
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
  }, [createGroupOptions, isOpen])

  const {
    compatibleTokens,
    isLoading,
    error,
    selectedTokenId,
    setSelectedTokenId,
    canCreateToken,
    ineligibleDescription,
    isCreating,
    createError,
    oneTimeToken,
    fetchTokens,
    copySelectedKey,
    createDefaultKey,
    refreshTokensAfterCreate,
    clearOneTimeToken,
  } = useModelKeyDialog({
    isOpen,
    account,
    modelId,
    modelEnableGroups,
  })

  const requiresExplicitSelection = compatibleTokens.length > 1

  const canCopy = useMemo(() => {
    if (compatibleTokens.length === 0) return false
    if (!requiresExplicitSelection) return true
    return selectedTokenId !== null
  }, [compatibleTokens.length, requiresExplicitSelection, selectedTokenId])

  const handleOpenAddTokenDialog = () => setIsAddTokenDialogOpen(true)
  const handleCloseAddTokenDialog = () => setIsAddTokenDialogOpen(false)
  const handleTokenCreated = async (createdToken?: ApiToken) => {
    await refreshTokensAfterCreate(createdToken)
  }
  const handleOpenKeysPage = () => {
    void openKeysPage(account.id)
  }
  const handleRetryFetchTokens = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: keyDialogSurface,
      entrypoint: optionsEntrypoint,
    })
    const isLoaded = await fetchTokens()
    if (isLoaded) {
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      return
    }

    await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })
  }
  const handleCreateCompatibleKey = async (group: string) => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCompatibleModelKey,
      surfaceId: keyDialogSurface,
      entrypoint: optionsEntrypoint,
    })
    const result = await createDefaultKey(group)
    const analyticsResultByCreateResult: Record<
      ModelKeyDialogCreateResult,
      (typeof PRODUCT_ANALYTICS_RESULTS)[keyof typeof PRODUCT_ANALYTICS_RESULTS]
    > = {
      success: PRODUCT_ANALYTICS_RESULTS.Success,
      failure: PRODUCT_ANALYTICS_RESULTS.Failure,
      skipped: PRODUCT_ANALYTICS_RESULTS.Skipped,
    }

    if (result === "failure") {
      await tracker.complete(analyticsResultByCreateResult[result], {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      return
    }

    await tracker.complete(analyticsResultByCreateResult[result])
  }

  const header = (
    <div className="min-w-0 pr-10">
      <h2 className="dark:text-dark-text-primary truncate text-base font-semibold text-gray-900 sm:text-lg">
        {t("modelList:keyDialog.title")}
      </h2>
      <p className="dark:text-dark-text-tertiary mt-1 truncate text-sm text-gray-500">
        {t("modelList:keyDialog.subtitle", {
          accountName: account.name,
          modelId,
        })}
      </p>
      <WorkflowTransitionButton
        onClick={handleOpenKeysPage}
        variant="link"
        className="mt-1 h-auto px-0 py-0 text-sm"
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
        <div className="flex flex-col items-center justify-center py-10">
          <Spinner size="lg" aria-label={t("common:status.loading")} />
          <p className="dark:text-dark-text-secondary mt-3 text-sm text-gray-500">
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
            <div className="mt-3">
              <Button
                onClick={() => {
                  void handleRetryFetchTokens()
                }}
                variant="destructive"
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
        <div className="space-y-4">
          {!canCreateToken && ineligibleDescription ? (
            <Alert
              variant="info"
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

          {compatibleTokens.length === 0 ? (
            <div className="space-y-4">
              <EmptyState
                icon={<KeyIcon className="h-12 w-12" />}
                title={t("modelList:keyDialog.noCompatibleTitle", { modelId })}
                description={t("modelList:keyDialog.noCompatibleDescription")}
              />

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor={createGroupSelectId}
                    className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
                  >
                    {t("modelList:keyDialog.createGroupLabel")}
                  </label>
                  <div className="mt-2">
                    <Select
                      value={createGroup}
                      onValueChange={setCreateGroup}
                      disabled={
                        !canCreateToken || createGroupOptions.length === 1
                      }
                    >
                      <SelectTrigger
                        id={createGroupSelectId}
                        aria-label={t("modelList:keyDialog.createGroupLabel")}
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
                  </div>
                  <p className="dark:text-dark-text-tertiary mt-2 text-sm text-gray-500">
                    {t("modelList:keyDialog.createGroupHint")}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      void handleCreateCompatibleKey(
                        createGroup || createGroupOptions[0],
                      )
                    }}
                    disabled={
                      !canCreateToken ||
                      isCreating ||
                      (requiresCreateGroupSelection && !createGroup)
                    }
                    loading={isCreating}
                    variant="default"
                    leftIcon={<PlusIcon className="h-4 w-4" />}
                  >
                    {t("modelList:keyDialog.createKey")}
                  </Button>

                  <Button
                    onClick={handleOpenAddTokenDialog}
                    variant="secondary"
                    disabled={!canCreateToken}
                    analyticsAction={
                      PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey
                    }
                  >
                    {t("modelList:keyDialog.createCustomKey")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor={compatibleKeySelectId}
                  className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
                >
                  {t("modelList:keyDialog.selectLabel")}
                </label>
                <div className="mt-2">
                  <Select
                    value={
                      selectedTokenId === null ? "" : String(selectedTokenId)
                    }
                    onValueChange={(value) => setSelectedTokenId(Number(value))}
                    disabled={compatibleTokens.length === 1}
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
                      {compatibleTokens.map((token) => (
                        <SelectItem key={token.id} value={String(token.id)}>
                          {token.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {requiresExplicitSelection && selectedTokenId === null ? (
                  <p className="dark:text-dark-text-tertiary mt-2 text-sm text-gray-500">
                    {t("modelList:keyDialog.selectHint")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
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
                  disabled={!canCreateToken}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey
                  }
                >
                  {t("modelList:keyDialog.createAnotherKey")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </ProductAnalyticsScope>
    )
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="md" header={header}>
        {renderContent()}
      </Modal>
      <AddTokenDialog
        isOpen={isAddTokenDialogOpen}
        onClose={handleCloseAddTokenDialog}
        availableAccounts={[account]}
        preSelectedAccountId={account.id}
        createPrefill={{
          modelId,
          group: createGroup
            ? createGroup
            : createGroupOptions.includes(DEFAULT_MODEL_GROUP)
              ? DEFAULT_MODEL_GROUP
              : createGroupOptions[0] ?? DEFAULT_MODEL_GROUP,
          allowedGroups: createGroupOptions,
        }}
        onSuccess={handleTokenCreated}
        showOneTimeKeyDialog={false}
      />
      <OneTimeApiKeyDialog
        isOpen={!!oneTimeToken}
        token={oneTimeToken}
        onClose={clearOneTimeToken}
      />
    </>
  )
}
