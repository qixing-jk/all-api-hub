import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  BodySmall,
  Button,
  Checkbox,
  FormField,
  Heading4,
  IconButton,
  Input,
  Modal,
} from "~/components/ui"

/**
 * Props for {@link WebDAVDecryptPasswordModal}.
 */
export type WebDAVDecryptPasswordModalProps = {
  /** Whether the modal is visible. */
  isOpen: boolean
  /** Whether a decrypt/import attempt is currently in progress. */
  decrypting: boolean
  /** Current password value shown in the input. */
  password: string
  /** Called when the password input changes. */
  onPasswordChange: (password: string) => void
  /** Whether to persist the successfully-entered password into WebDAV settings. */
  savePassword: boolean
  /** Called when the "save password" checkbox changes. */
  onSavePasswordChange: (save: boolean) => void
  /** Called when the modal should close (cancel). */
  onClose: () => void
  /** Called when the user confirms and wants to decrypt and import. */
  onDecryptAndImport: () => void
}

/**
 * Decrypt password retry dialog used during WebDAV restore.
 *
 * This modal is shown when the downloaded backup is encrypted and decrypting
 * with the stored password fails or no password is available.
 *
 * Notes:
 * - Provides an in-field show/hide password toggle.
 * - Close actions are disabled while `decrypting` is true.
 */
export function WebDAVDecryptPasswordModal({
  isOpen,
  decrypting,
  password,
  onPasswordChange,
  savePassword,
  onSavePasswordChange,
  onClose,
  onDecryptAndImport,
}: WebDAVDecryptPasswordModalProps) {
  const { t } = useTranslation("importExport")
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (decrypting) return
        onClose()
      }}
      size="md"
      header={
        <div className="space-y-1">
          <Heading4 className="m-0">
            {t("webdav.encryption.decryptDialogTitle")}
          </Heading4>
          <BodySmall className="m-0">
            {t("webdav.encryption.decryptDialogDesc")}
          </BodySmall>
        </div>
      }
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={decrypting}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onDecryptAndImport}
            loading={decrypting}
            disabled={decrypting}
          >
            {t("webdav.encryption.decryptAction")}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <FormField label={t("webdav.encryption.decryptPassword")}>
          <Input
            id="decryptPassword"
            title={t("webdav.encryption.decryptPassword")}
            type={showPassword ? "text" : "password"}
            placeholder={t("webdav.encryption.passwordPlaceholder")}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            rightIcon={
              <IconButton
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword
                    ? t("webdav.hidePassword")
                    : t("webdav.showPassword")
                }
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </IconButton>
            }
          />
        </FormField>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={savePassword}
            onCheckedChange={(v) => onSavePasswordChange(Boolean(v))}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {t("webdav.encryption.savePassword")}
          </span>
        </div>
      </div>
    </Modal>
  )
}
