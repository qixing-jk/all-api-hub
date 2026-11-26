import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

import { BrowserTabSitePicker } from "~/components/BrowserTabSitePicker"
import { Button, CardContent, Textarea } from "~/components/ui"
import type { RecentBrowserTabSite } from "~/utils/browser/recentTabSites"
import { buildOriginWhitelistPattern } from "~/utils/core/urlWhitelist"

/** Converts the selected origins into canonical whitelist patterns. */
function getSitePatterns(sites: readonly RecentBrowserTabSite[]): string[] {
  return sites
    .map((site) => buildOriginWhitelistPattern(site.value))
    .filter((pattern): pattern is string => pattern !== null)
}

/** Edits whitelist patterns as text or through the current browser tabs. */
export function RedemptionAssistPatternEditor({
  draft,
  setDraft,
  dirty,
  pending,
  onSave,
}: {
  draft: string
  setDraft: Dispatch<SetStateAction<string>>
  dirty: boolean
  pending: boolean
  onSave: () => void
}) {
  const { t } = useTranslation(["redemptionAssist", "common"])
  const draftPatterns = new Set(draft.split("\n").map((line) => line.trim()))

  const selectTabSites = (
    sites: readonly RecentBrowserTabSite[],
    previous: readonly RecentBrowserTabSite[],
  ) => {
    const selected = new Set(getSitePatterns(sites))
    const removed = new Set(
      getSitePatterns(previous).filter((pattern) => !selected.has(pattern)),
    )

    setDraft((current) => {
      // Preserve the raw text of every line that the picker did not remove.
      const lines = current
        ? current.split("\n").filter((line) => !removed.has(line.trim()))
        : []
      const existing = new Set(lines.map((line) => line.trim()))
      const additions = [...selected].filter(
        (pattern) => !existing.has(pattern),
      )
      return [...lines, ...additions].join("\n")
    })
  }

  return (
    <CardContent
      id="redemption-assist-url-whitelist-patterns"
      className="border-t border-border"
      spacing="sm"
    >
      <div className="space-y-density-2">
        <div className="text-sm font-medium">
          {t("redemptionAssist:settings.urlWhitelist.patterns")}
        </div>
        <div className="text-xs text-muted-foreground">
          {t("redemptionAssist:settings.urlWhitelist.patternsDesc")}
        </div>
        <BrowserTabSitePicker
          label={t("redemptionAssist:settings.urlWhitelist.tabPicker")}
          emptyMessage={t("redemptionAssist:settings.urlWhitelist.noTabs")}
          disabled={pending}
          isSiteSelected={(site) => {
            const pattern = buildOriginWhitelistPattern(site.value)
            return pattern !== null && draftPatterns.has(pattern)
          }}
          onSelect={selectTabSites}
        />
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t(
            "redemptionAssist:settings.urlWhitelist.patternsPlaceholder",
          )}
          rows={6}
          disabled={pending}
        />

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || pending}
            loading={pending}
            onClick={onSave}
          >
            {pending ? t("common:status.saving") : t("common:actions.save")}
          </Button>
        </div>
      </div>
    </CardContent>
  )
}
