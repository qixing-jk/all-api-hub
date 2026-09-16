import { useTranslation } from "react-i18next"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"

import { AppearanceControls } from "./AppearanceControls"

/** Global appearance panel, available without leaving the current options page. */
export function AppearanceDrawer({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const { t } = useTranslation("settings")
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="w-full max-w-full overflow-clip sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{t("appearance.title")}</SheetTitle>
          <SheetDescription>{t("appearance.description")}</SheetDescription>
        </SheetHeader>
        <div className="py-density-4 min-h-0 flex-1 overflow-y-auto px-4 pt-0">
          <AppearanceControls showMode showPreview={false} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
