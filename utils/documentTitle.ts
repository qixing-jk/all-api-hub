import i18n from "./i18n"

/**
 * Initializes the document title and sets up a listener for language changes
 * @param pageType - The type of page ('options', 'popup', or 'sidepanel')
 */
export function initializeDocumentTitle(
  pageType: "options" | "popup" | "sidepanel",
): void {
  // Set initial title
  setDocumentTitle(pageType)

  // Update title when language changes
  i18n.on("languageChanged", () => {
    setDocumentTitle(pageType)
  })
}

/**
 * Simple function to set document title based on page type
 * This can be called before i18n is fully initialized
 * @param pageType - The type of page ('options', 'popup', or 'sidepanel')
 */
export function setDocumentTitle(
  pageType: "options" | "popup" | "sidepanel",
): void {
  try {
    document.title = i18n.t(`ui:pageTitle.${pageType}`)
  } catch (error) {
    console.error(error)
  }
}
