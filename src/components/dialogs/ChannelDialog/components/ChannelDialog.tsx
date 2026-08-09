import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { ChannelDialogAdvisoryWarning } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import {
  useChannelForm,
  type ChannelResourceEditContext,
} from "~/components/dialogs/ChannelDialog/hooks/useChannelForm"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  buildChannelDialogAdvisoryWarning,
  CHANNEL_DIALOG_ADVISORY_WARNING_KINDS,
} from "~/components/dialogs/ChannelDialog/utils/advisoryWarning"
import { ManagedSiteChannelAssessmentSignalsRow } from "~/components/ManagedSiteChannelAssessmentSignals"
import { Alert, Button } from "~/components/ui"
import {
  AxonHubChannelTypeOptions,
  isAxonHubChannelType,
} from "~/constants/axonHub"
import {
  ClaudeCodeHubProviderTypeOptions,
  isClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { ChannelType, ChannelTypeOptions } from "~/constants/managedSite"
import { OctopusOutboundTypeOptions } from "~/constants/octopus"
import { SITE_TYPES } from "~/constants/siteType"
import { SUB2API_API_KEY_ACCOUNT_TYPE_OPTIONS } from "~/constants/sub2api"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ManagedSiteChannelDetailView } from "~/features/ManagedSiteChannels/presentation/ManagedSiteChannelDetailView"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { toManagedSiteChannelAssessmentSignals } from "~/services/managedSites/channelAssessmentSignals"
import { getManagedSiteChannelExactMatch } from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import {
  hasNewApiAuthenticatedBrowserSession,
  hasNewApiLoginAssistCredentials,
  isNewApiVerifiedSessionActive,
} from "~/services/managedSites/providers/newApiSession"
import { getManagedSiteConfigMissingMessage } from "~/services/managedSites/utils/managedSite"
import {
  createAutomaticProtectionBypassExecution,
  withProtectionBypassUserCommand,
} from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import {
  CHANNEL_STATUS,
  type ChannelFormData,
  type ChannelStatus,
  type ManagedSiteChannel,
} from "~/types/managedSite"
import { OctopusOutboundType } from "~/types/octopus"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

import { ChannelCommonFieldsBody } from "./ChannelCommonFieldsBody"
import { ChannelEditorShell } from "./ChannelEditorShell"

export interface ChannelDialogProps {
  isOpen: boolean
  onClose: () => void
  mode?: DialogMode
  channel?: ManagedSiteChannel | null
  onSuccess?: (channel: any) => void
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
  showModelPrefillWarning?: boolean
  advisoryWarning?: ChannelDialogAdvisoryWarning | null
  onRequestRealKey?: (options: {
    setKey: (key: string) => void
  }) => Promise<void>
  onMutationOutcome?: Parameters<typeof useChannelForm>[0]["onMutationOutcome"]
  resourceEdit?: ChannelResourceEditContext | null
}

/**
 * Full channel create/edit dialog for the New API feature.
 * Handles form state, validation, and submission via useChannelForm.
 * @param props Component props bundle.
 * @param props.isOpen Whether the dialog is visible.
 * @param props.onClose Callback invoked when the dialog should close.
 * @param props.mode Dialog mode (add/edit) controlling UX copy.
 * @param props.channel Existing channel for edit mode.
 * @param props.onSuccess Callback fired after successful mutation.
 * @param props.initialValues Pre-filled form values when reusing data.
 * @param props.initialModels Models to seed multi-select state.
 * @param props.initialGroups Groups to seed multi-select state.
 * @param props.showModelPrefillWarning Whether to show a non-blocking warning that automatic model prefill failed.
 * @param props.advisoryWarning Optional non-blocking duplicate-risk warning shown above the form.
 * @param props.onRequestRealKey Optional edit-mode hook that can load the real
 * managed-site key into the dialog when the list payload only provides a masked value.
 * @param props.onMutationOutcome Optional opt-in callback for callers that track real save outcomes.
 * @param props.resourceEdit Optional resource-backed edit context for migrated managed sites.
 */
export function ChannelDialog({
  isOpen,
  onClose,
  mode = DIALOG_MODES.ADD,
  channel = null,
  onSuccess,
  initialValues,
  initialModels,
  initialGroups,
  showModelPrefillWarning = false,
  advisoryWarning,
  onRequestRealKey,
  onMutationOutcome,
  resourceEdit,
}: ChannelDialogProps) {
  const { t } = useTranslation([
    "channelDialog",
    "common",
    "messages",
    "managedSiteChannels",
  ])
  const { requestDuplicateChannelWarning } = useChannelDialogContext()
  const [showKey, setShowKey] = useState(false)
  const [isLoadingRealKey, setIsLoadingRealKey] = useState(false)
  const [currentAdvisoryWarning, setCurrentAdvisoryWarning] = useState(
    advisoryWarning ?? null,
  )
  const [canRecoverManagedVerification, setCanRecoverManagedVerification] =
    useState(false)
  const requestIdRef = useRef(0)
  const resourceEditRetryErrorRef = useRef<Error | null>(null)
  const verification = useNewApiManagedVerification()
  const {
    managedSiteType,
    newApiBaseUrl,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
  } = useUserPreferencesContext()
  const isOctopus = managedSiteType === SITE_TYPES.OCTOPUS
  const isAxonHub = managedSiteType === SITE_TYPES.AXON_HUB
  const isClaudeCodeHub = managedSiteType === SITE_TYPES.CLAUDE_CODE_HUB
  const isSub2Api = managedSiteType === SITE_TYPES.SUB2API
  const canRunManagedVerification =
    managedSiteType === SITE_TYPES.NEW_API && canRecoverManagedVerification
  const isAddMode = mode === DIALOG_MODES.ADD
  const isViewMode = mode === DIALOG_MODES.VIEW

  const {
    formData,
    updateField,
    handleTypeChange,
    handleSubmit,
    isFormValid,
    isSaving,
    isLoadingGroups,
    isLoadingModels,
    isResourceEditLoading,
    isResourceEditReady,
    resourceEditLoadError,
    retryResourceEditLoad,
    availableGroups,
    availableModels,
    isKeyFieldRequired,
    isBaseUrlRequired,
  } = useChannelForm({
    mode,
    channel,
    isOpen,
    onClose,
    onSuccess,
    initialValues,
    initialModels,
    initialGroups,
    onMutationOutcome,
    resourceEdit,
  })

  const isResourceEditUnavailable = Boolean(
    resourceEdit && !isResourceEditReady,
  )
  const isFormInteractionDisabled = isSaving || isResourceEditUnavailable
  const visibleResourceEditLoadError =
    resourceEditLoadError ??
    (isResourceEditLoading ? resourceEditRetryErrorRef.current : null)
  const shouldShowGenericModelsField =
    !isSub2Api && !(isAxonHub && mode === DIALOG_MODES.EDIT && resourceEdit)
  const channelTypeOptions = isSub2Api
    ? SUB2API_API_KEY_ACCOUNT_TYPE_OPTIONS
    : isClaudeCodeHub
      ? ClaudeCodeHubProviderTypeOptions
      : isAxonHub
        ? AxonHubChannelTypeOptions
        : isOctopus
          ? OctopusOutboundTypeOptions
          : ChannelTypeOptions
  const shouldShowUnknownStringType =
    (isAxonHub || isClaudeCodeHub) &&
    typeof formData.type === "string" &&
    formData.type.trim() &&
    !isAxonHubChannelType(formData.type) &&
    !isClaudeCodeHubProviderType(formData.type)

  const handleSelectAllModels = () => {
    updateField(
      "models",
      availableModels.map((m) => m.value),
    )
  }

  const handleInverseModels = () => {
    const currentModels = new Set(formData.models)
    const invertedModels = availableModels
      .map((m) => m.value)
      .filter((value) => !currentModels.has(value))
    updateField("models", invertedModels)
  }

  const handleDeselectAllModels = () => {
    updateField("models", [])
  }

  useEffect(() => {
    requestIdRef.current += 1
    resourceEditRetryErrorRef.current = null
    setIsLoadingRealKey(false)
  }, [channel?.id, isOpen, mode, resourceEdit])

  useEffect(() => {
    if (!isResourceEditLoading && !resourceEditLoadError) {
      resourceEditRetryErrorRef.current = null
    }
  }, [isResourceEditLoading, resourceEditLoadError])

  useEffect(() => {
    setCurrentAdvisoryWarning(advisoryWarning ?? null)
  }, [advisoryWarning, isOpen, mode, channel?.id])

  useEffect(() => {
    let cancelled = false
    const managedBaseUrl = newApiBaseUrl.trim()

    if (
      !isOpen ||
      managedSiteType !== SITE_TYPES.NEW_API ||
      currentAdvisoryWarning?.kind !==
        CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED ||
      !managedBaseUrl
    ) {
      setCanRecoverManagedVerification(false)
      return
    }

    if (
      hasNewApiLoginAssistCredentials({
        username: newApiUsername,
        password: newApiPassword,
      }) ||
      isNewApiVerifiedSessionActive(managedBaseUrl)
    ) {
      setCanRecoverManagedVerification(true)
      return
    }

    setCanRecoverManagedVerification(false)

    void hasNewApiAuthenticatedBrowserSession({
      baseUrl: managedBaseUrl,
      userId: newApiUserId,
    })
      .then((authenticatedBrowserSessionExists) => {
        if (!cancelled) {
          setCanRecoverManagedVerification(authenticatedBrowserSessionExists)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanRecoverManagedVerification(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    currentAdvisoryWarning?.kind,
    isOpen,
    managedSiteType,
    newApiBaseUrl,
    newApiPassword,
    newApiUserId,
    newApiUsername,
  ])

  const handleLoadRealKey = async () => {
    if (isViewMode || !onRequestRealKey) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    let resolvedKey: string | null = null
    let requestSettled = false
    let requestFailed = false

    const applyResolvedKey = (key: string) => {
      resolvedKey = key

      // New API may return from the initial request after opening its
      // verification dialog. The same setter is then invoked later by the
      // verification callback, so apply it after either timing.
      if (
        requestSettled &&
        !requestFailed &&
        requestId === requestIdRef.current
      ) {
        updateField("key", key)
        setShowKey(true)
      }
    }

    setIsLoadingRealKey(true)
    try {
      await onRequestRealKey({
        setKey: applyResolvedKey,
      })

      requestSettled = true

      if (requestId !== requestIdRef.current || resolvedKey === null) {
        return
      }

      updateField("key", resolvedKey)
      setShowKey(true)
    } catch (error) {
      requestFailed = true
      toast.error(
        t("channelDialog:messages.loadRealKeyFailed", {
          error: error instanceof Error ? error.message : String(error ?? ""),
        }),
      )
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoadingRealKey(false)
      }
    }
  }

  const reassessDuplicateWarning = async (options?: {
    resolveHiddenKeys?: boolean
    channelId?: number
  }) => {
    const service = await getManagedSiteService()
    const managedConfig = await service.getConfig()

    if (!managedConfig) {
      throw new Error(
        getManagedSiteConfigMissingMessage(t, service.messagesKey),
      )
    }

    const resolveDuplicate = async (
      protectionBypassExecution: ProtectionBypassExecution,
    ) =>
      await resolveManagedSiteChannelMatch({
        service,
        managedConfig,
        accountBaseUrl: formData.base_url,
        models: formData.models,
        key: formData.key,
        resolveHiddenKeys: options?.resolveHiddenKeys,
        hiddenKeyChannelIds: options?.channelId
          ? [options.channelId]
          : undefined,
        protectionBypassExecution,
      })
    const resolution = options?.resolveHiddenKeys
      ? await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
          PROTECTION_BYPASS_SURFACES.Options,
          resolveDuplicate,
        )
      : await resolveDuplicate(
          createAutomaticProtectionBypassExecution(
            PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
            PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
            getCurrentTempWindowRequestSource(),
          ),
        )
    const exactMatch = getManagedSiteChannelExactMatch(
      resolution,
      service.siteType,
    )

    if (exactMatch) {
      return {
        exactDuplicateChannelName: exactMatch.name,
        advisoryWarning: null,
        assessment: toManagedSiteChannelAssessmentSignals(resolution),
      }
    }

    if (
      service.messagesKey === "newapi" &&
      resolution.searchCompleted &&
      resolution.url.matched &&
      !resolution.key.comparable
    ) {
      return {
        exactDuplicateChannelName: null,
        advisoryWarning: buildChannelDialogAdvisoryWarning(
          t,
          CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED,
          {
            assessment: toManagedSiteChannelAssessmentSignals(resolution),
          },
        ),
        assessment: toManagedSiteChannelAssessmentSignals(resolution),
      }
    }

    if (
      resolution.searchCompleted &&
      (resolution.url.matched ||
        resolution.key.matched ||
        resolution.models.matched)
    ) {
      return {
        exactDuplicateChannelName: null,
        advisoryWarning: buildChannelDialogAdvisoryWarning(
          t,
          CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.REVIEW_SUGGESTED,
          {
            assessment: toManagedSiteChannelAssessmentSignals(resolution),
          },
        ),
        assessment: toManagedSiteChannelAssessmentSignals(resolution),
      }
    }

    return {
      exactDuplicateChannelName: null,
      advisoryWarning: null,
      assessment: toManagedSiteChannelAssessmentSignals(resolution),
    }
  }

  const handleRunVerification = () => {
    if (
      !canRunManagedVerification ||
      currentAdvisoryWarning?.kind !==
        CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED
    ) {
      return
    }

    verification.openNewApiManagedVerification({
      kind: "channel",
      label: formData.name.trim() || t("channelDialog:title.add"),
      config: {
        baseUrl: newApiBaseUrl,
        userId: newApiUserId,
        username: newApiUsername,
        password: newApiPassword,
        totpSecret: newApiTotpSecret,
      },
      onVerified: async () => {
        const candidateChannelId =
          currentAdvisoryWarning.assessment?.models.channel?.id ??
          currentAdvisoryWarning.assessment?.url.channel?.id
        if (!candidateChannelId) return
        const duplicateState = await reassessDuplicateWarning({
          resolveHiddenKeys: true,
          channelId: candidateChannelId,
        })

        if (duplicateState.exactDuplicateChannelName) {
          const shouldContinue = await requestDuplicateChannelWarning({
            existingChannelName: duplicateState.exactDuplicateChannelName,
          })

          if (!shouldContinue) {
            setCurrentAdvisoryWarning(
              buildChannelDialogAdvisoryWarning(
                t,
                CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.EXACT_DUPLICATE,
                {
                  assessment: duplicateState.assessment,
                  channelName: duplicateState.exactDuplicateChannelName,
                },
              ),
            )
            return
          }
        }

        setCurrentAdvisoryWarning(duplicateState.advisoryWarning)
      },
    })
  }

  const handleRetryResourceEditLoad = () => {
    resourceEditRetryErrorRef.current = resourceEditLoadError
    retryResourceEditLoad()
  }

  const dialogTitle = isAddMode
    ? t("channelDialog:title.add")
    : isViewMode
      ? t("channelDialog:title.view")
      : t("channelDialog:title.edit")
  const dialogDescription = isAddMode
    ? t("channelDialog:description.add")
    : isViewMode
      ? t("channelDialog:description.view")
      : t("channelDialog:description.edit")

  const submitButtonLabel = isSaving
    ? isAddMode
      ? t("common:status.creating")
      : t("common:status.updating")
    : isAddMode
      ? t("channelDialog:actions.create")
      : t("channelDialog:actions.update")

  const channelTypeValue =
    formData.type === undefined || formData.type === null
      ? ""
      : String(formData.type)
  const channelTypeLabel =
    channelTypeOptions.find(
      (option) => String(option.value) === channelTypeValue,
    )?.label ?? channelTypeValue
  const statusLabel =
    formData.status === CHANNEL_STATUS.Enable
      ? t("channelDialog:fields.status.enabled")
      : formData.status === CHANNEL_STATUS.ManuallyDisabled
        ? t("channelDialog:fields.status.disabled")
        : formData.status === undefined || formData.status === null
          ? ""
          : String(formData.status)
  const detailFields = [
    {
      label: t("channelDialog:fields.type.label"),
      value: channelTypeLabel,
    },
    {
      label: t("channelDialog:fields.key.label"),
      value: formData.key ? "••••••••" : "",
    },
    {
      label: t("channelDialog:fields.baseUrl.label"),
      value: formData.base_url,
    },
    ...(!isSub2Api
      ? [
          {
            label: t("channelDialog:fields.models.label"),
            value: formData.models.join(", "),
          },
        ]
      : []),
    ...(!isOctopus && !isAxonHub && !isSub2Api
      ? [
          {
            label: t("channelDialog:fields.groups.label"),
            value: formData.groups.join(", "),
          },
          {
            label: t("channelDialog:fields.priority.label"),
            value: String(formData.priority),
          },
          {
            label: t("channelDialog:fields.weight.label"),
            value: String(formData.weight),
          },
        ]
      : []),
    {
      label: t("channelDialog:fields.status.label"),
      value: statusLabel,
    },
  ]

  return (
    <ChannelEditorShell
      isOpen={isOpen}
      onClose={onClose}
      title={dialogTitle}
      description={dialogDescription}
      closeLabel={
        isViewMode ? t("common:actions.close") : t("common:actions.cancel")
      }
      submitLabel={submitButtonLabel}
      submitTestId={CHANNEL_DIALOG_TEST_IDS.submitButton}
      showSubmit={!isViewMode}
      isSubmitDisabled={!isFormValid || isResourceEditUnavailable}
      onSubmit={isViewMode ? (event) => event.preventDefault() : handleSubmit}
      isSubmitting={isSaving}
    >
      {currentAdvisoryWarning ? (
        <Alert
          variant="warning"
          title={currentAdvisoryWarning.title}
          description={currentAdvisoryWarning.description}
          className="mb-4"
        >
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {currentAdvisoryWarning.assessment ? (
              <ManagedSiteChannelAssessmentSignalsRow
                assessment={currentAdvisoryWarning.assessment}
                managedSiteType={managedSiteType}
                className="min-w-0"
              />
            ) : null}
            {currentAdvisoryWarning.kind ===
              CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED &&
            canRunManagedVerification ? (
              <div className="sm:ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRunVerification}
                  disabled={verification.dialogState.isBusy}
                >
                  {t(
                    "channelDialog:warnings.verificationRequired.actions.verifyNow",
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </Alert>
      ) : null}
      {visibleResourceEditLoadError ? (
        <Alert
          variant="warning"
          title={t("managedSiteChannels:alerts.loadError.title")}
          description={t("managedSiteChannels:alerts.loadError.description", {
            error: visibleResourceEditLoadError.message,
          })}
          className="mb-4"
        >
          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRetryResourceEditLoad}
              loading={isResourceEditLoading}
            >
              {isResourceEditLoading
                ? t("common:status.retrying")
                : t("common:actions.retry")}
            </Button>
          </div>
        </Alert>
      ) : null}
      {isViewMode ? (
        <ManagedSiteChannelDetailView
          name={formData.name}
          fields={detailFields}
          missingValue={t("common:labels.notAvailable")}
        />
      ) : (
        <ChannelCommonFieldsBody
          t={t}
          values={{
            name: formData.name,
            type:
              formData.type === undefined || formData.type === null
                ? ""
                : String(formData.type),
            key: formData.key,
            baseURL: formData.base_url,
            models: formData.models,
            groups: formData.groups,
            priority: formData.priority,
            weight: formData.weight,
            status:
              formData.status === undefined || formData.status === null
                ? ""
                : String(formData.status),
          }}
          channelTypeOptions={channelTypeOptions.map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          availableModels={availableModels}
          availableGroups={availableGroups}
          statusOptions={[
            {
              value: String(CHANNEL_STATUS.Enable),
              label: t("channelDialog:fields.status.enabled"),
            },
            {
              value: String(CHANNEL_STATUS.ManuallyDisabled),
              label: t("channelDialog:fields.status.disabled"),
            },
          ]}
          isViewMode={isViewMode}
          isAddMode={isAddMode}
          isInteractionDisabled={isFormInteractionDisabled}
          isKeyRequired={isKeyFieldRequired}
          isBaseURLRequired={isBaseUrlRequired}
          isKeyRevealed={showKey}
          canLoadRealKey={
            !isAddMode && !isViewMode && Boolean(onRequestRealKey)
          }
          isLoadingRealKey={isLoadingRealKey}
          isLoadingModels={isLoadingModels}
          isLoadingGroups={isLoadingGroups}
          showUnknownStringType={Boolean(shouldShowUnknownStringType)}
          showGenericModelsField={shouldShowGenericModelsField}
          showGroupsField={!isOctopus && !isAxonHub && !isSub2Api}
          showPriorityAndWeight={!isOctopus && !isAxonHub && !isSub2Api}
          showModelPrefillWarning={showModelPrefillWarning}
          onNameChange={(value) => updateField("name", value)}
          onTypeChange={(value) =>
            handleTypeChange(
              isAxonHub || isClaudeCodeHub
                ? value
                : (Number(value) as ChannelType | OctopusOutboundType),
            )
          }
          onKeyChange={(value) => updateField("key", value)}
          onKeyRevealedChange={setShowKey}
          onLoadRealKey={() => void handleLoadRealKey()}
          onBaseURLChange={(value) => updateField("base_url", value)}
          onModelsChange={(models) => updateField("models", models)}
          onGroupsChange={(groups) => updateField("groups", groups)}
          onSelectAllModels={handleSelectAllModels}
          onInverseModels={handleInverseModels}
          onDeselectAllModels={handleDeselectAllModels}
          onPriorityChange={(priority) => updateField("priority", priority)}
          onWeightChange={(weight) => updateField("weight", weight)}
          onStatusChange={(status) =>
            updateField("status", Number(status) as ChannelStatus)
          }
        />
      )}

      <NewApiManagedVerificationDialog
        isOpen={verification.dialogState.isOpen}
        step={verification.dialogState.step}
        request={verification.dialogState.request}
        code={verification.dialogState.code}
        errorMessage={verification.dialogState.errorMessage}
        isBusy={verification.dialogState.isBusy}
        busyMessage={verification.dialogState.busyMessage}
        onCodeChange={verification.setCode}
        onClose={verification.closeDialog}
        onSubmit={verification.submitCode}
        onRetry={verification.retryVerification}
        onOpenSite={verification.openBaseUrl}
        onUpdateRequestConfig={verification.patchRequestConfig}
      />
    </ChannelEditorShell>
  )
}
