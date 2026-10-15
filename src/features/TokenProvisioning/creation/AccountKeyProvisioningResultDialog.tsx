import { CirclePause, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button, Modal } from "~/components/ui"

export type ProvisioningResult = "cancelled" | "failed" | "uncertain"

/** A retained result needs a deliberate acknowledgement, without offering blind retries. */
export function AccountKeyProvisioningResultDialog({
  result,
  accountName,
  created,
  covered,
  total,
  onClose,
}: {
  result: ProvisioningResult
  accountName: string
  created: number
  covered: number
  total: number
  onClose: () => void
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const title =
    result === "cancelled"
      ? t("keyManagement:provisioning.result.cancelled")
      : result === "uncertain"
        ? t("keyManagement:provisioning.result.uncertain")
        : t("keyManagement:provisioning.result.failed")
  const Icon = result === "cancelled" ? CirclePause : TriangleAlert
  return (
    <Modal
      isOpen
      size="md"
      title={title}
      header={
        <h2 className="text-foreground text-lg font-semibold">{title}</h2>
      }
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{t("common:actions.close")}</Button>
        </div>
      }
    >
      <div className="gap-density-4 flex flex-col">
        <div className="gap-density-3 flex items-start">
          <span className="bg-muted text-muted-foreground rounded-lg p-2">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="space-y-density-1 min-w-0">
            <p className="text-foreground text-sm font-medium break-words">
              {accountName}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("keyManagement:provisioning.result.retained")}
            </p>
          </div>
        </div>
        <dl className="bg-muted/50 grid grid-cols-3 rounded-lg border p-3">
          {[
            [t("keyManagement:provisioning.result.created"), created],
            [t("keyManagement:provisioning.result.covered"), covered],
            [
              t("keyManagement:provisioning.result.remaining"),
              Math.max(0, total - created),
            ],
          ].map(([label, count]) => (
            <div key={label} className="space-y-density-1 px-2 text-center">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-foreground text-xl font-semibold tabular-nums">
                {count}
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-density-1 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {t("keyManagement:provisioning.result.next")}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {result === "uncertain"
              ? t("keyManagement:native.editor.feedback.uncertain")
              : result === "failed"
                ? t("keyManagement:native.editor.feedback.error")
                : t("keyManagement:provisioning.result.resume")}
          </p>
        </div>
      </div>
    </Modal>
  )
}
