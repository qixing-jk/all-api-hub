import { Card, CardContent, CardList } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

interface AccountListLoadingPlaceholderRowsProps {
  rowCount: number
}

/**
 * Renders placeholder rows for the account list skeleton state.
 */
function AccountListLoadingPlaceholderRows({
  rowCount,
}: AccountListLoadingPlaceholderRowsProps) {
  return (
    <>
      {Array.from({ length: rowCount }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3 sm:px-4">
          <div className="dark:bg-dark-bg-tertiary h-9 w-9 shrink-0 rounded-full bg-gray-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="dark:bg-dark-bg-tertiary h-4 w-[42%] rounded bg-gray-200" />
            <div className="dark:bg-dark-bg-tertiary h-3 w-[28%] rounded bg-gray-200" />
          </div>
          <div className="w-24 shrink-0 space-y-2">
            <div className="dark:bg-dark-bg-tertiary ml-auto h-4 w-20 rounded bg-gray-200" />
            <div className="dark:bg-dark-bg-tertiary ml-auto h-3 w-14 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </>
  )
}

interface AccountListInitialLoadingStateProps {
  label: string
}

/**
 * Renders the initial loading skeleton for the account list view.
 */
export function AccountListInitialLoadingState({
  label,
}: AccountListInitialLoadingStateProps) {
  return (
    <Card
      padding="none"
      className="overflow-hidden"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}
      aria-busy="true"
    >
      <CardContent padding="none" spacing="none">
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-b border-gray-200 bg-white px-3 py-3 sm:px-5">
          <div className="animate-pulse space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
              </span>
              <span>{label}</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <div className="dark:bg-dark-bg-tertiary h-10 rounded bg-gray-200" />
              <div className="dark:bg-dark-bg-tertiary h-10 rounded bg-gray-200" />
            </div>
            <div className="dark:bg-dark-bg-tertiary h-8 rounded bg-gray-200" />
          </div>
        </div>

        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary border-b border-gray-200 bg-gray-50 px-3 py-3 sm:px-5">
          <div className="flex animate-pulse items-center justify-between gap-4">
            <div className="dark:bg-dark-bg-tertiary h-4 w-40 rounded bg-gray-200" />
            <div className="dark:bg-dark-bg-tertiary h-4 w-28 rounded bg-gray-200" />
          </div>
        </div>

        <div className="animate-pulse">
          <CardList>
            <AccountListLoadingPlaceholderRows rowCount={6} />
          </CardList>
        </div>
      </CardContent>
    </Card>
  )
}
