import {
  ArrowLeftRight,
  CalendarCheck2,
  Globe2,
  KeyRound,
  Layers,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Tag,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react"
import { describe, expect, it } from "vitest"

import {
  OPTIONS_CAPABILITY_ICONS,
  OPTIONS_MENU_ITEM_ICONS,
} from "~/components/icons/optionsPageIcons"
import {
  AccountBalanceIcon,
  AccountKeyIcon,
  AccountManagementIcon,
  AccountSiteIcon,
  AccountSiteTypeIcon,
  AccountTagIcon,
  AccountUserIcon,
  AutoCheckinIcon,
  EditActionIcon,
  ImportExportIcon,
  ManagedSiteModelSyncIcon,
  RefreshActionIcon,
  ResetActionIcon,
} from "~/components/icons/productIcons"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ACCOUNT_EDIT_SECTIONS } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"

describe("Icon consistency across features and shared interactions", () => {
  it("uses the same section icons in the account editor and surrounding product", () => {
    expect(ACCOUNT_EDIT_SECTIONS.map(({ icon }) => icon)).toEqual([
      Globe2,
      ShieldCheck,
      AutoCheckinIcon,
      AccountBalanceIcon,
      Tag,
    ])
  })

  it("defines unified feature and action icon constants", () => {
    expect(AccountSiteIcon).toBe(Globe2)
    expect(AccountSiteTypeIcon).toBe(Layers)
    expect(AccountTagIcon).toBe(Tag)
    expect(AccountUserIcon).toBe(UserRound)
    expect(AccountBalanceIcon).toBe(Wallet)
    expect(AccountManagementIcon).toBe(UsersRound)
    expect(AutoCheckinIcon).toBe(CalendarCheck2)
    expect(ManagedSiteModelSyncIcon).toBe(RefreshCw)
    expect(ImportExportIcon).toBe(ArrowLeftRight)
    expect(AccountKeyIcon).toBe(KeyRound)

    expect(RefreshActionIcon).toBe(RefreshCw)
    expect(EditActionIcon).toBe(Pencil)
    expect(ResetActionIcon).toBe(RotateCcw)
  })

  it("unifies feature icons in optionsPageIcons", () => {
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.ACCOUNT]).toBe(UsersRound)
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.AUTO_CHECKIN]).toBe(
      CalendarCheck2,
    )
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC]).toBe(
      RefreshCw,
    )
    expect(OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.IMPORT_EXPORT]).toBe(
      ArrowLeftRight,
    )

    expect(OPTIONS_CAPABILITY_ICONS.autoCheckin).toBe(CalendarCheck2)
    expect(OPTIONS_CAPABILITY_ICONS.managedSiteModelSync).toBe(RefreshCw)
  })
})
