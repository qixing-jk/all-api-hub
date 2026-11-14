import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { useContext, useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button, Card, Heading6 } from "~/components/ui"
import { cn } from "~/lib/utils"

import {
  VerificationDetailContext,
  VerificationSelectionContext,
} from "./VerificationSelectionContext"

/** Groups editable test settings separately from the test plan and results. */
export function VerificationSettingsCard({
  children,
  running = false,
  title,
}: {
  children: ReactNode
  running?: boolean
  title?: string
}) {
  const { t } = useTranslation("aiApiVerification")
  const titleId = useId()
  // In the separate settings pane, running no longer competes with result height.
  const workspace = useContext(VerificationSelectionContext)
  const detail = useContext(VerificationDetailContext)
  running = running && !workspace?.settingsTarget
  const [disclosure, setDisclosure] = useState({
    running,
    open: !running,
    manualOpen: true,
  })
  // Running temporarily folds settings without replacing the reader's choice.
  // Ending a run restores that choice, including any changes made during it.
  if (disclosure.running !== running) {
    setDisclosure({
      ...disclosure,
      running,
      open: running ? false : disclosure.manualOpen,
    })
  }
  const { open } = disclosure

  const flat = Boolean(workspace?.settingsTarget)
  const content = (
    <div role="group" aria-labelledby={titleId} data-verification-settings-card>
      <Heading6 id={titleId} className="text-sm font-semibold">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-auto w-full justify-start gap-2 text-sm",
            flat
              ? "rounded-sm px-0 py-2 text-xs font-medium text-muted-foreground has-[>svg]:px-0"
              : "rounded-none px-3 py-2.5",
          )}
          aria-expanded={open}
          aria-controls={`${titleId}-body`}
          onClick={() =>
            setDisclosure({ running, open: !open, manualOpen: !open })
          }
        >
          {!flat ? (
            <SlidersHorizontal
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
          <span className="text-left">
            {title ??
              detail?.settingsTitle ??
              t("verifyDialog.tools.settingsTitle")}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              flat && "ml-auto",
              !open && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </Button>
      </Heading6>
      <div
        id={`${titleId}-body`}
        hidden={!open}
        className={cn(
          "space-y-4",
          flat ? "pt-2" : "border-t border-border-subtle p-4",
        )}
      >
        {children}
      </div>
    </div>
  )
  return flat ? (
    content
  ) : (
    <Card
      padding="none"
      className={cn(
        "max-w-full overflow-hidden bg-card shadow-none",
        !open && "w-fit",
      )}
    >
      {content}
    </Card>
  )
}
