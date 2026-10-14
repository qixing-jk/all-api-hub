/** Let callers finish their finally blocks after Ctrl+C or a capture deadline. */
export function waitForStop(duration, signals = process) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signals.removeListener("SIGINT", finish)
      signals.removeListener("SIGTERM", finish)
      resolve()
    }
    const timer = setTimeout(finish, duration)
    signals.once("SIGINT", finish)
    signals.once("SIGTERM", finish)
  })
}
