/** Bind locally before provisioning accounts; shutdown also joins pending setup. */
export function startOwnedFixture(
  server,
  { port, prepare, onPrepared, onCleanup },
) {
  let stopping = false
  let fixture
  let shutdown
  let setupFailed = false
  const listening = new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  const preparation = (async () => {
    await listening
    if (stopping) return
    fixture = await prepare()
    if (!stopping) onPrepared(fixture)
  })().catch((error) => {
    setupFailed = true
    throw error
  })
  const close = () => {
    shutdown ??= (async () => {
      stopping = true
      await listening.catch(() => {})
      const closed = new Promise((resolve) => server.close(resolve))
      server.closeAllConnections()
      await preparation.catch(() => {})
      try {
        await fixture?.cleanup?.()
      } catch (error) {
        onCleanup(false)
        throw error
      } finally {
        await closed
      }
      onCleanup(!setupFailed)
    })()
    return shutdown
  }
  const ready = preparation.catch(async (error) => {
    await close()
    throw error
  })
  return { ready, close }
}
