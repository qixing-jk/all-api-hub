/**
 * Clipboard utilities for copying text
 */

/**
 * Copy text to clipboard
 * @param text - Text to copy
 * @returns Promise that resolves when copy is successful
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    // Fallback to execCommand
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()

    const success = document.execCommand("copy")
    document.body.removeChild(textarea)

    if (!success) {
      throw new Error("Failed to copy text")
    }
  } catch (error) {
    console.error("Failed to copy to clipboard:", error)
    throw error
  }
}
