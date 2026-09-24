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
        <div
          key={index}
          className="gap-y-density-3 py-density-3 flex items-center gap-x-3 px-3 sm:px-4"
        >
          <div className="bg-secondary h-9 w-9 shrink-0 rounded-full" />
          <div className="space-y-density-2 min-w-0 flex-1">
            <div className="bg-secondary h-4 w-[42%] rounded" />
            <div className="bg-secondary h-3 w-[28%] rounded" />
          </div>
          <div className="space-y-density-2 w-24 shrink-0">
            <div className="bg-secondary ml-auto h-4 w-20 rounded" />
            <div className="bg-secondary ml-auto h-3 w-14 rounded" />
          </div>
        </div>
      ))}
    </>
  )
}

/**
 * Renders the initial loading skeleton for the account list view.
 */
export function AccountListInitialLoadingState() {
  return (
    <Card
      padding="none"
      className="overflow-hidden"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}
      data-options-page-pending
      aria-busy="true"
    >
      <CardContent padding="none" spacing="none">
        <div className="dark:bg-background border-border bg-card py-density-3 border-b px-3 sm:px-5">
          <div className="space-y-density-3 animate-pulse">
            <div className="gap-y-density-3 grid gap-x-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <div className="bg-secondary h-10 rounded" />
              <div className="bg-secondary h-10 rounded" />
            </div>
            <div className="bg-secondary h-8 rounded" />
          </div>
        </div>

        <div className="dark:bg-card border-border bg-surface-subtle py-density-3 border-b px-3 sm:px-5">
          <div className="gap-y-density-4 flex animate-pulse items-center justify-between gap-x-4">
            <div className="bg-secondary h-4 w-40 rounded" />
            <div className="bg-secondary h-4 w-28 rounded" />
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
