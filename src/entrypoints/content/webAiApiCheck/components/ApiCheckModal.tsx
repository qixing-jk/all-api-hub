import { XMarkIcon } from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import type {
  KeyboardEvent as ReactKeyboardEvent,
  RefCallback,
  RefObject,
} from "react"

import {
  Button,
  IconButton,
  Input,
  Notice,
  SearchableSelect,
  Textarea,
} from "~/components/ui"
import { inputVariants } from "~/components/ui/input"
import { cn } from "~/lib/utils"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"

import { WEB_AI_API_CHECK_TEST_IDS } from "../testIds"
import { ApiCheckBaseUrlHistoryPicker } from "./ApiCheckBaseUrlHistoryPicker"
import { ApiCheckCandidateButtons } from "./ApiCheckCandidateButtons"
import { ApiCheckProbeList } from "./ApiCheckProbeList"
import type {
  ApiCheckModalActions,
  ApiCheckModalViewModel,
} from "./useApiCheckModalViewModel"

type ApiCheckModalProps = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  view: ApiCheckModalViewModel
  actions: ApiCheckModalActions
  refs: {
    popoverPortalContainerRef: RefCallback<HTMLDivElement>
    backdropRef: RefObject<HTMLDivElement | null>
    dialogRef: RefObject<HTMLDivElement | null>
    scrollContainerRef: RefObject<HTMLDivElement | null>
  }
}

const stopHostPageKeyboardShortcuts = (
  event: ReactKeyboardEvent<HTMLElement>,
) => {
  event.stopPropagation()
}

/**
 * Pure UI shell for the content-script API check modal.
 */
export function ApiCheckModal({ t, view, actions, refs }: ApiCheckModalProps) {
  if (!view.isOpen) return null

  return (
    <div
      data-testid={WEB_AI_API_CHECK_TEST_IDS.modal}
      className="pointer-events-none fixed inset-0 z-2147483647"
    >
      <div
        ref={refs.popoverPortalContainerRef}
        data-slot="api-check-portal-container"
        className="pointer-events-auto"
      />
      <div
        ref={refs.backdropRef}
        data-testid={WEB_AI_API_CHECK_TEST_IDS.backdrop}
        className="pointer-events-auto absolute inset-0 bg-black/40"
        onClick={() => {
          if (!view.canClose) return
          actions.close()
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
        <div
          ref={refs.dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="api-check-modal-title"
          tabIndex={-1}
          className="border-border bg-background pointer-events-auto max-h-[90vh] w-full max-w-[860px] overflow-hidden rounded-lg border shadow-xl"
          onKeyDown={stopHostPageKeyboardShortcuts}
          onKeyUp={stopHostPageKeyboardShortcuts}
        >
          <div className="border-border flex items-start justify-between gap-3 border-b p-4">
            <div className="min-w-0">
              <div
                id="api-check-modal-title"
                className="text-foreground text-base font-semibold"
              >
                {t("webAiApiCheck:modal.title")}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {t("webAiApiCheck:modal.privacyHint")}
              </div>
            </div>
            <IconButton
              aria-label={t("common:actions.close")}
              variant="ghost"
              size="sm"
              onClick={actions.close}
              disabled={!view.canClose}
            >
              <XMarkIcon className="h-4 w-4" />
            </IconButton>
          </div>

          <div
            ref={refs.scrollContainerRef}
            className="max-h-[calc(90vh-64px)] overflow-y-auto overscroll-contain p-4"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-foreground text-sm font-medium">
                  {t("webAiApiCheck:modal.sourceText.label")}
                </div>
                <Textarea
                  value={view.sourceText}
                  onChange={(e) => actions.setSourceText(e.target.value)}
                  rows={4}
                  placeholder={t("webAiApiCheck:modal.sourceText.placeholder")}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.baseUrl")}
                  </div>
                  <Input
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
                    candidates={
                      view.extractionMetadata?.candidates.baseUrls ?? []
                    }
                    currentValue={view.baseUrl}
                    onSelect={actions.updateBaseUrl}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.apiKey")}
                  </div>
                  <Input
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
                    candidates={
                      view.extractionMetadata?.candidates.apiKeys ?? []
                    }
                    currentValue={view.apiKey}
                    onSelect={actions.setApiKey}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.apiType")}
                  </div>
                  <select
                    className={cn(inputVariants({}), "dark:bg-input/30 h-9")}
                    value={view.apiType}
                    onChange={(e) =>
                      actions.setApiType(
                        e.target.value as ApiVerificationApiType,
                      )
                    }
                    disabled={view.isRunningAll}
                  >
                    {view.apiTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.modelId")}
                  </div>

                  <SearchableSelect
                    aria-label={t("webAiApiCheck:modal.fields.modelId")}
                    data-testid={WEB_AI_API_CHECK_TEST_IDS.modelId}
                    options={view.modelIdsOptions}
                    value={view.modelId}
                    onChange={actions.setModelId}
                    portalContainer={view.popoverPortalContainer ?? undefined}
                    placeholder={
                      view.isFetchingModels
                        ? t("webAiApiCheck:modal.actions.fetchingModels")
                        : "gpt-4o-mini"
                    }
                    allowCustomValue
                  />
                </div>
              </div>

              {view.validationError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  {view.validationError}
                </div>
              ) : null}

              {!view.hasAnyResult ? (
                <div className="text-muted-foreground text-xs">
                  {t("webAiApiCheck:modal.hints.saveWithoutTest")}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {view.modelListSupported ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={actions.fetchModels}
                    disabled={!view.canFetchModels}
                  >
                    {view.isFetchingModels
                      ? t("webAiApiCheck:modal.actions.fetchingModels")
                      : t("webAiApiCheck:modal.actions.fetchModels")}
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant={view.isRunningAll ? "outline" : "default"}
                  onClick={
                    view.isRunningAll ? actions.stopRunAll : actions.runAll
                  }
                  disabled={view.isRunAllActionDisabled}
                >
                  {view.isRunningAll
                    ? view.isStoppingRunAll
                      ? t("webAiApiCheck:modal.actions.stopping")
                      : t("webAiApiCheck:modal.actions.stopTest")
                    : t("webAiApiCheck:modal.actions.test")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  data-testid={WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton}
                  onClick={actions.saveProfile}
                  disabled={!view.canSaveProfile}
                >
                  {view.isSavingProfile
                    ? t("webAiApiCheck:modal.actions.saving")
                    : t("webAiApiCheck:modal.actions.saveToProfiles")}
                </Button>
              </div>

              {view.fetchModelsError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  {view.fetchModelsError}
                </div>
              ) : null}

              {view.testStoppedMessage ? (
                <Notice tone="warning" description={view.testStoppedMessage} />
              ) : null}

              <ApiCheckProbeList
                t={t}
                probes={view.probes}
                isRunningAll={view.isRunningAll}
                isFetchingModels={view.isFetchingModels}
                onRunProbe={actions.runProbe}
                onStopProbe={actions.stopProbe}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
