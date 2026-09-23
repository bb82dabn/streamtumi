# StreamTumi Mobile

Expo SDK 57 client for the StreamTumi TV and Radio catalog. Development,
native project generation, signing, and release builds are local only.

## Configuration

Set `EXPO_PUBLIC_API_ORIGIN` to the HTTP or HTTPS origin serving the StreamTumi
API. Set `EXPO_PUBLIC_APP_HOST` to that deployment's hostname without a scheme,
port, or path. Both values are required when `NODE_ENV=production`;
development defaults to `http://localhost:3000` and `localhost`.

The configured host claims `/watch/*`, `/listen/*`, and `/verify-email`. It must
serve matching Apple App Site Association and Android Digital Asset Links
documents for installed-app links to work.

The client uses `GET /api/mobile/v1/catalog`. Catalog stations must include
absolute `stationUrl` and `chatUrl` values on the configured API origin.

Release metadata and native plugins are in `app.json` and `app.config.ts`.
Run `npm run check` before generating native projects. See
`../../docs/mobile-release.md` for local release steps and signing boundaries.

## Development

From `apps/mobile`, install the lockfile and start Expo locally:

```sh
npm ci
npm start
```

Use `npm run ios` or `npm run android` to open the corresponding local target.
Generate ignored native projects when required with:

```sh
NODE_ENV=production npx expo prebuild
```

Picture in Picture and background audio require a generated development or
release build because Expo Go cannot apply those native settings.

The app shell is portrait and iPhone-focused. TV playback retains Expo Video's
native landscape fullscreen request. Expo SDK 57 targets iOS 16.4 and newer;
Android targets minSdk 29 and newer.
