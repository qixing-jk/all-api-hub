import { useCallback } from "react"

import { WorkflowTransitionButton } from "~/components/ui"
import { openAccountManagerWithSearch } from "~/utils/navigation"

interface AccountLinkButtonProps {
  accountId: string
  accountName: string
  className?: string
}

/**
 * A button that links to the account manager page with the given account ID.
 * @param props - The properties of the button.
 * @param props.accountId - The ID of the account to link to.
 * @param props.accountName - The name of the account to display.
 * @param [props.className] - The CSS class name to apply to the button.
 */
export default function AccountLinkButton({
  accountId,
  accountName,
  className,
}: AccountLinkButtonProps) {
  const handleClick = useCallback(async () => {
    await openAccountManagerWithSearch(accountId)
  }, [accountId])

  return (
    <WorkflowTransitionButton
      variant="link"
      className={className}
      onClick={handleClick}
      aria-label={`View account ${accountName} in manager`}
    >
      <span className="truncate">{accountName}</span>
    </WorkflowTransitionButton>
  )
}
