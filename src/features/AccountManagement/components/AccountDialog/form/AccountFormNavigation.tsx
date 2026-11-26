import { ChevronDown, CircleAlert, CircleDashed } from "lucide-react"
import type { Ref, RefObject } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import {
  ACCOUNT_FORM_ISSUE_KINDS,
  type AccountFormIssue,
} from "~/services/accounts/editing/accountFormValidation"

import type { ACCOUNT_EDIT_SECTIONS } from "./accountFormSections"

/** Responsive navigation and validation status for the account editor. */
export function AccountFormNavigation({
  navigationRef,
  sections,
  activeId,
  issueSections,
  pendingMenuDestination,
  navigate,
}: {
  navigationRef: Ref<HTMLElement>
  sections: readonly (typeof ACCOUNT_EDIT_SECTIONS)[number][]
  activeId: string
  issueSections?: Partial<Record<string, AccountFormIssue["kind"]>>
  pendingMenuDestination: RefObject<string | null>
  navigate: (id: string) => void
}) {
  const { t } = useTranslation("accountDialog")
  const isCompact = useMediaQuery("(max-width: 639px)")
  const activeSection = sections.find(({ id }) => id === activeId)
  const sectionStatus = (id: string) => {
    const issue = issueSections?.[id]
    if (!issue) return null
    const invalid = issue === ACCOUNT_FORM_ISSUE_KINDS.INVALID
    const Icon = invalid ? CircleAlert : CircleDashed
    const label = t(invalid ? "validation.blocked" : "validation.missing")
    return (
      <span
        title={label}
        className={cn(
          "inline-flex shrink-0",
          invalid ? "text-destructive-text" : "text-warning-text",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  return (
    <nav
      ref={navigationRef}
      aria-label={t("sections.navigation")}
      className="relative flex min-w-0 flex-1 gap-1 overflow-x-auto py-density-2 lg:flex-col lg:overflow-visible lg:py-0"
    >
      {isCompact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between"
              aria-label={[
                activeSection ? t(activeSection.title) : undefined,
                t("sections.navigation"),
                issueSections?.[activeId] === ACCOUNT_FORM_ISSUE_KINDS.INVALID
                  ? t("validation.blocked")
                  : issueSections?.[activeId] ===
                      ACCOUNT_FORM_ISSUE_KINDS.MISSING
                    ? t("validation.missing")
                    : undefined,
              ]
                .filter(Boolean)
                .join(", ")}
              rightIcon={<ChevronDown className="size-4" />}
            >
              {sections
                .filter(({ id }) => id === activeId)
                .map(({ id, title, icon: Icon }) => (
                  <span key={id} className="flex items-center gap-2.5">
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {t(title)}
                    {sectionStatus(id)}
                  </span>
                ))}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width)"
            onCloseAutoFocus={(event) => {
              const destination = pendingMenuDestination.current
              if (!destination) return
              event.preventDefault()
              pendingMenuDestination.current = null
              navigate(destination)
            }}
          >
            {sections.map(({ id, title, icon: Icon }) => (
              <DropdownMenuItem
                key={id}
                aria-current={activeId === id ? "location" : undefined}
                onSelect={() => {
                  pendingMenuDestination.current = id
                }}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(title)}
                {sectionStatus(id)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        sections.map(({ id, title, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-controls={id}
            aria-current={activeId === id ? "location" : undefined}
            onClick={() => navigate(id)}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 py-density-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset active:bg-primary-soft motion-reduce:transition-none lg:shrink lg:break-words",
              activeId === id
                ? "bg-primary-soft text-primary-soft-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{t(title)}</span>
            {sectionStatus(id)}
          </button>
        ))
      )}
    </nav>
  )
}
