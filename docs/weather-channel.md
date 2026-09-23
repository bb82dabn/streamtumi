# StreamTumi Weather

StreamTumi Weather provides each signed-in user with a WeatherStar 4000+ feed
for the five-digit US ZIP code stored in private account settings. The captured
presentation uses the classic 16:9 mode at 1280x720:

```text
viewMode=wide
wide=true
enhanced=false
portrait=false
```

## Deployment

Start the core deployment first so the one-shot migration completes and the
owner account exists. Provision the weather station from the application image:

```sh
docker compose run --rm app npm run weather:provision -- --owner-email weather-owner@example.com
```

Then start the optional profile:

```sh
docker compose --profile weather up -d --build
```

Set `WEATHER_RENDER_CONCURRENCY` to the number of Chromium and FFmpeg slots
available in each renderer container. Each active ZIP uses a headed Chromium
process, an Xvfb display, and an FFmpeg encoder. Measure representative
locations before deciding host capacity or adding renderer replicas.

Feeds are shared by ZIP through an HMAC-derived location key. Public URLs
contain only an opaque, expiring playback session token. ZIP codes are not
included in catalog, HLS, or Roku URLs. `WEATHER_RENDER_IDLE_SECONDS` stops a
feed after its viewers leave.

## Upstream and egress

The profile builds the source vendored at `third_party/ws4kp`, WeatherStar
4000+ commit `7ec5f34e78047b445091111d74f53de267319283`, with
`Dockerfile.server`. WeatherStar 4000+ is by Matt Walsh and is included under
the MIT License.

The rendered page makes outbound requests to NOAA and other public weather data
services. Operators must account for that public data egress, inspect observed
requests before creating an allowlist, and revalidate the list whenever the
vendored revision changes. Upstream services and endpoints can change without
a StreamTumi release.

WeatherStar 4000+ is limited to US locations and must not be relied upon for
life-threatening weather decisions. It is a fan project. WeatherSTAR 4000
technology and associated trademarks belong to their respective owners.
StreamTumi Weather is not affiliated with or endorsed by The Weather Channel.
