import { Upload } from "lucide-react"
import { Fragment, type Ref } from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"

import { CCSwitchIcon } from "./icons/CCSwitchIcon"
import { CherryIcon } from "./icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "./icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "./icons/CliProxyIcon"
import { CursorPlusIcon } from "./icons/CursorPlusIcon"
import { KelivoIcon } from "./icons/KelivoIcon"
import { KiloCodeIcon } from "./icons/KiloCodeIcon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

/** Stable identifiers for export destinations shown across credential surfaces. */
export const EXPORT_ACTION_TARGETS = {
  CherryStudio: "cherryStudio",
  Kelivo: "kelivo",
  CCSwitch: "ccSwitch",
  KiloCode: "kiloCode",
  CursorPlus: "cursorPlus",
  CliProxy: "cliProxy",
  ClaudeCodeRouter: "claudeCodeRouter",
} as const

type ExportActionTarget =
  (typeof EXPORT_ACTION_TARGETS)[keyof typeof EXPORT_ACTION_TARGETS]

interface ExportMenuAction {
  onSelect: () => void | Promise<void>
  testId?: string
}

interface ExportActionsMenuProps {
  actions: Partial<Record<ExportActionTarget, ExportMenuAction>>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerRef?: Ref<HTMLButtonElement>
  triggerTestId?: string
  triggerAnalyticsAction?: ProductAnalyticsScopedActionConfig
}

const CHAT_CLIENT_TARGETS = [
  EXPORT_ACTION_TARGETS.CherryStudio,
  EXPORT_ACTION_TARGETS.Kelivo,
] as const

const CODING_AGENT_TARGETS = [
  EXPORT_ACTION_TARGETS.CCSwitch,
  EXPORT_ACTION_TARGETS.KiloCode,
  EXPORT_ACTION_TARGETS.CursorPlus,
] as const

const GATEWAY_TARGETS = [
  EXPORT_ACTION_TARGETS.CliProxy,
  EXPORT_ACTION_TARGETS.ClaudeCodeRouter,
] as const

/** Renders the shared, grouped export menu used by account and credential rows. */
export function ExportActionsMenu({
  actions,
  open,
  onOpenChange,
  triggerRef,
  triggerTestId,
  triggerAnalyticsAction,
}: ExportActionsMenuProps) {
  const { t } = useTranslation(["keyManagement", "common"])

  const getLabel = (target: ExportActionTarget) => {
    switch (target) {
      case EXPORT_ACTION_TARGETS.CherryStudio:
        return t("keyManagement:actions.useInCherry")
      case EXPORT_ACTION_TARGETS.Kelivo:
        return t("keyManagement:actions.copyKelivoImportCode")
      case EXPORT_ACTION_TARGETS.CCSwitch:
        return t("keyManagement:actions.exportToCCSwitch")
      case EXPORT_ACTION_TARGETS.CursorPlus:
        return t("keyManagement:actions.exportToCursorPlus")
      case EXPORT_ACTION_TARGETS.KiloCode:
        return t("keyManagement:actions.exportToKiloCode")
      case EXPORT_ACTION_TARGETS.CliProxy:
        return t("keyManagement:actions.importToCliProxy")
      case EXPORT_ACTION_TARGETS.ClaudeCodeRouter:
        return t("keyManagement:actions.importToClaudeCodeRouter")
    }
  }

  const getIcon = (target: ExportActionTarget) => {
    switch (target) {
      case EXPORT_ACTION_TARGETS.CherryStudio:
        return <CherryIcon />
      case EXPORT_ACTION_TARGETS.Kelivo:
        return <KelivoIcon />
      case EXPORT_ACTION_TARGETS.CCSwitch:
        return <CCSwitchIcon size="sm" />
      case EXPORT_ACTION_TARGETS.CursorPlus:
        return <CursorPlusIcon />
      case EXPORT_ACTION_TARGETS.KiloCode:
        return <KiloCodeIcon size="sm" />
      case EXPORT_ACTION_TARGETS.CliProxy:
        return <CliProxyIcon size="sm" />
      case EXPORT_ACTION_TARGETS.ClaudeCodeRouter:
        return <ClaudeCodeRouterIcon size="sm" />
    }
  }

  const renderAction = (target: ExportActionTarget) => {
    const action = actions[target]
    if (!action) return null

    return (
      <DropdownMenuItem
        key={target}
        data-testid={action.testId}
        onSelect={(event) => {
          event.stopPropagation()
          void action.onSelect()
        }}
      >
        <span aria-hidden="true">{getIcon(target)}</span>
        {getLabel(target)}
      </DropdownMenuItem>
    )
  }

  const chatClientActions =
    CHAT_CLIENT_TARGETS.map(renderAction).filter(Boolean)
  const codingAgentActions =
    CODING_AGENT_TARGETS.map(renderAction).filter(Boolean)
  const gatewayActions = GATEWAY_TARGETS.map(renderAction).filter(Boolean)
  const actionGroups = [
    {
      id: "chatClients",
      label: t("keyManagement:exportMenu.groups.chatClients"),
      actions: chatClientActions,
    },
    {
      id: "codingAgents",
      label: t("keyManagement:exportMenu.groups.codingAgents"),
      actions: codingAgentActions,
    },
    {
      id: "gateways",
      label: t("keyManagement:exportMenu.groups.gateways"),
      actions: gatewayActions,
    },
  ].filter((group) => group.actions.length > 0)

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <IconButton
          ref={triggerRef}
          aria-label={t("common:actions.export")}
          size="sm"
          variant="ghost"
          data-testid={triggerTestId}
          analyticsAction={triggerAnalyticsAction}
          onClick={(event) => event.stopPropagation()}
        >
          <Upload className="h-4 w-4" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {actionGroups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {group.label}
              </DropdownMenuLabel>
              {group.actions}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
