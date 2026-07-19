import { AlertTriangle, RefreshCw } from "lucide-react"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button } from "~/components/ui/button"
import { createLogger } from "~/utils/core/logger"
import { getFeedbackDestinationUrls } from "~/utils/navigation/feedbackLinks"

const logger = createLogger("RootErrorBoundary")

type RootErrorBoundaryProps = {
  children: ReactNode
  reloadPage?: () => void
}

type RootErrorBoundaryState = {
  error: unknown
  hasError: boolean
}

/**
 * Reloads the current extension page so users can recover from a root render crash.
 */
function reloadCurrentPage() {
  window.location.reload()
}

/**
 * Detects React root crashes that match browser translation DOM rewrites.
 */
function isLikelyExternalDomMutationError(error: unknown) {
  if (!(error instanceof Error || error instanceof DOMException)) {
    return false
  }

  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  return (
    (error instanceof DOMException && name === "notfounderror") ||
    (message.includes("node") &&
      (message.includes("removechild") || message.includes("insertbefore")))
  )
}

/**
 * Renders a small recovery surface when the React root cannot render normally.
 */
function RootErrorFallback({
  error,
  reloadPage = reloadCurrentPage,
}: Pick<RootErrorBoundaryProps, "reloadPage"> & {
  error: unknown
}) {
  const { t } = useTranslation("common")
  const feedbackUrls = getFeedbackDestinationUrls()
  const showTranslationGuidance = isLikelyExternalDomMutationError(error)

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
          {t("rootErrorBoundary.genericDescription")}
        </p>
        {showTranslationGuidance ? (
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {t("rootErrorBoundary.translationDescription")}
          </p>
        ) : null}
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
            leftIcon={
              <WorkflowTransitionIcon className="size-4" aria-hidden="true" />
            }
          >
            <a
              href={
                showTranslationGuidance
                  ? feedbackUrls.languageRequest
                  : feedbackUrls.bugReport
              }
              target="_blank"
              rel="noreferrer"
            >
              {showTranslationGuidance
                ? t("rootErrorBoundary.requestLanguage")
                : t("rootErrorBoundary.reportIssue")}
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
    error: null,
    hasError: false,
  }

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { error, hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    logger.error("Root UI crashed", { error, componentStack: errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <RootErrorFallback
          error={this.state.error}
          reloadPage={this.props.reloadPage}
        />
      )
    }

    return this.props.children
  }
}
