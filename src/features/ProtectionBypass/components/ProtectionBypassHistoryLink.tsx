import { History } from "lucide-react"
import { useState, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionButton } from "~/components/ui"
import toast from "~/lib/notify/content"
import { cn } from "~/lib/utils"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProtectionBypassHistoryLink")

interface ProtectionBypassHistoryLinkProps {
  onOpen: () => void | Promise<void>
  className?: string
}

/** A secondary diagnostic action with navigation owned by its UI surface. */
export function ProtectionBypassHistoryLink({
  onOpen,
  className,
}: ProtectionBypassHistoryLinkProps) {
  const { t } = useTranslation(["shieldBypass", "messages"])
  const [isOpening, setIsOpening] = useState(false)

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsOpening(true)
    try {
      await onOpen()
    } catch (error) {
      logger.error("Failed to open protection bypass history", error)
      toast.error(t("messages:toast.error.operationFailedGeneric"))
    } finally {
      setIsOpening(false)
    }
  }

  return (
    <WorkflowTransitionButton
      variant="link"
      size="sm"
      className={cn(
        "h-auto max-w-full justify-start p-0 text-left whitespace-normal",
        className,
      )}
      leftIcon={<History className="size-3.5" aria-hidden="true" />}
      title={t("shieldBypass:history.entryDescription")}
      loading={isOpening}
      disabled={isOpening}
      onClick={handleClick}
    >
      {t("shieldBypass:history.open")}
    </WorkflowTransitionButton>
  )
}
