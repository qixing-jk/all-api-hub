import { KeyIcon, PlusIcon } from "@heroicons/react/24/outline"
import { useEffect, useMemo, useState } from "react"
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
} from "~/components/ui"
import AddTokenDialog from "~/entrypoints/options/pages/KeyManagement/components/AddTokenDialog"
import type { DisplaySiteData } from "~/types"

import { useModelKeyDialog } from "./hooks/useModelKeyDialog"

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

    return options.length > 0 ? options : ["default"]
  }, [modelEnableGroups])

  const requiresCreateGroupSelection = createGroupOptions.length > 1

  useEffect(() => {
    if (!isOpen) {
      setCreateGroup("")
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
    fetchTokens,
    copySelectedKey,
    createDefaultKey,
    refreshTokensAfterCreate,
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

  const header = (
    <div className="min-w-0">
      <h2 className="dark:text-dark-text-primary truncate text-base font-semibold text-gray-900 sm:text-lg">
        {t("modelList:keyDialog.title")}
      </h2>
      <p className="dark:text-dark-text-tertiary mt-1 truncate text-sm text-gray-500">
        {t("modelList:keyDialog.subtitle", {
          accountName: account.name,
          modelId,
        })}
      </p>
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
        <Alert variant="destructive" title={t("modelList:keyDialog.getFailed")}>
          <p className="text-sm">{error}</p>
          <div className="mt-3">
            <Button onClick={fetchTokens} variant="destructive" size="sm">
              {t("common:actions.retry")}
            </Button>
          </div>
        </Alert>
      )
    }

    return (
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
                <label className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
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
                  onClick={() =>
                    createDefaultKey(createGroup || createGroupOptions[0])
                  }
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
                >
                  {t("modelList:keyDialog.createCustomKey")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
                {t("modelList:keyDialog.selectLabel")}
              </label>
              <div className="mt-2">
                <Select
                  value={selectedTokenId ? String(selectedTokenId) : ""}
                  onValueChange={(value) => setSelectedTokenId(Number(value))}
                  disabled={compatibleTokens.length === 1}
                >
                  <SelectTrigger
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
              >
                {t("common:actions.copyKey")}
              </Button>
              <Button
                onClick={handleOpenAddTokenDialog}
                variant="secondary"
                disabled={!canCreateToken}
              >
                {t("modelList:keyDialog.createAnotherKey")}
              </Button>
            </div>
          </div>
        )}
      </div>
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
            : createGroupOptions.includes("default")
              ? "default"
              : createGroupOptions[0] ?? "default",
          allowedGroups: createGroupOptions,
        }}
        onSuccess={refreshTokensAfterCreate}
      />
    </>
  )
}
