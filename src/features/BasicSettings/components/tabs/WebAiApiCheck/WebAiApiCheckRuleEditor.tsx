import { Plus, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { BrowserTabSitePicker } from "~/components/BrowserTabSitePicker"
import {
  Button,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "~/components/ui"
import type { WebAiApiCheckSiteRule } from "~/services/preferences/preferencesSchema"
import {
  WEB_AI_API_CHECK_RULE_LIST,
  WEB_AI_API_CHECK_RULE_MUTATION,
  WEB_AI_API_CHECK_RULE_SYNTAX,
} from "~/services/verification/webAiApiCheck/siteRuleConstants"
import {
  normalizeWebAiApiCheckSiteRules,
  uniqueWebAiApiCheckSiteRules,
  type WebAiApiCheckRuleList,
  type WebAiApiCheckRuleMutation,
} from "~/services/verification/webAiApiCheck/siteRules"

export type SiteRuleRowDraft = {
  id: number
  text: string
  syntax: WebAiApiCheckSiteRule["syntax"]
  url?: string
  origin?: string
}
export type SiteRuleDraft = {
  text: string
  syntax: WebAiApiCheckSiteRule["syntax"]
  url?: string
  rows?: SiteRuleRowDraft[]
}
export type SiteRuleEditorState = {
  list: WebAiApiCheckRuleList
  original?: WebAiApiCheckSiteRule
  draft: SiteRuleDraft
}

/** Each pending rule owns its syntax and URL scope; confirmation writes the batch once. */
export function WebAiApiCheckRuleEditor({
  editor,
  pending,
  onClose,
  onSave,
}: {
  editor: SiteRuleEditorState
  pending: boolean
  onClose: (draft: SiteRuleDraft) => void
  onSave: (command: WebAiApiCheckRuleMutation) => Promise<boolean>
}) {
  const { t } = useTranslation(["webAiApiCheck", "common"])
  const [rows, setRows] = useState<SiteRuleRowDraft[]>(() =>
    editor.draft.rows?.length
      ? editor.draft.rows
      : [
          {
            id: 0,
            text: editor.draft.text,
            syntax: editor.draft.syntax,
            url: editor.draft.url,
          },
        ],
  )
  const nextId = useRef(Math.max(...rows.map((row) => row.id)) + 1)
  const focusRow = useRef<number | null>(null)
  useEffect(() => {
    if (focusRow.current !== null) {
      document.getElementById(`web-api-rule-row-${focusRow.current}`)?.focus()
      focusRow.current = null
    }
  }, [rows])
  const [attempted, setAttempted] = useState(false)
  const [failed, setFailed] = useState(false)
  const changeRow = (id: number, patch: Partial<SiteRuleRowDraft>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
    setFailed(false)
  }
  const setRowText = (id: number, text: string) => {
    const lines = editor.original ? [text] : text.split(/\r?\n/)
    const additions = lines.slice(1).map((line) => ({
      id: nextId.current++,
      text: line,
      syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
    }))
    if (additions.length) focusRow.current = additions.at(-1)!.id
    setRows((current) =>
      current.flatMap((row) =>
        row.id !== id
          ? [row]
          : [{ ...row, text: lines[0] ?? "" }, ...additions],
      ),
    )
    setFailed(false)
  }
  const close = () => {
    if (!pending)
      onClose({
        text: rows[0]?.text ?? "",
        syntax: rows[0]?.syntax ?? WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
        rows,
      })
  }
  const validation = rows.map((row) => ({
    row,
    ...normalizeWebAiApiCheckSiteRules([row.text], row.syntax),
  }))
  const hasInvalid =
    validation.some((item) => item.invalid.length > 0) ||
    !rows.some((row) => row.text.trim()) ||
    (!!editor.original &&
      (rows.filter((row) => row.text.trim()).length !== 1 ||
        rows.some((row) => /[\r\n]/.test(row.text))))
  const save = async () => {
    if (pending) return
    setAttempted(true)
    if (hasInvalid) return
    const rules = uniqueWebAiApiCheckSiteRules(
      validation.flatMap((item) => item.rules),
    )
    const ok = await onSave(
      editor.original
        ? {
            type: WEB_AI_API_CHECK_RULE_MUTATION.EDIT,
            list: editor.list,
            original: editor.original,
            rule: rules[0]!,
          }
        : {
            type: WEB_AI_API_CHECK_RULE_MUTATION.ADD,
            list: editor.list,
            rules,
          },
    )
    if (!ok) setFailed(true)
  }
  const title = editor.original
    ? t("webAiApiCheck:settings.siteRules.edit")
    : editor.list === WEB_AI_API_CHECK_RULE_LIST.WHITELIST
      ? t("webAiApiCheck:settings.siteRules.addWhitelist")
      : t("webAiApiCheck:settings.siteRules.addBlacklist")
  return (
    <Modal
      isOpen
      onClose={close}
      closeOnBackdropClick={false}
      size="lg"
      title={title}
      header={<h2 className="pr-8 text-base font-semibold">{title}</h2>}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={pending}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => void save()} loading={pending}>
            {editor.original
              ? t("common:actions.save")
              : t("common:actions.add")}
          </Button>
        </div>
      }
    >
      <div className="space-y-density-3">
        {!editor.original ? (
          <BrowserTabSitePicker
            label={t("webAiApiCheck:settings.siteRules.tabPicker")}
            emptyMessage={t("webAiApiCheck:settings.siteRules.noTabs")}
            disabled={pending}
            selectedOrigins={rows.flatMap((row) =>
              row.origin ? [row.origin] : [],
            )}
            onSelect={(sites) => {
              setRows((current) => {
                const kept = current.filter(
                  (row) =>
                    !row.origin ||
                    sites.some((site) => site.value === row.origin),
                )
                const added = sites
                  .filter(
                    (site) => !current.some((row) => row.origin === site.value),
                  )
                  .map((site) => ({
                    id: nextId.current++,
                    text: `*://${new URL(site.url).host}/*`,
                    syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
                    url: site.url,
                    origin: site.value,
                  }))
                const nonempty = kept.filter((row) => row.text.trim())
                const result = [...nonempty, ...added]
                return result.length
                  ? result
                  : [
                      {
                        id: nextId.current++,
                        text: "",
                        syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
                      },
                    ]
              })
              setAttempted(false)
              setFailed(false)
            }}
          />
        ) : null}
        {validation.map(({ row, invalid }) => {
          let url: URL | null = null
          try {
            const candidate = new URL(
              /^https?:\/\//i.test(row.text.trim())
                ? row.text.trim()
                : row.url ?? "",
            )
            if (/^https?:$/.test(candidate.protocol)) url = candidate
          } catch {
            /* Manual wildcard rules need no URL shortcuts. */
          }
          const page = url
          return (
            <div
              key={row.id}
              role="group"
              aria-label={t("webAiApiCheck:settings.siteRules.content")}
              className="border-border space-y-density-2 rounded-lg border p-3"
            >
              <div className="flex items-center gap-2">
                <Select
                  value={row.syntax}
                  onValueChange={(value) =>
                    changeRow(row.id, {
                      syntax: value as WebAiApiCheckSiteRule["syntax"],
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
                {!editor.original ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground shrink-0"
                    aria-label={t("common:actions.remove")}
                    title={t("common:actions.remove")}
                    disabled={pending}
                    onClick={() =>
                      setRows((current) =>
                        current.length === 1
                          ? [
                              {
                                id: nextId.current++,
                                text: "",
                                syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
                              },
                            ]
                          : current.filter((item) => item.id !== row.id),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <Textarea
                id={`web-api-rule-row-${row.id}`}
                aria-label={t("webAiApiCheck:settings.siteRules.content")}
                value={row.text}
                onChange={(event) => setRowText(row.id, event.target.value)}
                disabled={pending}
                rows={2}
                placeholder={t("webAiApiCheck:settings.siteRules.placeholder")}
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault()
                    void save()
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
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
                      changeRow(row.id, {
                        text: `*://${page.host}/*`,
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
                      changeRow(row.id, {
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
                      changeRow(row.id, {
                        text: `*://*.${page.hostname}${page.port ? `:${page.port}` : ""}/*`,
                        url: page.href,
                      })
                    }
                  >
                    {t("webAiApiCheck:settings.siteRules.subdomains")}
                  </Button>
                </div>
              ) : null}
              {attempted && invalid.length ? (
                <p role="alert" className="text-destructive text-xs">
                  {t("webAiApiCheck:settings.siteRules.invalid")}{" "}
                  {invalid.join(", ")}
                </p>
              ) : null}
            </div>
          )
        })}
        {!editor.original ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            leftIcon={<Plus className="size-4" />}
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  id: nextId.current++,
                  text: "",
                  syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
                },
              ])
            }
          >
            {t("webAiApiCheck:settings.siteRules.addRow")}
          </Button>
        ) : null}
        {attempted && hasInvalid ? (
          <p role="alert" className="text-destructive text-xs">
            {t("webAiApiCheck:settings.siteRules.invalid")}
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="text-destructive text-xs">
            {t("webAiApiCheck:settings.siteRules.saveFailed")}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
