import type { TFunction } from "i18next"

import { RefreshActionIcon } from "~/components/icons/productIcons"
import {
  CollapsibleSection,
  IconButton,
  Input,
  SearchableSelect,
} from "~/components/ui"
import { getSelectFetchResult } from "~/components/ui/SelectFetchFeedback"
import { VerificationConfigSection } from "~/features/Verification/api/VerificationConfigSection"
import {
  VerificationRequestProfileEnhancement,
  VerificationRequestProfileSelect,
} from "~/features/Verification/api/VerificationRequestProfile"
import { ApiCheckBaseUrlHistoryPicker } from "~/features/WebAiApiCheck/content/history/ApiCheckBaseUrlHistoryPicker"
import { ApiCheckCandidateButtons } from "~/features/WebAiApiCheck/content/modal/ApiCheckCandidateButtons"
import type {
  ApiCheckModalActions,
  ApiCheckModalViewModel,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/features/WebAiApiCheck/content/testIds"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_REQUEST_PROFILES,
  MODEL_TEST_MODALITIES,
  type ApiVerificationApiType,
  type ApiVerificationMode,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationModeLabel } from "~/services/verification/aiApiVerification/i18n"

/** Request credentials, model discovery and protocol options. */
export function ApiCheckRequestConfiguration({
  t,
  view,
  actions,
  preparing,
}: {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  view: Pick<
    ApiCheckModalViewModel,
    | "apiKey"
    | "apiKeyVisible"
    | "apiType"
    | "apiTypeOptions"
    | "baseUrl"
    | "baseUrlHistorySuggestions"
    | "canClose"
    | "canFetchModels"
    | "extractionMetadata"
    | "fetchModelsError"
    | "fetchedModelCount"
    | "isAnyProbeRunning"
    | "isBaseUrlHistoryPickerOpen"
    | "isFetchingModels"
    | "isRunningAll"
    | "modelId"
    | "modelIdsOptions"
    | "modelListSupported"
    | "modelModality"
    | "popoverPortalContainer"
    | "requestProfile"
    | "requestProfileEnhanced"
    | "verificationMode"
    | "verificationTools"
  >
  actions: Pick<
    ApiCheckModalActions,
    | "fetchModels"
    | "removeBaseUrlHistory"
    | "selectBaseUrlHistory"
    | "setApiKey"
    | "setApiKeyVisible"
    | "setApiType"
    | "setIsBaseUrlHistoryPickerOpen"
    | "setModelId"
    | "setRequestProfile"
    | "setRequestProfileEnhanced"
    | "setVerificationMode"
    | "updateBaseUrl"
  >
  preparing: boolean
}) {
  return (
    <VerificationConfigSection
      running={
        view.isRunningAll ||
        view.isAnyProbeRunning ||
        view.verificationTools.isRunning
      }
    >
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-density-1-5">
          <label
            htmlFor="api-check-base-url"
            className="block text-xs text-muted-foreground"
          >
            {t("webAiApiCheck:modal.fields.baseUrl")}
          </label>
          <Input
            id="api-check-base-url"
            value={view.baseUrl}
            onChange={(e) => actions.updateBaseUrl(e.target.value)}
            placeholder="https://example.com/api"
            rightIcon={
              <ApiCheckBaseUrlHistoryPicker
                t={t}
                isOpen={view.isBaseUrlHistoryPickerOpen}
                onOpenChange={actions.setIsBaseUrlHistoryPickerOpen}
                suggestions={view.baseUrlHistorySuggestions}
                selectedBaseUrl={view.baseUrl}
                portalContainer={view.popoverPortalContainer}
                onSelect={actions.selectBaseUrlHistory}
                onRemove={actions.removeBaseUrlHistory}
              />
            }
          />
          <ApiCheckCandidateButtons
            t={t}
            kind="baseUrl"
            candidates={view.extractionMetadata?.candidates.baseUrls ?? []}
            currentValue={view.baseUrl}
            onSelect={actions.updateBaseUrl}
          />
        </div>

        <div className="space-y-density-1-5">
          <label
            htmlFor="api-check-api-key"
            className="block text-xs text-muted-foreground"
          >
            {t("webAiApiCheck:modal.fields.apiKey")}
          </label>
          <Input
            id="api-check-api-key"
            type="password"
            revealable
            revealed={view.apiKeyVisible}
            onRevealedChange={actions.setApiKeyVisible}
            revealLabels={{
              show: t("webAiApiCheck:modal.actions.showKey"),
              hide: t("webAiApiCheck:modal.actions.hideKey"),
            }}
            value={view.apiKey}
            onChange={(e) => actions.setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <ApiCheckCandidateButtons
            t={t}
            kind="apiKey"
            candidates={view.extractionMetadata?.candidates.apiKeys ?? []}
            currentValue={view.apiKey}
            onSelect={actions.setApiKey}
          />
        </div>

        <div hidden={preparing} className="space-y-3">
          <div className="space-y-density-1-5">
            <label
              htmlFor="api-check-api-type"
              className="block text-xs text-muted-foreground"
            >
              {t("webAiApiCheck:modal.fields.apiType")}
            </label>
            <SearchableSelect
              id="api-check-api-type"
              aria-label={t("webAiApiCheck:modal.fields.apiType")}
              options={view.apiTypeOptions}
              value={view.apiType}
              onChange={(value) =>
                actions.setApiType(value as ApiVerificationApiType)
              }
              disabled={!view.canClose}
              portalContainer={view.popoverPortalContainer ?? undefined}
            />
          </div>

          <div className="space-y-density-1-5">
            <label
              htmlFor="api-check-model-id"
              className="block text-xs text-muted-foreground"
            >
              {t("webAiApiCheck:modal.fields.modelId")}
            </label>

            <SearchableSelect
              id="api-check-model-id"
              aria-label={t("webAiApiCheck:modal.fields.modelId")}
              data-testid={WEB_AI_API_CHECK_TEST_IDS.modelId}
              options={view.modelIdsOptions}
              value={view.modelId}
              onChange={actions.setModelId}
              portalContainer={view.popoverPortalContainer ?? undefined}
              placeholder="gpt-4o-mini"
              loading={view.isFetchingModels}
              fetchResult={getSelectFetchResult(
                view.fetchModelsError,
                view.fetchedModelCount,
              )}
              emptyMessage={
                view.modelListSupported &&
                view.modelIdsOptions.length === 0 &&
                (view.isFetchingModels ||
                  view.fetchedModelCount !== null ||
                  Boolean(view.fetchModelsError))
                  ? null
                  : undefined
              }
              searchActions={
                view.modelListSupported ? (
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label={
                      view.isFetchingModels
                        ? t("webAiApiCheck:modal.actions.fetchingModels")
                        : t("webAiApiCheck:modal.actions.fetchModels")
                    }
                    onClick={actions.fetchModels}
                    disabled={!view.canFetchModels}
                    loading={view.isFetchingModels}
                    disableAutoTooltip
                  >
                    <RefreshActionIcon className="size-4" />
                  </IconButton>
                ) : null
              }
              allowCustomValue
            />
          </div>
          {view.modelModality === MODEL_TEST_MODALITIES.Text ? (
            <div className="space-y-density-1-5">
              <label
                htmlFor="api-check-verification-mode"
                className="block text-xs text-muted-foreground"
              >
                {t("aiApiVerification:verifyDialog.meta.mode")}
              </label>
              <SearchableSelect
                id="api-check-verification-mode"
                aria-label={t("aiApiVerification:verifyDialog.meta.mode")}
                options={Object.values(API_VERIFICATION_MODES).map((mode) => ({
                  value: mode,
                  label: getApiVerificationModeLabel(t, mode),
                }))}
                value={view.verificationMode}
                onChange={(value) =>
                  actions.setVerificationMode(value as ApiVerificationMode)
                }
                disabled={!view.canClose}
                portalContainer={view.popoverPortalContainer ?? undefined}
              />
            </div>
          ) : null}

          <div>
            <VerificationRequestProfileSelect
              value={view.requestProfile}
              apiType={view.apiType}
              onChange={actions.setRequestProfile}
              disabled={!view.canClose}
              portalContainer={view.popoverPortalContainer ?? undefined}
            />
          </div>

          {view.requestProfile !== API_VERIFICATION_REQUEST_PROFILES.Default ? (
            <CollapsibleSection
              title={t(
                "aiApiVerification:verifyDialog.requestProfiles.enhancedLabel",
              )}
              defaultOpen={view.requestProfileEnhanced}
              className="sm:col-span-2"
              buttonClassName="border-border-subtle border px-3 py-2"
            >
              <VerificationRequestProfileEnhancement
                value={view.requestProfileEnhanced}
                onChange={actions.setRequestProfileEnhanced}
                disabled={!view.canClose}
              />
            </CollapsibleSection>
          ) : null}

          {(view.modelModality === MODEL_TEST_MODALITIES.Image ||
            view.modelModality === MODEL_TEST_MODALITIES.Video) && (
            <div className="rounded-md border border-warning-border bg-warning-soft px-3 py-density-2 text-xs text-warning-soft-foreground">
              {view.modelModality === MODEL_TEST_MODALITIES.Image
                ? t("aiApiVerification:verifyDialog.modalityNotice.image")
                : t("aiApiVerification:verifyDialog.modalityNotice.video")}
            </div>
          )}
        </div>
      </div>
    </VerificationConfigSection>
  )
}
