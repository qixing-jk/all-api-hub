import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  BodySmall,
  Button,
  CardItem,
  Label,
  Separator,
  Switch,
} from "~/components/ui"

interface NotificationSettingItemProps {
  id: string
  title?: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
}

/**
 * Renders a notification setting row with a stable action bar and optional full-width details.
 */
export function NotificationSettingItem({
  id,
  title,
  description,
  actions,
  children,
}: NotificationSettingItemProps) {
  return (
    <CardItem id={id} className="items-stretch sm:items-stretch">
      <div className="space-y-density-4 w-full">
        <div
          data-slot="notification-setting-content"
          className="gap-y-density-3 flex flex-col gap-x-3 has-[>[data-slot=notification-setting-actions]>[data-slot=switch]]:flex-row has-[>[data-slot=notification-setting-actions]>[data-slot=switch]]:items-center has-[>[data-slot=notification-setting-actions]>[data-slot=switch]]:justify-between [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center [@container(min-width:42rem)]:justify-between"
        >
          <div className="space-y-density-1 min-w-0 flex-1">
            {title && (
              <Label className="text-base font-semibold tracking-tight">
                {title}
              </Label>
            )}
            {description && (
              <BodySmall className="text-muted-foreground font-normal">
                {description}
              </BodySmall>
            )}
          </div>
          {actions && (
            <ActionGroup
              data-slot="notification-setting-actions"
              className="gap-y-density-3 w-full gap-x-3 has-[>[data-slot=switch]]:w-auto has-[>[data-slot=switch]]:shrink-0 [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:shrink-0"
            >
              {actions}
            </ActionGroup>
          )}
        </div>
        {children && (
          <div className="dark:bg-secondary/20 dark:border-border border-border-subtle bg-surface-subtle/30 py-density-4 rounded-lg border px-4">
            {children}
          </div>
        )}
      </div>
    </CardItem>
  )
}

interface NotificationChannelActionsProps {
  checked: boolean
  disabled: boolean
  loading: boolean
  testDisabled: boolean
  testLabel: string
  testButtonTestId?: string
  onToggle: (enabled: boolean) => void
  onTest: () => void
}

/**
 * Groups the channel test action and enable switch in a single horizontal control area.
 */
export function NotificationChannelActions({
  checked,
  disabled,
  loading,
  testDisabled,
  testLabel,
  testButtonTestId,
  onToggle,
  onTest,
}: NotificationChannelActionsProps) {
  const { t: commonT } = useTranslation("common")

  return (
    <div className="gap-y-density-4 flex items-center gap-x-4">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-(--density-control-sm) shadow-none"
        loading={loading}
        disabled={testDisabled}
        data-testid={testButtonTestId}
        onClick={onTest}
      >
        {loading ? commonT("status.testing") : testLabel}
      </Button>
      <Separator orientation="vertical" className="h-4" />
      <Switch checked={checked} disabled={disabled} onChange={onToggle} />
    </div>
  )
}
