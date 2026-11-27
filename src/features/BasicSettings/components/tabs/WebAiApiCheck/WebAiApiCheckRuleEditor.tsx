import { Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { BrowserTabSitePicker } from "~/components/BrowserTabSitePicker"
import { Button, Modal } from "~/components/ui"
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
import type { RecentBrowserTabSite } from "~/utils/browser/recentTabSites"

import {
  formatWholeSiteWildcard,
  WebAiApiCheckRuleRow,
  type SiteRuleRowDraft,
  type SiteRuleRowPatch,
} from "./WebAiApiCheckRuleRow"

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

/** Identifies the textarea to focus after splitting a pasted rule list. */
function getRuleRowInputId(id: number): string {
  return `web-api-rule-row-${id}`
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
      document.getElementById(getRuleRowInputId(focusRow.current))?.focus()
      focusRow.current = null
    }
  }, [rows])
  const [attempted, setAttempted] = useState(false)
  const [failed, setFailed] = useState(false)
  const createWildcardRow = (text = ""): SiteRuleRowDraft => ({
    id: nextId.current++,
    text,
    syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
  })
  const changeRow = (id: number, patch: SiteRuleRowPatch) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
    setFailed(false)
  }
  const setRowText = (id: number, text: string) => {
    const lines = editor.original ? [text] : text.split(/\r?\n/)
    const additions = lines.slice(1).map(createWildcardRow)
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
  const selectedOrigins = new Set(rows.map((row) => row.origin))
  const selectTabSites = (sites: readonly RecentBrowserTabSite[]) => {
    const nextOrigins = new Set(sites.map((site) => site.value))
    setRows((current) => {
      const currentOrigins = new Set(current.map((row) => row.origin))
      const kept = current.filter(
        (row) =>
          (!row.origin || nextOrigins.has(row.origin)) && row.text.trim(),
      )
      const added = sites
        .filter((site) => !currentOrigins.has(site.value))
        .map((site) => ({
          ...createWildcardRow(formatWholeSiteWildcard(new URL(site.url).host)),
          url: site.url,
          origin: site.value,
        }))
      const next = [...kept, ...added]
      return next.length ? next : [createWildcardRow()]
    })
    setAttempted(false)
    setFailed(false)
  }
  const removeRow = (id: number) => {
    setRows((current) =>
      current.length === 1
        ? [createWildcardRow()]
        : current.filter((row) => row.id !== id),
    )
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
            isSiteSelected={(site) => selectedOrigins.has(site.value)}
            onSelect={selectTabSites}
          />
        ) : null}
        {validation.map(({ row, invalid }) => (
          <WebAiApiCheckRuleRow
            key={row.id}
            row={row}
            inputId={getRuleRowInputId(row.id)}
            pending={pending}
            invalid={attempted ? invalid : []}
            onChange={(patch) => changeRow(row.id, patch)}
            onTextChange={(text) => setRowText(row.id, text)}
            onRemove={editor.original ? undefined : () => removeRow(row.id)}
            onSubmit={() => void save()}
          />
        ))}
        {!editor.original ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            leftIcon={<Plus className="size-4" />}
            onClick={() =>
              setRows((current) => [...current, createWildcardRow()])
            }
          >
            {t("webAiApiCheck:settings.siteRules.addRow")}
          </Button>
        ) : null}
        {attempted && hasInvalid ? (
          <p role="alert" className="text-xs text-destructive">
            {t("webAiApiCheck:settings.siteRules.invalid")}
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="text-xs text-destructive">
            {t("webAiApiCheck:settings.siteRules.saveFailed")}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
