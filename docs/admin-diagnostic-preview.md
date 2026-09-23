# Administrator diagnostic preview

The station inventory provides an administrator-only diagnostic preview for troubleshooting playback without disclosing the station's viewer bearer token.

Opening a preview requires a reason of at least 10 characters. The server records `ADMIN_STATION_DIAGNOSTIC_OPENED` in `admin_audit_log`, then issues a station- and administrator-bound HttpOnly grant that expires after 15 minutes. The grant never contains the viewer token and is rechecked with the current administrator role on every state, manifest, and segment request.

The preview bypasses viewer-link enablement, password, expiration, visibility, and moderation restrictions. It does not bypass station deletion or broadcast state: deleted stations are unavailable and stopped stations remain off air. This keeps the preview useful for access troubleshooting without presenting a stopped station as live.

Diagnostic media routes are read-only, limited to the active immutable schedule, and return `Cache-Control: private, no-store`. The preview omits chat, presence heartbeats, fans, ratings, and reporting, so opening it does not increment the audience count or act as a viewer.

The admin dashboard payload contains only station UUIDs and non-secret operational metadata. Plaintext viewer tokens, token hashes, ciphertext, hints, passwords, and viewer URLs must never be added to the admin station model, diagnostic audit metadata, or preview state.
