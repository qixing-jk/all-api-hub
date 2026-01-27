import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Body,
  Button,
  Caption,
  Card,
  CardContent,
  CardHeader,
  Heading3,
  Link,
} from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to redemption assist prompt toast interactions.
 */
const logger = createLogger("RedemptionPromptToast")

export type RedemptionPromptAction = "auto" | "cancel"

export interface RedemptionPromptResult {
  action: RedemptionPromptAction
  selectedCodes: string[]
}

export interface RedemptionPromptCodeItem {
  code: string
  preview: string
}

interface RedemptionPromptToastProps {
  message: string
  codes: RedemptionPromptCodeItem[]
  onAction: (result: RedemptionPromptResult) => void
}

export const RedemptionPromptToast: React.FC<RedemptionPromptToastProps> = ({
  message,
  codes,
  onAction,
}) => {
  const { t } = useTranslation("redemptionAssist")

  const codeValues = useMemo(() => codes.map((c) => c.code), [codes])
  const initialSelected = useMemo(() => new Set(codeValues), [codeValues])
  const [selected, setSelected] = useState<Set<string>>(() => initialSelected)

  const allSelected = selected.size > 0 && selected.size === codes.length
  const someSelected = selected.size > 0 && !allSelected

  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = someSelected
  }, [someSelected])

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAction({ action: "cancel", selectedCodes: [] })
  }

  const handleAutoRedeem = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAction({
      action: "auto",
      selectedCodes: codeValues.filter((c) => selected.has(c)),
    })
  }

  const handleOpenSettings = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await sendRuntimeMessage({
        action: RuntimeActionIds.OpenSettingsCheckinRedeem,
      })
    } catch (error) {
      logger.error("Failed to open settings page", error)
    }
  }

  const toggleCode = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  const handleToggleAll = () => {
    setSelected((prev) => {
      if (prev.size === codes.length) return new Set()
      return new Set(codeValues)
    })
  }

  const selectedCount = selected.size

  return (
    <Card>
      <CardHeader padding="sm">
        <Heading3>{t("redemptionAssist:messages.promptTitle")}</Heading3>
      </CardHeader>
      <CardContent padding="sm">
        <Body>{message}</Body>
        {codes.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="h-3 w-3"
              checked={allSelected}
              onChange={handleToggleAll}
            />
            <span className="text-foreground text-xs">
              {t("redemptionAssist:messages.selectAll")}
            </span>
          </div>
        )}
        {codes.length > 0 && (
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
            {codes.map(({ code, preview }) => (
              <label
                key={code}
                className="border-border/60 hover:bg-muted/70 flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={selected.has(code)}
                  onChange={() => toggleCode(code)}
                />
                <code className="text-foreground font-mono">{preview}</code>
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <Caption>{t("redemptionAssist:messages.promptSource")}</Caption>
          <Link size="xs" href="#" onClick={handleOpenSettings}>
            {t("redemptionAssist:messages.promptSettingsLink")}
          </Link>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleCancel}>
            {t("common:actions.cancel")}
          </Button>
          <Button disabled={selectedCount === 0} onClick={handleAutoRedeem}>
            {t("redemptionAssist:actions.autoRedeem")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
