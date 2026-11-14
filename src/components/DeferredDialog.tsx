import { Suspense, useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { RootErrorBoundary } from "~/components/RootErrorBoundary"
import { Button } from "~/components/ui/button"
import { DeferredDialogFocusContext } from "~/components/ui/Dialog/DeferredDialogFocusContext"
import { Modal } from "~/components/ui/Dialog/Modal"
import { Spinner } from "~/components/ui/spinner"

interface DialogProps {
  isOpen: boolean
  onClose: () => void
}

/** Keep the dialog dismissible while its module loads. */
function LoadingDialog(props: DialogProps) {
  const { t } = useTranslation("common")
  return (
    <Modal {...props} restoreDeferredFocus title={t("status.loading")}>
      <Spinner />
    </Modal>
  )
}

/** Keep failed work local; a rejected lazy module requires a page reload. */
function FailedDialog(props: DialogProps) {
  const { t } = useTranslation("common")
  return (
    <Modal
      {...props}
      restoreDeferredFocus
      title={t("status.error")}
      header={
        <h2 className="pr-8 text-lg font-semibold text-foreground">
          {t("status.error")}
        </h2>
      }
      footer={
        <Button onClick={() => window.location.reload()}>
          {t("rootErrorBoundary.reload")}
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        {t("dialogErrorBoundary.description")}
      </p>
    </Modal>
  )
}

/** Keep deferred dialogs dismissible; the caller owns workspace mounting. */
export function DeferredDialog({
  children,
  ...props
}: DialogProps & { children: ReactNode }) {
  const opener = useMemo(
    () =>
      props.isOpen &&
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    [props.isOpen],
  )
  return (
    <DeferredDialogFocusContext.Provider value={opener}>
      <RootErrorBoundary fallback={<FailedDialog {...props} />}>
        <Suspense fallback={<LoadingDialog {...props} />}>{children}</Suspense>
      </RootErrorBoundary>
    </DeferredDialogFocusContext.Provider>
  )
}
