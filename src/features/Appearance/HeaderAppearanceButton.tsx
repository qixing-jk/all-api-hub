import { Palette } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"

import { AppearanceDrawer } from "./AppearanceDrawer"

/** Opens appearance controls directly from the options-page header. */
export default function HeaderAppearanceButton() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { t } = useTranslation("settings")

  return (
    <>
      <IconButton
        ref={triggerRef}
        variant="outline"
        size="sm"
        aria-label={t("appearance.title")}
        title={t("appearance.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Palette className="h-4 w-4" />
      </IconButton>
      <AppearanceDrawer
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.focus()
        }}
      />
    </>
  )
}
