import { spawnSync } from "node:child_process"
import { expect, it } from "vitest"

const identifier =
  "io.github.qixingjk.allapihub.nativeCookieTrial.run20261104000000000.Extension"
const key = `${identifier} (TESTTEAM)`
const run = (
  state: object,
  bundle = identifier,
  permissions = [
    "cookies",
    "nativeMessaging",
    "storage",
    "http://127.0.0.1/*",
    "http://localhost/*",
  ],
) =>
  spawnSync(
    process.env.AAH_SAFARI_TEST_PYTHON ?? "python3",
    [
      "-c",
      'import datetime,json,sys; from e2e.safari.activation import prepare_registration_state; data=json.load(sys.stdin); result=prepare_registration_state(data["state"],data["identifier"],data["permissions"],datetime.datetime(2026,11,4)); print(json.dumps({"prepared":result,"original":data["state"]},default=lambda value:value.isoformat()))',
    ],
    {
      input: JSON.stringify({
        state,
        identifier: bundle,
        permissions,
      }),
      encoding: "utf8",
      timeout: 5000,
    },
  )

it.each([
  identifier,
  "io.github.qixingjk.allapihub.nativeCookieTrial.run20261105123456789.Extension",
])(
  "prepares only the registered CI trial and grants its loopback fixture access (%s)",
  (bundle) => {
    const key = `${bundle} (TESTTEAM)`
    const state = {
      [key]: {
        Enabled: false,
        AddedDate: "2026-11-04T00:00:00",
        Permissions: [],
        RevokedPermissions: {
          cookies: "2026-11-04T00:00:00",
          nativeMessaging: "2026-11-04T00:00:00",
          bookmarks: "2026-11-04T00:00:00",
        },
        RevokedPermissionOrigins: {
          "http://127.0.0.1/*": "2026-11-04T00:00:00",
          "http://localhost/*": "2026-11-04T00:00:00",
          "https://example.test/*": "2026-11-04T00:00:00",
        },
      },
      "example.other.Extension (OTHER)": { Enabled: false, Permissions: [] },
    }
    const result = run(state, bundle)
    expect(result.status, result.stderr).toBe(0)
    const { prepared, original } = JSON.parse(result.stdout)
    expect(original).toEqual(state)
    expect(prepared["example.other.Extension (OTHER)"]).toEqual(
      state["example.other.Extension (OTHER)"],
    )
    expect(prepared[key]).toMatchObject({
      Enabled: true,
      EnabledByUserGesture: true,
      AddedDate: "2026-11-04T00:00:00",
      GrantedPermissionOrigins: {
        "http://127.0.0.1/*": "4001-01-01T00:00:00",
        "http://localhost/*": "4001-01-01T00:00:00",
      },
    })
    expect(prepared[key].AccessibleOrigins).toEqual([
      "http://127.0.0.1/*",
      "http://localhost/*",
    ])
    expect(prepared[key].Permissions).toEqual([
      "cookies",
      "nativeMessaging",
      "storage",
      "http://127.0.0.1/*",
      "http://localhost/*",
    ])
    expect(prepared[key].RevokedPermissionOrigins).not.toHaveProperty(
      "http://127.0.0.1/*",
    )
    expect(prepared[key].RevokedPermissionOrigins).not.toHaveProperty(
      "http://localhost/*",
    )
    expect(prepared[key].RevokedPermissionOrigins).toHaveProperty(
      "https://example.test/*",
      "2026-11-04T00:00:00",
    )
    expect(prepared[key].GrantedPermissionOrigins).not.toHaveProperty("*://*/*")
    expect(prepared[key].GrantedPermissions).toMatchObject({
      cookies: "4001-01-01T00:00:00",
      nativeMessaging: "4001-01-01T00:00:00",
    })
    expect(prepared[key].RevokedPermissions).not.toHaveProperty("cookies")
    expect(prepared[key].RevokedPermissions).not.toHaveProperty(
      "nativeMessaging",
    )
    expect(prepared[key].RevokedPermissions).toHaveProperty(
      "bookmarks",
      "2026-11-04T00:00:00",
    )
  },
)

const invalidRegistrationCases: {
  state: object
  bundle: string
  permissions?: string[]
  error: string
}[] = [
  { state: {}, bundle: identifier, error: "registered trial" },
  {
    state: { [key]: {}, [`${identifier} (OTHERTEAM)`]: {} },
    bundle: identifier,
    error: "registered trial",
  },
  {
    state: { [key]: { RemovedDate: "2026-11-04T00:00:00" } },
    bundle: identifier,
    error: "registered trial",
  },
  {
    state: { "io.github.qixingjk.allapihub.Extension (TEAM)": {} },
    bundle: "io.github.qixingjk.allapihub.Extension",
    error: "generated CI trial",
  },
  ...["cookies", "nativeMessaging"].map((missingPermission) => ({
    state: { [key]: {} },
    bundle: identifier,
    permissions: ["cookies", "nativeMessaging"].filter(
      (permission) => permission !== missingPermission,
    ),
    error: "Missing CI fixture permissions",
  })),
]

it.each(invalidRegistrationCases)(
  "rejects invalid trial registration or fixture permissions (%j)",
  ({ state, bundle, permissions, error }) => {
    const result = run(state, bundle, permissions)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(error)
  },
)
