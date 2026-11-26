import { Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "~/components/ui"
import type { WebAiApiCheckSiteRule } from "~/services/preferences/preferencesSchema"
import { WEB_AI_API_CHECK_RULE_SYNTAX } from "~/services/verification/webAiApiCheck/siteRuleConstants"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

export type SiteRuleRowDraft = {
  id: number
  text: string
  syntax: WebAiApiCheckSiteRule["syntax"]
  url?: string
  origin?: string
}
export type SiteRuleRowPatch = Partial<
  Pick<SiteRuleRowDraft, "syntax" | "text" | "url">
>

/** Builds the rule used for the tab selection and whole-site shortcut. */
export function formatWholeSiteWildcard(host: string): string {
  return `*://${host}/*`
}

/** Renders a rule draft and the URL shortcuts available for its source. */
export function WebAiApiCheckRuleRow({
  row,
  inputId,
  pending,
  invalid,
  onChange,
  onTextChange,
  onRemove,
  onSubmit,
}: {
  row: SiteRuleRowDraft
  inputId: string
  pending: boolean
  invalid: readonly string[]
  onChange: (patch: SiteRuleRowPatch) => void
  onTextChange: (text: string) => void
  onRemove?: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation(["webAiApiCheck", "common"])
  const text = row.text.trim()
  const page = tryParseHttpUrl(/^https?:\/\//i.test(text) ? text : row.url)

  return (
    <div
      role="group"
      aria-label={t("webAiApiCheck:settings.siteRules.content")}
      className="space-y-density-2 rounded-lg border border-border p-3"
    >
      <div className="flex items-center gap-2">
        <Select
          value={row.syntax}
          onValueChange={(value) =>
            onChange({
              syntax: value as SiteRuleRowDraft["syntax"],
            })
          }
          disabled={pending}
        >
          <SelectTrigger
            aria-label={t("webAiApiCheck:settings.siteRules.syntax")}
            className="min-w-0 flex-1"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD}>
              {t("webAiApiCheck:settings.siteRules.wildcard")}
            </SelectItem>
            <SelectItem value={WEB_AI_API_CHECK_RULE_SYNTAX.EXACT}>
              {t("webAiApiCheck:settings.siteRules.exact")}
            </SelectItem>
            <SelectItem value={WEB_AI_API_CHECK_RULE_SYNTAX.REGEX}>
              {t("webAiApiCheck:settings.siteRules.regex")}
            </SelectItem>
            {row.syntax === WEB_AI_API_CHECK_RULE_SYNTAX.LEGACY ? (
              <SelectItem value={WEB_AI_API_CHECK_RULE_SYNTAX.LEGACY}>
                {t("webAiApiCheck:settings.siteRules.legacy")}
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {onRemove ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={t("common:actions.remove")}
            title={t("common:actions.remove")}
            disabled={pending}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <Textarea
        id={inputId}
        aria-label={t("webAiApiCheck:settings.siteRules.content")}
        value={row.text}
        onChange={(event) => onTextChange(event.target.value)}
        disabled={pending}
        rows={2}
        placeholder={t("webAiApiCheck:settings.siteRules.placeholder")}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        {row.syntax === WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD
          ? t("webAiApiCheck:settings.siteRules.wildcardHint")
          : row.syntax === WEB_AI_API_CHECK_RULE_SYNTAX.EXACT
            ? t("webAiApiCheck:settings.siteRules.exactHint")
            : row.syntax === WEB_AI_API_CHECK_RULE_SYNTAX.LEGACY
              ? t("webAiApiCheck:settings.siteRules.legacyHint")
              : t("webAiApiCheck:settings.siteRules.regexHint")}
      </p>
      {row.syntax === WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD && page ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              onChange({
                text: formatWholeSiteWildcard(page.host),
                url: page.href,
              })
            }
          >
            {t("webAiApiCheck:settings.siteRules.wholeSite")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              onChange({
                text: page.href,
                syntax: WEB_AI_API_CHECK_RULE_SYNTAX.EXACT,
              })
            }
          >
            {t("webAiApiCheck:settings.siteRules.currentPage")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              onChange({
                text: `*://*.${page.hostname}${page.port ? `:${page.port}` : ""}/*`,
                url: page.href,
              })
            }
          >
            {t("webAiApiCheck:settings.siteRules.subdomains")}
          </Button>
        </div>
      ) : null}
      {invalid.length ? (
        <p role="alert" className="text-xs text-destructive">
          {t("webAiApiCheck:settings.siteRules.invalid")} {invalid.join(", ")}
        </p>
      ) : null}
    </div>
  )
}
