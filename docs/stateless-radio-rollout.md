# Stateless Radio Rollout

Scheduled Radio can deliver clock-derived live HLS from immutable per-track AAC
segments. Existing stations remain on supervised playout until their active
clock release and current timeline are fully prepared for static HLS delivery.

## Deployment order

1. Start the application and Radio services together. The one-shot Compose
   migration applies `029_stateless_radio_delivery.sql` before the app starts.

   ```sh
   docker compose --profile radio up -d --build
   ```

2. Leave `radio-playout` running for stations still using `PLAYOUT` mode.
3. Queue immutable AAC HLS generation for existing tracks:

   ```sh
   docker compose run --rm app npm run radio:backfill-hls
   ```

4. Wait for the `radio-prep` queue to drain and investigate failed jobs.
5. Activate clock stations whose active release and current timeline are fully
   prepared:

   ```sh
   docker compose run --rm app npm run radio:backfill-hls -- --activate-ready
   ```

6. Verify station state, master and media playlists, segment audio levels,
   release rollover, web playback, mobile background playback, and Roku.

Both backfill command forms are safe to run repeatedly. Stations without a
fully prepared active clock release remain on `PLAYOUT`.

## Rollback

Set an affected station's `radio_delivery_mode` back to `PLAYOUT`. The
supervisor will acquire it during its next reconciliation cycle. Do not delete
FLAC mezzanines, playout tables, session routes, or the `radio-playout` service
during the rollout window.

## Capacity behavior

Static clock stations consume processing during track preparation rather than
requiring one continuous encoder per station. Listener delivery is AAC at 128
kbps; public immutable segments are cacheable. Dynamic media playlists remain
private and uncached because they are derived from current server time.

Static audio uses one-second segments, so a clock cut inside an immutable
MPEG-TS segment can differ by at most one second. Exact sample-level boundary
fragments remain future work; do not configure sub-second IDs, jingles, or
transitions that require sample-accurate cuts.
