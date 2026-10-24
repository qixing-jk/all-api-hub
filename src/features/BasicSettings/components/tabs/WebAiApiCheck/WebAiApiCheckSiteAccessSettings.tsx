import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, CardContent, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useSingleFlightActions } from "~/hooks/useSingleFlightActions"
import toast from "~/lib/notify"
import { DEFAULT_WEB_AI_API_CHECK_PREFERENCES } from "~/services/preferences/contentScriptFeatureDefaults"
import {
  WEB_AI_API_CHECK_RULE_LIST,
  WEB_AI_API_CHECK_RULE_MUTATION,
  WEB_AI_API_CHECK_RULE_SYNTAX,
  WEB_AI_API_CHECK_SITE_DECISION,
} from "~/services/verification/webAiApiCheck/siteRuleConstants"
import {
  getWebAiApiCheckSiteDecision,
  resolveWebAiApiCheckSiteRules,
  type WebAiApiCheckRuleMutation,
} from "~/services/verification/webAiApiCheck/siteRules"
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"

import { WEB_AI_API_CHECK_TARGET_IDS } from "./searchTargets"
import {
  WebAiApiCheckRuleEditor,
  type SiteRuleDraft,
  type SiteRuleEditorState,
} from "./WebAiApiCheckRuleEditor"

const RULE_PREVIEW_COUNT = 3

const emptyDraft = (): SiteRuleDraft => ({
  text: "",
  syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
})

/** One black/white-list workspace; additional input lives in the secondary editor. */
export function WebAiApiCheckSiteAccessSettings({
  autoDetectEnabled,
}: {
  autoDetectEnabled: boolean
}) {
  const { t } = useTranslation(["webAiApiCheck", "settings", "common"])
  const titleId = useId()
  const { preferences, mutateWebAiApiCheckSiteRules } =
    useUserPreferencesContext()
  const config =
    preferences.webAiApiCheck?.autoDetect ??
    DEFAULT_WEB_AI_API_CHECK_PREFERENCES.autoDetect
  const rules = resolveWebAiApiCheckSiteRules(config)
  const [editor, setEditor] = useState<SiteRuleEditorState | null>(null)
  const drafts = useRef({ whitelist: emptyDraft(), blacklist: emptyDraft() })
  const [preview, setPreview] = useState("")
  const [expanded, setExpanded] = useState({
    whitelist: false,
    blacklist: false,
  })
  const saves = useSingleFlightActions<"rules">()
  const pending = saves.isPending("rules")
  const decision = getWebAiApiCheckSiteDecision(preview, config)
  const save = (command: WebAiApiCheckRuleMutation) =>
    saves.run("rules", async () => {
      try {
        const result = await mutateWebAiApiCheckSiteRules(command)
        if (!result.ok) {
          toast.error(
            getPreferenceWriteFailureMessage(result.reason, {
              fallback: t("settings:messages.saveSettingsFailed"),
            }),
          )
          return false
        }
        if (
          command.type === WEB_AI_API_CHECK_RULE_MUTATION.ADD ||
          command.type === WEB_AI_API_CHECK_RULE_MUTATION.EDIT
        ) {
          setExpanded((current) => ({ ...current, [command.list]: true }))
          drafts.current[command.list] = emptyDraft()
          setEditor(null)
        }
        return true
      } catch {
        toast.error(t("settings:messages.saveSettingsFailed"))
        return false
      }
    })
  const syntaxLabel = (syntax: SiteRuleDraft["syntax"]) =>
    syntax === WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD
      ? t("webAiApiCheck:settings.siteRules.wildcard")
      : syntax === WEB_AI_API_CHECK_RULE_SYNTAX.EXACT
        ? t("webAiApiCheck:settings.siteRules.exact")
        : syntax === WEB_AI_API_CHECK_RULE_SYNTAX.REGEX
          ? t("webAiApiCheck:settings.siteRules.regex")
          : t("webAiApiCheck:settings.siteRules.legacy")
  return (
    <>
      <CardContent spacing="sm" className="border-border border-t">
        <section
          id={WEB_AI_API_CHECK_TARGET_IDS.siteScope}
          aria-labelledby={titleId}
          className="space-y-density-4"
        >
          <div className="space-y-density-1">
            <h3 id={titleId} className="text-sm font-medium">
              {t("webAiApiCheck:settings.siteRules.title")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t("webAiApiCheck:settings.siteRules.description")}
            </p>
          </div>
          {!autoDetectEnabled ? (
            <p className="text-muted-foreground text-xs">
              {t("webAiApiCheck:settings.siteAccess.disabledHint")}
            </p>
          ) : null}
          <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-4">
            <div>
              <div className="text-sm font-medium">
                {t("webAiApiCheck:settings.siteRules.priority")}
              </div>
              <p className="text-muted-foreground text-xs">
                {t("webAiApiCheck:settings.siteRules.priorityHint")}
              </p>
            </div>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label={t("webAiApiCheck:settings.siteRules.priority")}
            >
              <Button
                size="sm"
                variant={
                  rules.priority === WEB_AI_API_CHECK_RULE_LIST.BLACKLIST
                    ? "default"
                    : "outline"
                }
                aria-pressed={
                  rules.priority === WEB_AI_API_CHECK_RULE_LIST.BLACKLIST
                }
                disabled={pending}
                onClick={() =>
                  void save({
                    type: WEB_AI_API_CHECK_RULE_MUTATION.PRIORITY,
                    priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
                  })
                }
              >
                {t("webAiApiCheck:settings.siteRules.blacklistFirst")}
              </Button>
              <Button
                size="sm"
                variant={
                  rules.priority === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
                    ? "default"
                    : "outline"
                }
                aria-pressed={
                  rules.priority === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
                }
                disabled={pending}
                onClick={() =>
                  void save({
                    type: WEB_AI_API_CHECK_RULE_MUTATION.PRIORITY,
                    priority: WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
                  })
                }
              >
                {t("webAiApiCheck:settings.siteRules.whitelistFirst")}
              </Button>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {(
              [
                WEB_AI_API_CHECK_RULE_LIST.WHITELIST,
                WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
              ] as const
            ).map((list) => (
              <section
                key={list}
                id={
                  list === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
                    ? WEB_AI_API_CHECK_TARGET_IDS.includedSites
                    : WEB_AI_API_CHECK_TARGET_IDS.excludedSites
                }
                className="space-y-density-2 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="flex shrink-0 items-center gap-2">
                      <h4 className="text-sm font-medium">
                        {list === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
                          ? t("webAiApiCheck:settings.siteRules.whitelist")
                          : t("webAiApiCheck:settings.siteRules.blacklist")}
                      </h4>
                      <Badge variant="secondary">{rules[list].length}</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {list === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
                        ? t("webAiApiCheck:settings.siteRules.whitelistHint")
                        : t("webAiApiCheck:settings.siteRules.blacklistHint")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="link"
                    disabled={pending}
                    aria-label={
                      list === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
                        ? t("webAiApiCheck:settings.siteRules.addWhitelist")
                        : t("webAiApiCheck:settings.siteRules.addBlacklist")
                    }
                    onClick={() =>
                      setEditor({ list, draft: drafts.current[list] })
                    }
                  >
                    {t("common:actions.add")}
                  </Button>
                </div>
                {rules[list].length ? (
                  <div>
                    <ul
                      id={`${list}-rule-entries`}
                      className="divide-border divide-y"
                    >
                      {(expanded[list]
                        ? rules[list]
                        : rules[list].slice(0, RULE_PREVIEW_COUNT)
                      ).map((rule) => (
                        <li
                          key={JSON.stringify(rule)}
                          className="py-density-2 flex min-w-0 items-center gap-2"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <code
                              title={rule.pattern}
                              className="min-w-0 flex-1 truncate text-xs"
                            >
                              {rule.pattern}
                            </code>
                            <Badge variant="outline" className="shrink-0">
                              {syntaxLabel(rule.syntax)}
                            </Badge>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("common:actions.edit")}
                              title={t("common:actions.edit")}
                              disabled={pending}
                              onClick={() =>
                                setEditor({
                                  list,
                                  original: rule,
                                  draft: {
                                    text: rule.pattern,
                                    syntax: rule.syntax,
                                  },
                                })
                              }
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-muted-foreground"
                              aria-label={t("common:actions.remove")}
                              title={t("common:actions.remove")}
                              disabled={pending}
                              onClick={() =>
                                void save({
                                  type: WEB_AI_API_CHECK_RULE_MUTATION.REMOVE,
                                  list,
                                  rule,
                                })
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {rules[list].length > RULE_PREVIEW_COUNT ? (
                      <div>
                        {!expanded[list] ? (
                          <div
                            aria-hidden="true"
                            className="relative h-7 overflow-hidden select-none"
                          >
                            <code className="text-muted-foreground block truncate pt-2 text-xs">
                              {rules[list][RULE_PREVIEW_COUNT]!.pattern}
                            </code>
                            <div className="from-background pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent" />
                          </div>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground w-full"
                          aria-expanded={expanded[list]}
                          aria-controls={`${list}-rule-entries`}
                          onClick={() =>
                            setExpanded((current) => ({
                              ...current,
                              [list]: !current[list],
                            }))
                          }
                        >
                          {expanded[list]
                            ? t("webAiApiCheck:settings.siteRules.showLess")
                            : t("webAiApiCheck:settings.siteRules.showAll")}
                          {expanded[list] ? (
                            <ChevronUp
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronDown
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground py-density-4 text-xs">
                    {list === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
                      ? t("webAiApiCheck:settings.siteRules.emptyWhitelist")
                      : t("webAiApiCheck:settings.siteRules.emptyBlacklist")}
                  </p>
                )}
              </section>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {rules.whitelist.length
              ? t("webAiApiCheck:settings.siteRules.restrictedHint")
              : t("webAiApiCheck:settings.siteRules.defaultHint")}
          </p>
          <div className="border-border space-y-density-2 pt-density-3 border-t">
            <label
              htmlFor="web-ai-api-check-preview"
              className="text-muted-foreground text-xs"
            >
              {t("webAiApiCheck:settings.siteRules.preview")}
            </label>
            <Input
              id="web-ai-api-check-preview"
              aria-label={t("webAiApiCheck:settings.siteRules.preview")}
              placeholder="https://example.com/page"
              value={preview}
              onChange={(event) => setPreview(event.target.value)}
            />
            {preview ? (
              <p role="status" className="text-xs">
                {!autoDetectEnabled
                  ? t("webAiApiCheck:settings.siteRules.autoDetectOff")
                  : decision.allowed
                    ? t("webAiApiCheck:settings.siteRules.allowed")
                    : t("webAiApiCheck:settings.siteRules.blocked")}{" "}
                ·{" "}
                {decision.reason === WEB_AI_API_CHECK_SITE_DECISION.UNSUPPORTED
                  ? t("webAiApiCheck:settings.siteRules.unsupported")
                  : decision.reason === WEB_AI_API_CHECK_SITE_DECISION.UNLISTED
                    ? t("webAiApiCheck:settings.siteRules.unlisted")
                    : decision.reason === WEB_AI_API_CHECK_SITE_DECISION.DEFAULT
                      ? t("webAiApiCheck:settings.siteRules.defaultMatch")
                      : decision.reason ===
                          WEB_AI_API_CHECK_SITE_DECISION.WHITELIST_PRIORITY
                        ? t(
                            "webAiApiCheck:settings.siteRules.whitePriorityMatch",
                          )
                        : decision.reason ===
                            WEB_AI_API_CHECK_SITE_DECISION.BLACKLIST_PRIORITY
                          ? t(
                              "webAiApiCheck:settings.siteRules.blackPriorityMatch",
                            )
                          : decision.reason ===
                              WEB_AI_API_CHECK_SITE_DECISION.WHITELIST
                            ? t("webAiApiCheck:settings.siteRules.whiteMatch")
                            : t("webAiApiCheck:settings.siteRules.blackMatch")}
              </p>
            ) : null}
          </div>
        </section>
      </CardContent>
      {editor ? (
        <WebAiApiCheckRuleEditor
          editor={editor}
          pending={pending}
          onClose={(draft) => {
            if (!editor.original) drafts.current[editor.list] = draft
            setEditor(null)
          }}
          onSave={save}
        />
      ) : null}
    </>
  )
}
