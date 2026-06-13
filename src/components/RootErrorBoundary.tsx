import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { createLogger } from "~/utils/core/logger"
import { getFeedbackDestinationUrls } from "~/utils/navigation/feedbackLinks"

const logger = createLogger("RootErrorBoundary")

type RootErrorBoundaryProps = {
  children: ReactNode
  reloadPage?: () => void
}

type RootErrorBoundaryState = {
  hasError: boolean
}

/**
 * Reloads the current extension page so users can recover from a root render crash.
 */
function reloadCurrentPage() {
  window.location.reload()
}

/**
 * Renders a small recovery surface when the React root cannot render normally.
 */
function RootErrorFallback({
  reloadPage = reloadCurrentPage,
}: Pick<RootErrorBoundaryProps, "reloadPage">) {
  const { t } = useTranslation("common")
  const languageRequestUrl = getFeedbackDestinationUrls().languageRequest

  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center px-4 py-8">
      <section className="bg-card w-full max-w-md rounded-lg border p-6 text-center shadow-sm">
        <div className="bg-destructive/10 text-destructive mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">
          {t("rootErrorBoundary.title")}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          {t("rootErrorBoundary.description")}
        </p>
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button
            type="button"
            leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
            onClick={reloadPage}
          >
            {t("rootErrorBoundary.reload")}
          </Button>
          <Button
            asChild
            variant="outline"
            leftIcon={<ExternalLink className="size-4" aria-hidden="true" />}
          >
            <a href={languageRequestUrl} target="_blank" rel="noreferrer">
              {t("rootErrorBoundary.requestLanguage")}
            </a>
          </Button>
        </div>
      </section>
    </main>
  )
}

export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    logger.error("Root UI crashed", { error, componentStack: errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return <RootErrorFallback reloadPage={this.props.reloadPage} />
    }

    return this.props.children
  }
}
