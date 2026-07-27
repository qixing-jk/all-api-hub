type SiteRequestDispatch<T> = Promise<T> | { result: Promise<T> }

/** Runs the task shape accepted by mocked plain and lease site limiters. */
export async function runMockSiteRequestTask<T>(
  task: () => SiteRequestDispatch<T>,
): Promise<T> {
  const dispatched = task()
  return await ("result" in dispatched ? dispatched.result : dispatched)
}
