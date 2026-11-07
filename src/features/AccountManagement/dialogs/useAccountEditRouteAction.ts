import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ACCOUNT_FORM_SECTION_IDS } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import { supportsAccountCredentialRecovery } from "~/features/AccountManagement/credentialRecovery/guidance"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/dialogs/useDialogStateContext"
import {
  ACCOUNT_MANAGEMENT_ROUTE_ACTIONS,
  ACCOUNT_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/AccountManagement/routeParams"
import toast from "~/lib/notify"
import { replaceWithinOptionsPage } from "~/utils/navigation/optionsPage"

/** Opens a requested saved account after loading, without replacing an active editor. */
export function useAccountEditRouteAction({
  routeAction,
  routeAccountId,
  routeFocusSection,
}: {
  routeAction?: string
  routeAccountId?: string
  routeFocusSection?: string
}) {
  const { t } = useTranslation("messages")
  const { displayData, isInitialLoad } = useAccountDataContext()
  const { openEditAccount, isAddAccountOpen, isEditAccountOpen } =
    useDialogStateContext()
  const consumedRoute = useRef<string | null>(null)

  useEffect(() => {
    if (routeAction !== ACCOUNT_MANAGEMENT_ROUTE_ACTIONS.Edit) {
      consumedRoute.current = null
      return
    }
    if (
      !routeAccountId ||
      isInitialLoad ||
      isAddAccountOpen ||
      isEditAccountOpen
    )
      return
    const routeKey = JSON.stringify([routeAccountId, routeFocusSection])
    if (consumedRoute.current === routeKey) return
    consumedRoute.current = routeKey

    const account = displayData.find(
      (candidate) => candidate.id === routeAccountId,
    )
    if (account) {
      const requestedSection = ACCOUNT_FORM_SECTION_IDS.find(
        (id) => id === routeFocusSection,
      )
      const focusSection =
        requestedSection === "account-login" &&
        !supportsAccountCredentialRecovery(account)
          ? "account-auth"
          : requestedSection
      openEditAccount(account, focusSection ? { focusSection } : undefined)
    } else {
      toast.error(t("messages:storage.accountNotFound", { id: routeAccountId }))
    }

    // Consume the action so the same guidance button can reopen the editor after closing it.
    const params = Object.fromEntries(
      new URLSearchParams(window.location.search),
    )
    delete params[ACCOUNT_MANAGEMENT_ROUTE_PARAMS.Action]
    delete params[ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountId]
    delete params[ACCOUNT_MANAGEMENT_ROUTE_PARAMS.FocusSection]
    replaceWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`, params)
  }, [
    displayData,
    isInitialLoad,
    isAddAccountOpen,
    isEditAccountOpen,
    openEditAccount,
    routeAction,
    routeAccountId,
    routeFocusSection,
    t,
  ])
}
