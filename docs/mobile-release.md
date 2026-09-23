# Mobile Releases

StreamTumi mobile is an Expo SDK 57 project rooted at `apps/mobile`. Native
projects are generated locally and intentionally excluded from source control.
There is no remote build or release service in this repository.

The commands below are the checked-in local command shapes. The public Expo
configuration was evaluated with production environment values during this
documentation update. Native generation, signing, store upload, and physical
device installation were not performed.

## Configure the app

Run commands from `apps/mobile`. Install exactly from the mobile lockfile and
create an untracked local environment file:

```sh
npm ci
cp .env.example .env.local
```

Set both public values for a production build:

```dotenv
EXPO_PUBLIC_API_ORIGIN=https://streamtumi.example.com
EXPO_PUBLIC_APP_HOST=streamtumi.example.com
```

`EXPO_PUBLIC_API_ORIGIN` must be an HTTP or HTTPS origin without credentials,
a path, query, or fragment. `EXPO_PUBLIC_APP_HOST` is the hostname only, with no
scheme, port, or path. Use the same canonical host as the server's `APP_URL`.
Development defaults to `http://localhost:3000` and `localhost`; production
configuration fails when either value is absent.

Run the project checks and inspect the resolved public configuration before
generating native projects:

```sh
NODE_ENV=production npm run check
NODE_ENV=production npm run config
```

Public Expo variables are embedded in the client. Never put passwords, signing
keys, server secrets, or private service credentials in an `EXPO_PUBLIC_`
variable.

## Release metadata

The checked-in metadata is:

| Setting | Value |
| --- | --- |
| App version | `1.0.0` |
| iOS bundle identifier | `com.streamtumi.mobile` |
| iOS build number | `1` |
| Android package | `com.streamtumi.mobile` |
| Android version code | `7` |
| iOS deployment target | `16.4` |
| Android minimum SDK | `29` |

Update the app version and platform build numbers deliberately before a store
release. Store version requirements and previously uploaded build numbers
cannot be inferred from the repository.

The app shell is portrait and does not support iPad. The native TV player may
request landscape fullscreen. Picture in Picture and background audio require
a generated native build because Expo Go cannot apply those native settings.
Icons are under `apps/mobile/assets`.

## Generate and build locally

Generate fresh native projects after the configuration checks pass:

```sh
NODE_ENV=production npx expo prebuild
```

This creates ignored `ios/` and `android/` directories under `apps/mobile`.
Review generated permissions, entitlements, manifests, build settings, and
dependency changes before signing.

For local release-mode device testing, Expo provides these command forms:

```sh
NODE_ENV=production npx expo run:ios --configuration Release --device
NODE_ENV=production npx expo run:android --variant release --device
```

iOS generation and compilation require macOS and Xcode. Create an archive from
the generated Xcode workspace using operator-owned distribution signing and
provisioning. For Android, configure operator-owned release signing in the
generated project, then build the required APK or app bundle with the generated
Gradle wrapper. Do not commit private keys, provisioning profiles, signing
passwords, or store credentials.

Exact archive, signing, and upload commands depend on the operator's local
Xcode, Android SDK, and store configuration and are not supplied by this
repository. Install signed release artifacts on physical devices before
submission.

## Association hosts

The server must route these paths directly to the Next application:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Set server-side `APPLE_APP_ID` to the application association identifier in
`TEAMID.com.streamtumi.mobile` form. This value configures universal links; it
is not an authentication provider. Set `ANDROID_APP_CERT_SHA256` to the SHA-256
fingerprint of the certificate that signs the installed Android app. Multiple
comma-separated fingerprints are accepted during a signing-key rotation.

Until the applicable value is valid, its association endpoint returns an
uncached generic `503` rather than an incomplete document. The selected host
claims `/watch/*`, `/listen/*`, and `/verify-email`.

After deployment, request both files from the canonical HTTPS host and verify
`Content-Type: application/json` and `Cache-Control: no-store, max-age=0`.
Use the final distribution certificate fingerprint for Android association,
not a local debug certificate.

## Release validation

Repository checks can validate TypeScript, lint rules, unit tests, Expo health,
and resolved public configuration. They do not prove certificate association
propagation, entitlement provisioning, signing, store review metadata, or
device behavior.

Before distributing a build, test on physical iOS and Android devices:

- password sign-in, registration policy, verification, and password reset;
- `/watch/*`, `/listen/*`, and `/verify-email` links;
- TV playback, seeking, Picture in Picture, and fullscreen rotation;
- radio playback and background audio;
- session refresh, sign-out, and upgrade behavior; and
- behavior with an unavailable or invalid server origin.
