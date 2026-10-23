/**
 * Start a download from an attached anchor. WebKit may resolve the Blob URL
 * after click() returns, so keep it alive until the browser has consumed it.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const release = () => {
    link.remove()
    URL.revokeObjectURL(url)
  }
  try {
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } catch (error) {
    release()
    throw error
  }
  setTimeout(release, 1000)
}
