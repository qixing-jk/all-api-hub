import { KeyRound, Pencil, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import {
  ActionGroup,
  Button,
  DatePicker,
  FormField,
  Input,
  SearchableSelect,
  Textarea,
} from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import type { ApiCredentialProfileDialogProps } from "~/features/ApiCredentialProfiles/editor/apiCredentialProfileDialogContracts"
import { ApiCredentialRequestHeaderFields } from "~/features/ApiCredentialProfiles/editor/ApiCredentialRequestHeaderFields"
import { ApiCredentialTelemetryFields } from "~/features/ApiCredentialProfiles/editor/ApiCredentialTelemetryFields"
import { useApiCredentialProfileEditor } from "~/features/ApiCredentialProfiles/editor/useApiCredentialProfileEditor"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "~/features/ApiCredentialProfiles/testIds"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"

const dialogSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog
/**
 * Add/edit modal for API credential profiles.
 */
export function ApiCredentialProfileDialog({
  isOpen,
  onClose,
  profile,
  addPrefill,
  tags,
  createTag,
  renameTag,
  deleteTag,
  onSave,
}: ApiCredentialProfileDialogProps) {
  const { t, i18n } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
    "keyManagement",
  ])

  const editor = useApiCredentialProfileEditor({
    isOpen,
    onClose,
    profile,
    addPrefill,
    onSave,
  })
  const {
    isEditMode,
    normalizedBaseUrlPreview,
    dialogTitle,
    name,
    setName,
    apiType,
    setApiType,
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    tagIds,
    setTagIds,
    notes,
    setNotes,
    sourceUrl,
    setSourceUrl,
    expiresAtInput,
    setExpiresAtInput,
    isSaving,
    errors,
    handleClose,
    handleSave,
  } = editor

  const nameInputId = "api-credential-profile-name"
  const baseUrlInputId = "api-credential-profile-baseUrl"
  const apiKeyInputId = "api-credential-profile-apiKey"
  const notesInputId = "api-credential-profile-notes"
  const sourceUrlInputId = "api-credential-profile-sourceUrl"
  const expiresAtInputId = "api-credential-profile-expiresAt"
  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}
      surfaceId={dialogSurface}
    >
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdropClick={!isSaving}
        closeOnEsc={!isSaving}
        showCloseButton={!isSaving}
        size="lg"
        title={dialogTitle}
        panelTestId={API_CREDENTIAL_PROFILES_TEST_IDS.dialog}
        header={
          <div className="gap-y-density-3 flex min-w-0 items-center gap-x-3">
            {isEditMode ? (
              <Pencil className="text-theme-600 dark:text-theme-400 h-5 w-5" />
            ) : (
              <Plus className="text-theme-600 dark:text-theme-400 h-5 w-5" />
            )}
            <h2 className="text-foreground truncate text-lg font-semibold">
              {dialogTitle}
            </h2>
          </div>
        }
        footer={
          <ActionGroup>
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={isSaving}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              loading={isSaving}
              data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.dialogSaveButton}
            >
              {isSaving ? t("common:status.saving") : t("common:actions.save")}
            </Button>
          </ActionGroup>
        }
      >
        <div className="space-y-density-4">
          <FormField
            label={t("apiCredentialProfiles:dialog.fields.name")}
            required
            error={errors.name}
            htmlFor={nameInputId}
          >
            <Input
              id={nameInputId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("apiCredentialProfiles:dialog.placeholders.name")}
            />
          </FormField>

          <FormField label={t("aiApiVerification:verifyDialog.meta.apiType")}>
            <SearchableSelect
              options={[
                {
                  value: API_TYPES.OPENAI_COMPATIBLE,
                  label: t(
                    "aiApiVerification:verifyDialog.apiTypes.openaiCompatible",
                  ),
                },
                {
                  value: API_TYPES.OPENAI,
                  label: t("aiApiVerification:verifyDialog.apiTypes.openai"),
                },
                {
                  value: API_TYPES.ANTHROPIC,
                  label: t("aiApiVerification:verifyDialog.apiTypes.anthropic"),
                },
                {
                  value: API_TYPES.GOOGLE,
                  label: t("aiApiVerification:verifyDialog.apiTypes.google"),
                },
              ]}
              value={apiType}
              onChange={(value) => setApiType(value as ApiVerificationApiType)}
              placeholder={t(
                "aiApiVerification:verifyDialog.meta.apiTypePlaceholder",
              )}
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label={t("apiCredentialProfiles:dialog.fields.baseUrl")}
            required
            error={errors.baseUrl}
            htmlFor={baseUrlInputId}
            description={
              normalizedBaseUrlPreview
                ? t("apiCredentialProfiles:dialog.hints.baseUrlNormalized", {
                    baseUrl: normalizedBaseUrlPreview,
                  })
                : undefined
            }
          >
            <Input
              id={baseUrlInputId}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t(
                "apiCredentialProfiles:dialog.placeholders.baseUrl",
              )}
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label={t("apiCredentialProfiles:dialog.fields.apiKey")}
            required
            error={errors.apiKey}
            htmlFor={apiKeyInputId}
          >
            <Input
              id={apiKeyInputId}
              type="password"
              revealable
              revealLabels={{
                show: t("keyManagement:actions.showKey"),
                hide: t("keyManagement:actions.hideKey"),
              }}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t(
                "apiCredentialProfiles:dialog.placeholders.apiKey",
              )}
              disabled={isSaving}
              leftIcon={<KeyRound className="h-5 w-5" />}
            />
          </FormField>

          {!isEditMode && addPrefill?.apiKeyCreateUrl ? (
            <div className="border-primary-soft-border bg-primary-soft py-density-3 rounded-md border px-3 text-sm">
              <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-theme-800 dark:text-theme-200">
                  {addPrefill.apiKeyCreateHint ??
                    t("apiCredentialProfiles:dialog.hints.apiKeyCreateUrl")}
                </p>
                <Button asChild variant="secondary" size="sm">
                  <a
                    href={addPrefill.apiKeyCreateUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t(
                      "apiCredentialProfiles:dialog.actions.openApiKeyCreateUrl",
                    )}
                    <WorkflowTransitionIcon
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  </a>
                </Button>
              </div>
            </div>
          ) : null}

          <FormField
            label={t("apiCredentialProfiles:dialog.fields.tags")}
            description={t("apiCredentialProfiles:dialog.hints.tags")}
          >
            <TagPicker
              tags={tags}
              selectedTagIds={tagIds}
              onSelectedTagIdsChange={setTagIds}
              onCreateTag={createTag}
              onRenameTag={renameTag}
              onDeleteTag={deleteTag}
              placeholder={t("apiCredentialProfiles:dialog.placeholders.tags")}
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label={t("apiCredentialProfiles:dialog.fields.notes")}
            htmlFor={notesInputId}
          >
            <Textarea
              id={notesInputId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("apiCredentialProfiles:dialog.placeholders.notes")}
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label={t("apiCredentialProfiles:dialog.fields.sourceUrl")}
            description={t("apiCredentialProfiles:dialog.hints.sourceUrl")}
            htmlFor={sourceUrlInputId}
          >
            <Input
              id={sourceUrlInputId}
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={t(
                "apiCredentialProfiles:dialog.placeholders.sourceUrl",
              )}
              disabled={isSaving}
            />
          </FormField>

          <FormField
            label={t("apiCredentialProfiles:dialog.fields.expiresAt")}
            description={t("apiCredentialProfiles:dialog.hints.expiresAt")}
            htmlFor={expiresAtInputId}
          >
            <DatePicker
              id={expiresAtInputId}
              value={expiresAtInput}
              onChange={setExpiresAtInput}
              labels={{
                trigger: t("apiCredentialProfiles:dialog.fields.expiresAt"),
                placeholder: t("common:datePicker.placeholder"),
                noExpiration: t("common:datePicker.noExpiration"),
                in7Days: t("common:datePicker.in7Days"),
                in30Days: t("common:datePicker.in30Days"),
                in90Days: t("common:datePicker.in90Days"),
                in1Year: t("common:datePicker.in1Year"),
                naturalInput: {
                  invalid: t("common:datePicker.naturalInput.invalid"),
                  label: t("common:datePicker.naturalInput.label"),
                  openCalendar: t(
                    "common:datePicker.naturalInput.openCalendar",
                  ),
                  placeholder: t("common:datePicker.naturalInput.placeholder"),
                  preview: t("common:datePicker.naturalInput.preview"),
                },
              }}
              language={i18n.language}
              disabled={isSaving}
              naturalInput
            />
          </FormField>

          <ApiCredentialTelemetryFields editor={editor} />

          <ApiCredentialRequestHeaderFields editor={editor} />

          <div className="text-muted-foreground text-xs">
            {t("apiCredentialProfiles:dialog.meta.apiTypeHint", {
              apiType: getApiVerificationApiTypeLabel(t, apiType),
            })}
          </div>
        </div>
      </Modal>
    </ProductAnalyticsScope>
  )
}
