import { useTranslation } from "react-i18next"

import { ChannelDialogOpening } from "~/components/dialogs/ChannelDialog/components/ChannelDialogOpening"
import { ChannelEditorShell } from "~/components/dialogs/ChannelDialog/components/ChannelEditorShell"
import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Modal,
} from "~/components/ui"
import type { ManagedSiteType } from "~/constants/siteType"
import { ManagedSiteChannelDetailView } from "~/features/ManagedSiteChannels/detail/ManagedSiteChannelDetailView"
import { ManagedResourceEditorBody } from "~/features/ManagedSiteChannels/editor/ManagedResourceEditorBody"
import { MANAGED_RESOURCE_EDITOR_MODES } from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import ChannelFilterDialog from "~/features/ManagedSiteChannels/filters/ChannelFilterDialog"
import type { ManagedSiteChannelsRouteProps } from "~/features/ManagedSiteChannels/managedSiteChannelsRouteContracts"
import { ManagedSiteMigrationDialogView } from "~/features/ManagedSiteChannels/migration/ManagedSiteMigrationDialogView"
import { ManagedSiteChannelsView } from "~/features/ManagedSiteChannels/workspace/ManagedSiteChannelsView"
import { useNativeManagedSiteChannelsViewModel } from "~/features/ManagedSiteChannels/workspace/useNativeManagedSiteChannelsViewModel"
import type { ManagedResourceProductPolicy } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { type ManagedResourceRegistration } from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteMessagesKeyFromSiteType,
} from "~/services/managedSites/utils/managedSite"

const resolvePolicy = (
  siteType: ManagedSiteType,
): ManagedResourceProductPolicy | undefined =>
  getAccountSiteDefinition(siteType)?.managedResource

/** Renders a controlled failure when static native integration is incomplete. */
function ManagedSiteChannelsIntegrationFailure() {
  const { t } = useTranslation(["managedSiteChannels", "common"])

  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{t("managedSiteChannels:alerts.loadError.title")}</AlertTitle>
      <AlertDescription>
        {t("common:rootErrorBoundary.genericDescription")}
      </AlertDescription>
    </Alert>
  )
}

/** Native channels view composed from the workspace ViewModel. */
function NativeManagedSiteChannels(
  props: ManagedSiteChannelsRouteProps & {
    policy: ManagedResourceProductPolicy
    registration: ManagedResourceRegistration
  },
) {
  const { siteType, policy } = props
  const { t } = useTranslation([
    "managedSiteChannels",
    "channelDialog",
    "common",
    "messages",
    "settings",
  ])
  const {
    verificationDialog,
    isMigrationOpen,
    filterTarget,
    setFilterTarget,
    editorValues,
    setEditorValues,
    mutation,
    loadEditorSecret,
    loadEditorOptions,
    migration,
    editorPolicy,
    editorValidation,
    editorFieldIssues,
    labels,
    state,
    capabilities,
    callbacks,
    detailFields,
    pageExperience,
    handleSubmitEditor,
    migrationLabels,
  } = useNativeManagedSiteChannelsViewModel(props)
  return (
    <>
      <ManagedSiteChannelsView
        state={state}
        capabilities={capabilities}
        callbacks={callbacks}
        labels={labels}
        title={t("managedSiteChannels:title")}
        titleActions={pageExperience.titleActions}
        description={pageExperience.description}
        configurationMissingDescription={getManagedSiteConfigMissingMessage(
          t,
          getManagedSiteMessagesKeyFromSiteType(siteType),
        )}
        emptyContent={pageExperience.emptyContent}
        guidanceContent={pageExperience.guidanceContent}
        configurationSettingsTarget={policy.settingsTarget}
        siteTypeLabel={t("settings:managedSite.siteTypeLabel")}
        filterDialog={
          <ChannelFilterDialog
            channel={filterTarget}
            open={filterTarget !== null}
            onClose={() => setFilterTarget(null)}
          />
        }
      />

      {mutation.opening && mutation.opening.status !== "idle" && (
        <ChannelDialogOpening
          opening={mutation.opening}
          onClose={
            mutation.opening.mode === "view"
              ? mutation.closeDetail
              : mutation.closeEditor
          }
          onRetry={mutation.retryOpening}
        />
      )}
      {mutation.editor && mutation.editorMode && editorPolicy ? (
        <ChannelEditorShell
          isOpen
          title={
            mutation.editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
              ? t("channelDialog:title.add")
              : t("channelDialog:title.edit")
          }
          description={
            mutation.editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
              ? t("channelDialog:description.add")
              : t("channelDialog:description.edit")
          }
          onClose={mutation.closeEditor}
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmitEditor()
          }}
          submitLabel={
            mutation.editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
              ? t("channelDialog:actions.create")
              : t("channelDialog:actions.update")
          }
          closeLabel={t("common:actions.cancel")}
          submitTestId={CHANNEL_DIALOG_TEST_IDS.submitButton}
          isSubmitting={mutation.isSaving}
          isSubmitDisabled={editorValidation?.valid === false}
          noValidate
        >
          <ManagedResourceEditorBody
            t={t}
            mode={mutation.editorMode}
            descriptors={mutation.editor.fields}
            policy={editorPolicy}
            values={editorValues}
            fieldIssues={editorFieldIssues}
            disabled={mutation.isSaving}
            onLoadSecret={
              mutation.editor.loadSecret ? loadEditorSecret : undefined
            }
            onLoadOptions={
              mutation.editor.loadOptions ? loadEditorOptions : undefined
            }
            onValueChange={(fieldId, value) =>
              setEditorValues((current) => ({
                ...current,
                [fieldId]: value,
              }))
            }
          />
        </ChannelEditorShell>
      ) : null}

      <Modal
        isOpen={Boolean(mutation.detail)}
        title={t("channelDialog:title.view")}
        onClose={mutation.closeDetail}
        footer={
          <Button type="button" onClick={mutation.closeDetail}>
            {t("common:actions.close")}
          </Button>
        }
      >
        {mutation.detail ? (
          <ManagedSiteChannelDetailView
            name={mutation.detail.name}
            fields={detailFields}
            missingValue={t("common:labels.notAvailable")}
          />
        ) : null}
      </Modal>

      {verificationDialog}

      <ManagedSiteMigrationDialogView
        isOpen={isMigrationOpen}
        selectedTarget={migration.selectedTarget}
        targets={migration.targets}
        preview={migration.preview}
        result={migration.result}
        labels={migrationLabels}
        isConfirmationOpen={migration.isConfirmationOpen}
        isRunning={migration.isRunning}
        isRecoveryRunning={migration.isRecoveryRunning}
        refreshRequired={migration.refreshRequired}
        callbacks={migration.callbacks}
      />
    </>
  )
}

/** Selects one static managed-resource controller mode for the options route. */
export function ManagedSiteChannelsRoute({
  siteType,
  refreshKey,
  routeParams,
  onReplaceRouteQuery,
}: ManagedSiteChannelsRouteProps) {
  const policy = resolvePolicy(siteType)

  if (!policy) return <ManagedSiteChannelsIntegrationFailure />

  const registration = getManagedResourceRegistration(
    siteType,
    policy.primaryKind,
  )
  if (!registration) return <ManagedSiteChannelsIntegrationFailure />

  return (
    <NativeManagedSiteChannels
      key={siteType}
      siteType={siteType}
      refreshKey={refreshKey}
      routeParams={routeParams}
      onReplaceRouteQuery={onReplaceRouteQuery}
      policy={policy}
      registration={registration}
    />
  )
}
