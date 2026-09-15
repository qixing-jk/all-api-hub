import { MousePointerClick, ShieldCheck } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  FormField,
  Input,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import {
  BROWSER_CHECK_IN_ACTION_KINDS,
  BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS,
  BROWSER_CHECK_IN_MAX_TIMEOUT_MS,
  BROWSER_CHECK_IN_MIN_TIMEOUT_MS,
  type BrowserCheckInAction,
  type BrowserCheckInConfig,
} from "~/types/checkinAutomation"

const SUCCESS_CONDITION_KINDS = {
  Selector: "selector",
  Text: "text",
  Url: "url",
} as const

type SuccessConditionKind =
  (typeof SUCCESS_CONDITION_KINDS)[keyof typeof SUCCESS_CONDITION_KINDS]

interface BrowserCheckInConfigFieldsProps {
  config: BrowserCheckInConfig | undefined
  onChange: (config: BrowserCheckInConfig) => void
}

const createDefaultConfig = (): BrowserCheckInConfig => ({
  enabled: false,
  action: { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad },
  success: {},
  timeoutMs: BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS,
})

/** Selects the first configured success condition for the compact form editor. */
function getSuccessConditionKind(
  config: BrowserCheckInConfig,
): SuccessConditionKind {
  if (config.success.selector !== undefined) {
    return SUCCESS_CONDITION_KINDS.Selector
  }
  if (config.success.textPattern !== undefined) {
    return SUCCESS_CONDITION_KINDS.Text
  }
  if (config.success.urlPattern !== undefined) {
    return SUCCESS_CONDITION_KINDS.Url
  }
  return SUCCESS_CONDITION_KINDS.Selector
}

/** Reads the value associated with the selected success-condition kind. */
function getSuccessConditionValue(
  config: BrowserCheckInConfig,
  kind: SuccessConditionKind,
): string {
  if (kind === SUCCESS_CONDITION_KINDS.Selector) {
    return config.success.selector ?? ""
  }
  if (kind === SUCCESS_CONDITION_KINDS.Text) {
    return config.success.textPattern ?? ""
  }
  return config.success.urlPattern ?? ""
}

/** Returns the action kind used by the controlled action selector. */
function getActionKind(action: BrowserCheckInAction): string {
  return action.kind
}

/** Renders the bounded, declarative browser check-in configuration form. */
export function BrowserCheckInConfigFields({
  config,
  onChange,
}: BrowserCheckInConfigFieldsProps) {
  const { t } = useTranslation("accountDialog")
  const currentConfig = config ?? createDefaultConfig()
  const successConditionKind = getSuccessConditionKind(currentConfig)
  const successConditionValue = getSuccessConditionValue(
    currentConfig,
    successConditionKind,
  )
  const identityEnabled = currentConfig.identity !== undefined
  const isConditionComplete = successConditionValue.trim().length > 0

  const actionDescription = useMemo(() => {
    switch (currentConfig.action.kind) {
      case BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector:
        return t("form.browserAutomationActionClickSelector")
      case BROWSER_CHECK_IN_ACTION_KINDS.ClickText:
        return t("form.browserAutomationActionClickText")
      default:
        return t("form.browserAutomationActionPageLoad")
    }
  }, [currentConfig.action.kind, t])

  const updateConfig = (patch: Partial<BrowserCheckInConfig>) => {
    onChange({ ...currentConfig, ...patch })
  }

  const updateAction = (kind: string) => {
    if (kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector) {
      updateConfig({
        action: {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector,
          selector: "",
        },
      })
      return
    }
    if (kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickText) {
      updateConfig({
        action: {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickText,
          textPattern: "",
        },
      })
      return
    }
    updateConfig({ action: { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad } })
  }

  const updateSuccessCondition = (
    kind: SuccessConditionKind,
    value: string,
  ) => {
    updateConfig({
      success:
        kind === SUCCESS_CONDITION_KINDS.Selector
          ? { selector: value }
          : kind === SUCCESS_CONDITION_KINDS.Text
            ? { textPattern: value }
            : { urlPattern: value },
    })
  }

  const updateIdentity = (enabled: boolean) => {
    updateConfig({
      identity: enabled
        ? currentConfig.identity ?? { selector: "", textPattern: "" }
        : undefined,
    })
  }

  const timeoutValue =
    currentConfig.timeoutMs ?? BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS

  return (
    <div className="border-theme-300 dark:border-theme-700 space-y-3 border-l-2 pl-3">
      <div className="flex items-start gap-2">
        <MousePointerClick className="text-theme-600 dark:text-theme-400 mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">
            {t("form.browserAutomationTitle")}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("form.browserAutomationDescription")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="account-browser-check-in-enabled"
            className="text-secondary-foreground text-sm font-medium"
          >
            {t("form.browserAutomationEnabled")}
          </label>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("form.browserAutomationEnabledDesc")}
          </p>
        </div>
        <Switch
          id="account-browser-check-in-enabled"
          checked={currentConfig.enabled}
          onChange={(enabled) => updateConfig({ enabled })}
          className="shrink-0"
        />
      </div>

      <Notice
        tone="info"
        title={t("form.browserAutomationSafetyTitle")}
        description={t("form.browserAutomationSafetyDesc")}
      />

      <FormField
        label={t("form.browserAutomationAction")}
        description={actionDescription}
        htmlFor="account-browser-check-in-action"
      >
        <Select
          value={getActionKind(currentConfig.action)}
          onValueChange={updateAction}
        >
          <SelectTrigger id="account-browser-check-in-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BROWSER_CHECK_IN_ACTION_KINDS.PageLoad}>
              {t("form.browserAutomationActionPageLoad")}
            </SelectItem>
            <SelectItem value={BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector}>
              {t("form.browserAutomationActionClickSelector")}
            </SelectItem>
            <SelectItem value={BROWSER_CHECK_IN_ACTION_KINDS.ClickText}>
              {t("form.browserAutomationActionClickText")}
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {currentConfig.action.kind ===
        BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector && (
        <FormField label={t("form.browserAutomationSelector")}>
          <Input
            value={currentConfig.action.selector}
            onChange={(event) =>
              updateConfig({
                action: {
                  kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector,
                  selector: event.target.value,
                },
              })
            }
            placeholder="#check-in-button"
            maxLength={500}
          />
        </FormField>
      )}

      {currentConfig.action.kind ===
        BROWSER_CHECK_IN_ACTION_KINDS.ClickText && (
        <>
          <FormField label={t("form.browserAutomationTextPattern")}>
            <Input
              value={currentConfig.action.textPattern}
              onChange={(event) =>
                updateConfig({
                  action: {
                    kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickText,
                    textPattern: event.target.value,
                  },
                })
              }
              placeholder="签到|check\\s*in"
              maxLength={200}
            />
          </FormField>
          <FormField
            label={t("form.browserAutomationCandidateSelector")}
            description={t("form.browserAutomationCandidateSelectorDesc")}
          >
            <Input
              value={currentConfig.action.candidateSelector ?? ""}
              onChange={(event) =>
                updateConfig({
                  action: {
                    kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickText,
                    candidateSelector: event.target.value || undefined,
                    textPattern:
                      currentConfig.action.kind ===
                      BROWSER_CHECK_IN_ACTION_KINDS.ClickText
                        ? currentConfig.action.textPattern
                        : "",
                  },
                })
              }
              placeholder={'button, a, [role="button"]'}
              maxLength={500}
            />
          </FormField>
        </>
      )}

      <FormField
        label={t("form.browserAutomationSuccessCondition")}
        description={
          isConditionComplete
            ? t("form.browserAutomationSuccessConditionDesc")
            : t("form.browserAutomationInvalid")
        }
        htmlFor="account-browser-check-in-success-kind"
      >
        <Select
          value={successConditionKind}
          onValueChange={(kind) =>
            updateSuccessCondition(kind as SuccessConditionKind, "")
          }
        >
          <SelectTrigger id="account-browser-check-in-success-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SUCCESS_CONDITION_KINDS.Selector}>
              {t("form.browserAutomationSuccessSelector")}
            </SelectItem>
            <SelectItem value={SUCCESS_CONDITION_KINDS.Text}>
              {t("form.browserAutomationSuccessText")}
            </SelectItem>
            <SelectItem value={SUCCESS_CONDITION_KINDS.Url}>
              {t("form.browserAutomationSuccessUrl")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={successConditionValue}
          onChange={(event) =>
            updateSuccessCondition(successConditionKind, event.target.value)
          }
          placeholder={
            successConditionKind === SUCCESS_CONDITION_KINDS.Selector
              ? ".success"
              : successConditionKind === SUCCESS_CONDITION_KINDS.Text
                ? "签到成功|already checked"
                : "/check-in/success"
          }
          maxLength={
            successConditionKind === SUCCESS_CONDITION_KINDS.Selector
              ? 500
              : 200
          }
        />
      </FormField>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="account-browser-check-in-identity-enabled"
            className="text-secondary-foreground text-sm font-medium"
          >
            {t("form.browserAutomationIdentityEnabled")}
          </label>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("form.browserAutomationIdentityEnabledDesc")}
          </p>
        </div>
        <Switch
          id="account-browser-check-in-identity-enabled"
          checked={identityEnabled}
          onChange={updateIdentity}
          className="shrink-0"
        />
      </div>

      {identityEnabled && currentConfig.identity && (
        <>
          <FormField label={t("form.browserAutomationIdentitySelector")}>
            <Input
              value={currentConfig.identity.selector}
              onChange={(event) =>
                updateConfig({
                  identity: {
                    ...currentConfig.identity!,
                    selector: event.target.value,
                  },
                })
              }
              placeholder=".account-name"
              maxLength={500}
            />
          </FormField>
          <FormField label={t("form.browserAutomationIdentityPattern")}>
            <Input
              value={currentConfig.identity.textPattern}
              onChange={(event) =>
                updateConfig({
                  identity: {
                    ...currentConfig.identity!,
                    textPattern: event.target.value,
                  },
                })
              }
              placeholder="user@example.com"
              maxLength={200}
            />
          </FormField>
        </>
      )}

      <FormField
        label={t("form.browserAutomationTimeout")}
        description={t("form.browserAutomationTimeoutDesc")}
        htmlFor="account-browser-check-in-timeout"
      >
        <Input
          id="account-browser-check-in-timeout"
          type="number"
          min={BROWSER_CHECK_IN_MIN_TIMEOUT_MS}
          max={BROWSER_CHECK_IN_MAX_TIMEOUT_MS}
          step={1000}
          value={timeoutValue}
          onChange={(event) => {
            const value = Number(event.target.value)
            updateConfig({
              timeoutMs: Number.isFinite(value)
                ? value
                : BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS,
            })
          }}
        />
      </FormField>

      <div className="text-muted-foreground flex items-start gap-2 text-xs">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("form.browserAutomationVisiblePageNote")}</span>
      </div>
    </div>
  )
}
