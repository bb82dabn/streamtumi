--
-- PostgreSQL database dump
--

-- StreamTumi v0.1 standalone baseline. Generated from the final schema after
-- removing hosted identity, external relay, and live ingest infrastructure.

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg120+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg120+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: calendar_dst_fold_policy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_dst_fold_policy AS ENUM (
    'EARLIER',
    'LATER'
);


--
-- Name: calendar_dst_gap_policy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_dst_gap_policy AS ENUM (
    'SKIP',
    'SHIFT_FORWARD'
);


--
-- Name: calendar_event_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_event_kind AS ENUM (
    'PROGRAM',
    'PREMIERE',
    'OFFLINE'
);


--
-- Name: calendar_exception_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_exception_kind AS ENUM (
    'CANCEL',
    'MOVE'
);


--
-- Name: calendar_late_join_policy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_late_join_policy AS ENUM (
    'SKIP',
    'JOIN_IN_PROGRESS'
);


--
-- Name: calendar_materialization_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_materialization_status AS ENUM (
    'PENDING',
    'RUNNING',
    'READY',
    'FAILED'
);


--
-- Name: calendar_recurrence_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_recurrence_kind AS ENUM (
    'NONE',
    'DAILY',
    'WEEKLY',
    'MONTHLY'
);


--
-- Name: calendar_runtime_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_runtime_status AS ENUM (
    'IDLE',
    'PLAYING',
    'OFFLINE',
    'FALLBACK',
    'FAILED'
);


--
-- Name: calendar_runtime_transition_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_runtime_transition_kind AS ENUM (
    'RELEASE_ACTIVATED',
    'OCCURRENCE_STARTED',
    'OCCURRENCE_ENDED',
    'OCCURRENCE_SKIPPED',
    'FALLBACK_STARTED',
    'FAILED',
    'RECOVERED'
);


--
-- Name: calendar_source_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_source_kind AS ENUM (
    'TV_SCHEDULE',
    'RADIO_CLOCK_BLOCK',
    'NONE'
);


--
-- Name: calendar_source_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.calendar_source_role AS ENUM (
    'BASELINE',
    'PRIMARY',
    'FALLBACK'
);


--
-- Name: clock_media_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.clock_media_kind AS ENUM (
    'RADIO_TRACK',
    'VIDEO'
);


--
-- Name: clock_source_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.clock_source_kind AS ENUM (
    'RADIO_ROTATION',
    'TV_PLAYLIST'
);


--
-- Name: linked_device_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.linked_device_type AS ENUM (
    'ROKU',
    'TV'
);


--
-- Name: media_asset_source_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_asset_source_kind AS ENUM (
    'UPLOAD',
    'YOUTUBE',
    'LEGACY_VIDEO',
    'LEGACY_RADIO_TRACK',
    'STUDIO_RENDER',
    'GENERATED',
    'IMPORT',
    'PROGRAM_RECORDING',
    'CLIP'
);


--
-- Name: media_asset_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_asset_status AS ENUM (
    'PENDING_UPLOAD',
    'UPLOADING',
    'PROCESSING',
    'READY',
    'FAILED',
    'ARCHIVED',
    'DELETING',
    'DELETED',
    'PARTIAL'
);


--
-- Name: media_asset_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_asset_type AS ENUM (
    'AUDIO',
    'VIDEO',
    'IMAGE'
);


--
-- Name: media_asset_variant_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_asset_variant_role AS ENUM (
    'SOURCE',
    'MEZZANINE',
    'HLS_MANIFEST',
    'DASH_MANIFEST',
    'STREAM',
    'PROXY',
    'THUMBNAIL',
    'POSTER',
    'ARTWORK',
    'CAPTIONS',
    'WAVEFORM',
    'TV_AUTOMATION'
);


--
-- Name: media_asset_variant_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_asset_variant_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'READY',
    'FAILED',
    'ARCHIVED',
    'DELETING',
    'DELETED'
);


--
-- Name: media_storage_authority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_storage_authority AS ENUM (
    'CANONICAL',
    'LEGACY_VIDEO',
    'LEGACY_RADIO_TRACK',
    'EXTERNAL'
);


--
-- Name: programming_profile_lifecycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.programming_profile_lifecycle AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ARCHIVED'
);


--
-- Name: radio_delivery_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.radio_delivery_mode AS ENUM (
    'PLAYOUT',
    'STATIC_HLS'
);


--
-- Name: radio_playout_session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.radio_playout_session_status AS ENUM (
    'STARTING',
    'ACTIVE',
    'RETIRED',
    'FAILED'
);


--
-- Name: radio_playout_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.radio_playout_status AS ENUM (
    'OFFLINE',
    'STARTING',
    'RUNNING',
    'DEGRADED',
    'FAILED'
);


--
-- Name: radio_track_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.radio_track_status AS ENUM (
    'UPLOADING',
    'QUEUED',
    'PROCESSING',
    'READY',
    'FAILED',
    'ARCHIVED'
);


--
-- Name: rotation_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rotation_purpose AS ENUM (
    'CONTENT',
    'JINGLE',
    'FALLBACK'
);


--
-- Name: station_broadcast_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_broadcast_state AS ENUM (
    'RUNNING',
    'STOPPED'
);


--
-- Name: station_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_kind AS ENUM (
    'TV',
    'RADIO'
);


--
-- Name: station_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_mode AS ENUM (
    'ON_DEMAND',
    'SYNCHRONIZED'
);


--
-- Name: station_moderation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_moderation_status AS ENUM (
    'ACTIVE',
    'RESTRICTED'
);


--
-- Name: station_playback_order; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_playback_order AS ENUM (
    'SEQUENTIAL',
    'SHUFFLE'
);


--
-- Name: station_programming_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_programming_mode AS ENUM (
    'LEGACY_LOOP',
    'CLOCK'
);


--
-- Name: station_programming_strategy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_programming_strategy AS ENUM (
    'PLAYLIST_LOOP',
    'WEEKLY_SCHEDULE',
    'CALENDAR_EVENTS',
    'SMART_ROTATION'
);


--
-- Name: station_tune_client; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.station_tune_client AS ENUM (
    'MOBILE',
    'WEB',
    'ROKU',
    'TV'
);


--
-- Name: tv_automation_segment_part; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tv_automation_segment_part AS ENUM (
    'CONTENT',
    'TRANSITION'
);


--
-- Name: tv_channel_rendition_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tv_channel_rendition_mode AS ENUM (
    'DUAL',
    'HD_ONLY'
);


--
-- Name: tv_delivery_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tv_delivery_mode AS ENUM (
    'LEGACY_VOD',
    'CHANNEL_HLS'
);


--
-- Name: tv_segment_source_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tv_segment_source_kind AS ENUM (
    'AUTOMATION'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'USER',
    'MODERATOR',
    'ADMIN'
);


--
-- Name: video_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.video_status AS ENUM (
    'UPLOADING',
    'QUEUED',
    'PROCESSING',
    'READY',
    'FAILED',
    'ARCHIVED',
    'REPLACED'
);


--
-- Name: assert_tv_channel_descriptor_complete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_tv_channel_descriptor_complete(target_descriptor_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  expected_segments integer;
  expected_duration_ms bigint;
  rendition_count integer;
  complete_renditions integer;
BEGIN
  SELECT descriptor.segment_count, descriptor.duration_ms
    INTO expected_segments, expected_duration_ms
    FROM tv_channel_delivery_descriptors descriptor
   WHERE descriptor.id = target_descriptor_id;

  IF expected_segments IS NULL THEN
    RAISE EXCEPTION 'TV channel delivery descriptor does not exist';
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE segment_rows = expected_segments
             AND first_segment = 0
             AND last_segment = expected_segments - 1
             AND inventory_duration_ms = expected_duration_ms
         )::integer
    INTO rendition_count, complete_renditions
    FROM (
      SELECT rendition.rendition,
             count(segment.segment_index)::integer AS segment_rows,
             min(segment.segment_index) AS first_segment,
             max(segment.segment_index) AS last_segment,
             COALESCE(sum(segment.duration_ms), 0)::bigint AS inventory_duration_ms
        FROM tv_channel_delivery_renditions rendition
        LEFT JOIN tv_channel_delivery_segments segment
          ON segment.descriptor_id = rendition.descriptor_id
         AND segment.rendition = rendition.rendition
       WHERE rendition.descriptor_id = target_descriptor_id
       GROUP BY rendition.rendition
    ) inventory;

  IF rendition_count <> 2 OR complete_renditions <> 2 THEN
    RAISE EXCEPTION 'TV channel delivery descriptor has an incomplete rendition inventory';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM tv_channel_delivery_segments high
      JOIN tv_channel_delivery_segments low
        ON low.descriptor_id = high.descriptor_id
       AND low.rendition = '360p'
       AND low.segment_index = high.segment_index
     WHERE high.descriptor_id = target_descriptor_id
       AND high.rendition = '720p'
       AND (high.start_offset_ms <> low.start_offset_ms
         OR high.duration_ms <> low.duration_ms)
  ) THEN
    RAISE EXCEPTION 'TV channel rendition inventories are not segment-aligned';
  END IF;
END;
$$;


--
-- Name: enforce_allocated_asset_storage_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_allocated_asset_storage_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  allocation record;
  old_charge bigint;
  new_charge bigint;
  used bigint;
BEGIN
  old_charge := CASE WHEN OLD.status = 'DELETED' THEN 0 ELSE OLD.quota_bytes END;
  new_charge := CASE WHEN NEW.status = 'DELETED' THEN 0 ELSE NEW.quota_bytes END;
  IF new_charge <= old_charge THEN RETURN NEW; END IF;
  FOR allocation IN
    SELECT station_id FROM station_media_allocations
     WHERE media_asset_id = NEW.id ORDER BY station_id
  LOOP
    PERFORM id FROM stations WHERE id = allocation.station_id FOR UPDATE;
    used := station_storage_usage_bytes(allocation.station_id);
    IF used - old_charge + new_charge > station_storage_limit_bytes() THEN
      RAISE EXCEPTION 'station storage limit exceeded' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_station_legacy_storage_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_station_legacy_storage_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  used bigint;
  old_charge bigint := 0;
  new_charge bigint := 0;
BEGIN
  PERFORM id FROM stations WHERE id = NEW.station_id FOR UPDATE;
  IF NEW.media_asset_id IS NULL THEN new_charge := NEW.size_bytes; END IF;
  used := station_storage_usage_bytes(NEW.station_id);
  IF TG_OP = 'UPDATE' AND OLD.station_id = NEW.station_id AND OLD.media_asset_id IS NULL THEN
    old_charge := OLD.size_bytes;
  END IF;
  IF new_charge > old_charge
     AND used - old_charge + new_charge > station_storage_limit_bytes() THEN
    RAISE EXCEPTION 'station storage limit exceeded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_station_media_allocation_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_station_media_allocation_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  station_owner uuid;
  asset_owner uuid;
  new_charge bigint;
  old_charge bigint := 0;
  used bigint;
BEGIN
  SELECT owner_id INTO station_owner FROM stations WHERE id = NEW.station_id FOR UPDATE;
  SELECT owner_id, CASE WHEN status = 'DELETED' THEN 0 ELSE quota_bytes END
    INTO asset_owner, new_charge FROM media_assets WHERE id = NEW.media_asset_id FOR SHARE;
  IF station_owner IS NULL OR asset_owner IS NULL OR station_owner <> asset_owner THEN
    RAISE EXCEPTION 'station media allocation owner mismatch';
  END IF;
  used := station_storage_usage_bytes(NEW.station_id);
  IF TG_OP = 'UPDATE' AND OLD.station_id = NEW.station_id THEN
    SELECT CASE WHEN status = 'DELETED' THEN 0 ELSE quota_bytes END
      INTO old_charge FROM media_assets WHERE id = OLD.media_asset_id;
    old_charge := COALESCE(old_charge, 0);
  END IF;
  IF new_charge > old_charge
     AND used - old_charge + new_charge > station_storage_limit_bytes() THEN
    RAISE EXCEPTION 'station storage limit exceeded' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: fill_calendar_radio_occurrence_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_calendar_radio_occurrence_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  expected_block_id uuid;
BEGIN
  IF NEW.release_event_id IS NULL THEN
    SELECT occurrence.release_event_id
      INTO NEW.release_event_id
      FROM calendar_occurrences occurrence
     WHERE occurrence.station_id = NEW.station_id
       AND occurrence.release_id = NEW.release_id
       AND occurrence.id = NEW.occurrence_id;
  END IF;
  SELECT CASE NEW.source_role
           WHEN 'PRIMARY' THEN event.source_clock_block_id
           WHEN 'EVENT_FALLBACK' THEN event.fallback_clock_block_id
         END
    INTO expected_block_id
    FROM calendar_release_events event
   WHERE event.station_id = NEW.station_id
     AND event.release_id = NEW.release_id
     AND event.id = NEW.release_event_id;
  IF expected_block_id IS NULL OR expected_block_id <> NEW.release_block_id THEN
    RAISE EXCEPTION 'calendar Radio occurrence item does not match its event source';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: is_calendar_iana_time_zone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_calendar_iana_time_zone(candidate text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT candidate IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_timezone_names zone WHERE zone.name = candidate
  );
$$;


--
-- Name: maintain_media_asset_archived_from_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.maintain_media_asset_archived_from_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'ARCHIVED' AND OLD.status <> 'ARCHIVED'
     AND NEW.archived_from_status IS NULL
     AND OLD.status IN ('READY', 'PARTIAL', 'FAILED') THEN
    NEW.archived_from_status := OLD.status;
  ELSIF NEW.status <> 'ARCHIVED' THEN
    NEW.archived_from_status := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: note_active_calendar_release_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.note_active_calendar_release_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.active_calendar_release_id IS DISTINCT FROM OLD.active_calendar_release_id THEN
    NEW.active_calendar_release_changed_at = clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_calendar_radio_occurrence_item_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_calendar_radio_occurrence_item_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM stations WHERE id = OLD.station_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'materialized calendar Radio occurrence items are immutable';
END;
$$;


--
-- Name: prevent_calendar_release_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_calendar_release_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM stations WHERE id = OLD.station_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'published calendar releases and occurrences are immutable';
END;
$$;


--
-- Name: prevent_calendar_runtime_transition_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_calendar_runtime_transition_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM stations WHERE id = OLD.station_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'calendar runtime transitions are append-only';
END;
$$;


--
-- Name: prevent_clock_release_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_clock_release_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'published clock releases are immutable';
END;
$$;


--
-- Name: prevent_media_asset_variant_rewrite(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_media_asset_variant_rewrite() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.media_asset_id IS DISTINCT FROM OLD.media_asset_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.generation IS DISTINCT FROM OLD.generation THEN
    RAISE EXCEPTION 'media asset variant identity and role are immutable';
  END IF;

  IF (OLD.status = 'READY' OR OLD.ready_at IS NOT NULL) AND (
       NEW.storage_authority IS DISTINCT FROM OLD.storage_authority
       OR NEW.object_key IS DISTINCT FROM OLD.object_key
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.technical_metadata IS DISTINCT FROM OLD.technical_metadata
       OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
       OR NEW.width IS DISTINCT FROM OLD.width
       OR NEW.height IS DISTINCT FROM OLD.height
       OR NEW.codec IS DISTINCT FROM OLD.codec
       OR NEW.bitrate_bps IS DISTINCT FROM OLD.bitrate_bps
       OR NEW.sample_rate_hz IS DISTINCT FROM OLD.sample_rate_hz
       OR NEW.channels IS DISTINCT FROM OLD.channels
       OR NEW.ready_at IS DISTINCT FROM OLD.ready_at
     ) THEN
    RAISE EXCEPTION 'ready media asset variant generations are immutable';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_published_tv_channel_inventory_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_published_tv_channel_inventory_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_descriptor_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_descriptor_id := OLD.descriptor_id;
  ELSE
    target_descriptor_id := NEW.descriptor_id;
  END IF;
  IF EXISTS (SELECT 1 FROM tv_channel_derivatives WHERE descriptor_id = target_descriptor_id)
     OR EXISTS (SELECT 1 FROM tv_channel_transition_fillers WHERE descriptor_id = target_descriptor_id) THEN
    RAISE EXCEPTION 'published TV channel delivery inventory is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_radio_delivery_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_radio_delivery_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'published Radio delivery artifacts are immutable';
END;
$$;


--
-- Name: prevent_station_operation_audit_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_station_operation_audit_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'station operation audit rows are append-only';
END;
$$;


--
-- Name: prevent_studio_release_asset_reference_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_studio_release_asset_reference_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'published Studio release asset references are immutable';
END;
$$;


--
-- Name: prevent_studio_release_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_studio_release_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'published Studio releases are immutable';
END;
$$;


--
-- Name: prevent_studio_run_event_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_studio_run_event_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Release/rundown and station purges are the only paths that may remove the
  -- execution journal; direct event, command, or run deletion remains blocked.
  IF TG_OP = 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM stations WHERE id = OLD.station_id)
    OR NOT EXISTS (
      SELECT 1 FROM studio_rundown_releases
       WHERE id = OLD.rundown_release_id
    )
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Studio run events are append-only';
END;
$$;


--
-- Name: prevent_studio_rundown_release_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_studio_rundown_release_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'studio_rundown_releases'
       AND NOT EXISTS (
         SELECT 1 FROM studio_rundowns WHERE id = OLD.rundown_id
       ) THEN
      RETURN OLD;
    ELSIF TG_TABLE_NAME IN (
      'studio_rundown_release_items', 'studio_rundown_release_cues'
    ) AND NOT EXISTS (
      SELECT 1 FROM studio_rundown_releases WHERE id = OLD.release_id
    ) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'published Studio rundown releases are immutable';
END;
$$;


--
-- Name: prevent_tv_channel_delivery_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_tv_channel_delivery_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'published TV channel delivery descriptors and pins are immutable';
END;
$$;


--
-- Name: prevent_tv_segment_journal_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_tv_segment_journal_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  retention_cutoff timestamptz;
BEGIN
  IF TG_OP = 'DELETE'
     AND pg_catalog.current_setting('streamtumi.trusted_tv_station_purge', true) = OLD.station_id::text
     AND current_user = pg_catalog.pg_get_userbyid((
       SELECT procedure.proowner FROM pg_catalog.pg_proc procedure
        WHERE procedure.oid = 'public.purge_tv_station_runtime(uuid)'::pg_catalog.regprocedure
     ))
     AND EXISTS (
       SELECT 1 FROM public.stations station
        WHERE station.id = OLD.station_id AND station.deleted_at IS NOT NULL
          AND station.purge_after <= pg_catalog.now() AND station.legal_hold_at IS NULL
     ) THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    BEGIN
      retention_cutoff := NULLIF(
        pg_catalog.current_setting('streamtumi.trusted_tv_journal_retention', true), ''
      )::timestamptz;
    EXCEPTION WHEN invalid_text_representation THEN
      retention_cutoff := NULL;
    END;
    IF retention_cutoff IS NOT NULL
       AND current_user = pg_catalog.pg_get_userbyid((
         SELECT procedure.proowner FROM pg_catalog.pg_proc procedure
          WHERE procedure.oid = 'public.prune_tv_segment_journal(integer)'::pg_catalog.regprocedure
       ))
       AND OLD.starts_at < retention_cutoff AND OLD.ends_at < retention_cutoff
       AND EXISTS (
         SELECT 1 FROM public.stations station
          WHERE station.id = OLD.station_id AND station.legal_hold_at IS NULL
       )
       AND EXISTS (
         SELECT 1 FROM public.tv_segment_journal newer
          WHERE newer.station_id = OLD.station_id
            AND newer.media_sequence > OLD.media_sequence
       ) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'TV segment journal is append-only';
END;
$$;


--
-- Name: prune_tv_segment_journal(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_tv_segment_journal(retention_days integer) RETURNS TABLE(cutoff_at timestamp with time zone, deleted_rows bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  previous_guard text;
BEGIN
  IF retention_days IS NULL OR retention_days < 1 OR retention_days > 3650 THEN
    RAISE EXCEPTION 'TV segment journal retention must be between 1 and 3650 days';
  END IF;
  cutoff_at := pg_catalog.clock_timestamp() - retention_days * interval '1 day';
  previous_guard := pg_catalog.current_setting('streamtumi.trusted_tv_journal_retention', true);
  PERFORM pg_catalog.set_config('streamtumi.trusted_tv_journal_retention', cutoff_at::text, true);
  WITH candidates AS (
    SELECT journal.ctid FROM public.tv_segment_journal journal
    JOIN public.stations station ON station.id = journal.station_id
    WHERE station.legal_hold_at IS NULL AND journal.starts_at < cutoff_at
      AND journal.ends_at < cutoff_at
      AND EXISTS (
        SELECT 1 FROM public.tv_segment_journal newer
         WHERE newer.station_id = journal.station_id
           AND newer.media_sequence > journal.media_sequence
      )
    ORDER BY journal.ends_at, journal.station_id, journal.media_sequence
    LIMIT 100000
  )
  DELETE FROM public.tv_segment_journal journal USING candidates
   WHERE journal.ctid = candidates.ctid;
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  PERFORM pg_catalog.set_config('streamtumi.trusted_tv_journal_retention', COALESCE(previous_guard, ''), true);
  RETURN NEXT;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('streamtumi.trusted_tv_journal_retention', COALESCE(previous_guard, ''), true);
  RAISE;
END;
$$;


--
-- Name: purge_tv_station_runtime(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_tv_station_runtime(target_station_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  deleted_journal_rows bigint;
  previous_guard text;
BEGIN
  previous_guard := pg_catalog.current_setting('streamtumi.trusted_tv_station_purge', true);
  PERFORM station.id FROM public.stations station
   WHERE station.id = target_station_id AND station.deleted_at IS NOT NULL
     AND station.purge_after <= pg_catalog.now() AND station.legal_hold_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'station is not eligible for trusted TV purge'; END IF;
  PERFORM pg_catalog.set_config('streamtumi.trusted_tv_station_purge', target_station_id::text, true);
  DELETE FROM public.tv_segment_journal WHERE station_id = target_station_id;
  GET DIAGNOSTICS deleted_journal_rows = ROW_COUNT;
  DELETE FROM public.tv_playout_state WHERE station_id = target_station_id;
  DELETE FROM public.tv_playout_leases WHERE station_id = target_station_id;
  PERFORM pg_catalog.set_config('streamtumi.trusted_tv_station_purge', COALESCE(previous_guard, ''), true);
  RETURN deleted_journal_rows;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_catalog.set_config('streamtumi.trusted_tv_station_purge', COALESCE(previous_guard, ''), true);
  RAISE;
END;
$$;


--
-- Name: require_verified_user_blocker(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_verified_user_blocker() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE id = NEW.blocker_user_id
       AND email_verified_at IS NOT NULL
       AND disabled_at IS NULL
       AND deletion_requested_at IS NULL
       AND anonymized_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A block requires an active verified registered account.'
      USING ERRCODE = '23514', CONSTRAINT = 'user_blocks_verified_blocker_check';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: station_storage_limit_bytes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.station_storage_limit_bytes() RETURNS bigint
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN '10737418240'::bigint;


--
-- Name: station_storage_usage_bytes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.station_storage_usage_bytes(target_station_id uuid) RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE((
    SELECT quota_bytes FROM station_media_storage_usage_v WHERE station_id = target_station_id
  ), 0)::bigint;
$$;


--
-- Name: validate_station_foundation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_station_foundation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.station_kind <> OLD.station_kind THEN
    RAISE EXCEPTION 'station kind cannot be changed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION 'invalid station time zone: %', NEW.time_zone;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_tv_channel_derivative(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_tv_channel_derivative() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  descriptor_profile text;
  source_role media_asset_variant_role;
  source_status media_asset_variant_status;
  output_role media_asset_variant_role;
  output_status media_asset_variant_status;
  output_key text;
  master_key text;
BEGIN
  SELECT profile, master_playlist_object_key
    INTO descriptor_profile, master_key
    FROM tv_channel_delivery_descriptors
   WHERE id = NEW.descriptor_id;

  SELECT role, status INTO source_role, source_status
    FROM media_asset_variants
   WHERE id = NEW.source_media_asset_variant_id AND media_asset_id = NEW.media_asset_id;
  SELECT role, status, object_key INTO output_role, output_status, output_key
    FROM media_asset_variants
   WHERE id = NEW.media_asset_variant_id AND media_asset_id = NEW.media_asset_id;

  IF descriptor_profile IS DISTINCT FROM NEW.profile
     OR source_role IS DISTINCT FROM 'SOURCE'::media_asset_variant_role
     OR source_status IS DISTINCT FROM 'READY'::media_asset_variant_status
     OR output_role IS DISTINCT FROM 'TV_AUTOMATION'::media_asset_variant_role
     OR output_status IS DISTINCT FROM 'READY'::media_asset_variant_status
     OR output_key IS DISTINCT FROM master_key THEN
    RAISE EXCEPTION 'invalid TV channel derivative descriptor or variants';
  END IF;

  PERFORM assert_tv_channel_descriptor_complete(NEW.descriptor_id);
  RETURN NEW;
END;
$$;


--
-- Name: validate_tv_channel_transition_filler(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_tv_channel_transition_filler() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  descriptor_profile text;
  descriptor_duration_ms bigint;
  filler_station_kind station_kind;
BEGIN
  SELECT profile, duration_ms
    INTO descriptor_profile, descriptor_duration_ms
    FROM tv_channel_delivery_descriptors
   WHERE id = NEW.descriptor_id;
  SELECT station_kind INTO filler_station_kind
    FROM stations WHERE id = NEW.station_id;

  IF descriptor_profile IS DISTINCT FROM NEW.profile
     OR descriptor_duration_ms IS DISTINCT FROM NEW.transition_ms::bigint
     OR filler_station_kind IS DISTINCT FROM 'TV'::station_kind THEN
    RAISE EXCEPTION 'invalid TV channel transition filler descriptor';
  END IF;

  PERFORM assert_tv_channel_descriptor_complete(NEW.descriptor_id);
  RETURN NEW;
END;
$$;


--
-- Name: validate_tv_program_recording_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_tv_program_recording_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = OLD.status
     OR (OLD.status = 'ARMED' AND NEW.status IN ('CAPTURING', 'DRAINING'))
     OR (OLD.status = 'CAPTURING' AND NEW.status = 'DRAINING')
     OR (OLD.status = 'DRAINING' AND NEW.status = 'FINALIZING')
     OR (OLD.status = 'FINALIZING' AND NEW.status IN ('COMPLETE', 'PARTIAL', 'FAILED')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid TV Program recording status transition: % to %', OLD.status, NEW.status;
END;
$$;


--
-- Name: validate_tv_schedule_item_delivery(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_tv_schedule_item_delivery() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  schedule_station_id uuid;
  schedule_transition_ms integer;
  schedule_media_asset_id uuid;
  schedule_station_kind station_kind;
  derivative_media_asset_id uuid;
  filler_station_id uuid;
  filler_transition_ms integer;
BEGIN
  SELECT schedule.station_id, schedule.transition_ms, video.media_asset_id, station.station_kind
    INTO schedule_station_id, schedule_transition_ms, schedule_media_asset_id, schedule_station_kind
    FROM schedule_items item
    JOIN schedules schedule ON schedule.id = item.schedule_id
    JOIN stations station ON station.id = schedule.station_id
    JOIN videos video ON video.id = item.video_id
   WHERE item.id = NEW.schedule_item_id;

  SELECT media_asset_id INTO derivative_media_asset_id
    FROM tv_channel_derivatives WHERE id = NEW.derivative_id;

  IF schedule_station_kind IS DISTINCT FROM 'TV'::station_kind
     OR schedule_media_asset_id IS NULL
     OR derivative_media_asset_id IS DISTINCT FROM schedule_media_asset_id THEN
    RAISE EXCEPTION 'TV schedule delivery does not match the schedule item asset';
  END IF;

  IF schedule_transition_ms = 0 AND NEW.transition_filler_id IS NOT NULL THEN
    RAISE EXCEPTION 'TV schedule item without a transition cannot pin a filler';
  ELSIF schedule_transition_ms > 0 AND NEW.transition_filler_id IS NULL THEN
    RAISE EXCEPTION 'TV schedule item transition requires a pinned filler';
  ELSIF NEW.transition_filler_id IS NOT NULL THEN
    SELECT station_id, transition_ms INTO filler_station_id, filler_transition_ms
      FROM tv_channel_transition_fillers WHERE id = NEW.transition_filler_id;
    IF filler_station_id IS DISTINCT FROM schedule_station_id
       OR filler_transition_ms IS DISTINCT FROM schedule_transition_ms THEN
      RAISE EXCEPTION 'TV schedule delivery filler does not match the station transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    actor_name text NOT NULL,
    target_user_id uuid,
    target_label text,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    target_station_id uuid
);


--
-- Name: calendar_draft_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_draft_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    title text NOT NULL,
    event_kind public.calendar_event_kind NOT NULL,
    source_kind public.calendar_source_kind NOT NULL,
    source_tv_schedule_id uuid,
    source_clock_release_id uuid,
    source_clock_block_id uuid,
    fallback_source_kind public.calendar_source_kind DEFAULT 'NONE'::public.calendar_source_kind NOT NULL,
    fallback_tv_schedule_id uuid,
    fallback_clock_release_id uuid,
    fallback_clock_block_id uuid,
    local_start_date date NOT NULL,
    local_start_time time without time zone NOT NULL,
    time_zone text NOT NULL,
    duration_ms bigint,
    recurrence_kind public.calendar_recurrence_kind DEFAULT 'NONE'::public.calendar_recurrence_kind NOT NULL,
    recurrence_interval integer DEFAULT 1 NOT NULL,
    recurrence_count integer,
    recurrence_until_date date,
    recurrence_weekdays smallint[],
    recurrence_month_days smallint[],
    dst_gap_policy public.calendar_dst_gap_policy DEFAULT 'SKIP'::public.calendar_dst_gap_policy NOT NULL,
    dst_fold_policy public.calendar_dst_fold_policy DEFAULT 'EARLIER'::public.calendar_dst_fold_policy NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    late_join_policy public.calendar_late_join_policy DEFAULT 'JOIN_IN_PROGRESS'::public.calendar_late_join_policy NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_draft_events_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms > 0))),
    CONSTRAINT calendar_draft_events_kind_source_check CHECK ((((event_kind = ANY (ARRAY['PROGRAM'::public.calendar_event_kind, 'PREMIERE'::public.calendar_event_kind])) AND (source_kind = ANY (ARRAY['TV_SCHEDULE'::public.calendar_source_kind, 'RADIO_CLOCK_BLOCK'::public.calendar_source_kind]))) OR ((event_kind = 'OFFLINE'::public.calendar_event_kind) AND (source_kind = 'NONE'::public.calendar_source_kind) AND (fallback_source_kind = 'NONE'::public.calendar_source_kind)))),
    CONSTRAINT calendar_draft_events_month_days_check CHECK (((recurrence_month_days IS NULL) OR (recurrence_month_days <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint, (13)::smallint, (14)::smallint, (15)::smallint, (16)::smallint, (17)::smallint, (18)::smallint, (19)::smallint, (20)::smallint, (21)::smallint, (22)::smallint, (23)::smallint, (24)::smallint, (25)::smallint, (26)::smallint, (27)::smallint, (28)::smallint, (29)::smallint, (30)::smallint, (31)::smallint]))),
    CONSTRAINT calendar_draft_events_priority_check CHECK (((priority >= '-1000000'::integer) AND (priority <= 1000000))),
    CONSTRAINT calendar_draft_events_recurrence_check CHECK ((((recurrence_kind = 'NONE'::public.calendar_recurrence_kind) AND (recurrence_count IS NULL) AND (recurrence_until_date IS NULL) AND (recurrence_weekdays IS NULL) AND (recurrence_month_days IS NULL)) OR (recurrence_kind = 'DAILY'::public.calendar_recurrence_kind) OR ((recurrence_kind = 'WEEKLY'::public.calendar_recurrence_kind) AND (recurrence_weekdays IS NOT NULL) AND (cardinality(recurrence_weekdays) > 0)) OR ((recurrence_kind = 'MONTHLY'::public.calendar_recurrence_kind) AND (recurrence_month_days IS NOT NULL) AND (cardinality(recurrence_month_days) > 0)))),
    CONSTRAINT calendar_draft_events_recurrence_count_check CHECK (((recurrence_count >= 1) AND (recurrence_count <= 1000000))),
    CONSTRAINT calendar_draft_events_recurrence_interval_check CHECK (((recurrence_interval >= 1) AND (recurrence_interval <= 366))),
    CONSTRAINT calendar_draft_events_time_zone_check CHECK (public.is_calendar_iana_time_zone(time_zone)),
    CONSTRAINT calendar_draft_events_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200))),
    CONSTRAINT calendar_draft_events_until_check CHECK (((recurrence_until_date IS NULL) OR (recurrence_until_date >= local_start_date))),
    CONSTRAINT calendar_draft_events_weekdays_check CHECK (((recurrence_weekdays IS NULL) OR (recurrence_weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])))
);


--
-- Name: calendar_draft_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_draft_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    event_id uuid NOT NULL,
    recurrence_key text NOT NULL,
    exception_kind public.calendar_exception_kind NOT NULL,
    moved_local_start_date date,
    moved_local_start_time time without time zone,
    moved_time_zone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_draft_exceptions_moved_time_zone_check CHECK (((moved_time_zone IS NULL) OR public.is_calendar_iana_time_zone(moved_time_zone))),
    CONSTRAINT calendar_draft_exceptions_recurrence_key_check CHECK (((char_length(recurrence_key) >= 1) AND (char_length(recurrence_key) <= 500))),
    CONSTRAINT calendar_draft_exceptions_shape_check CHECK ((((exception_kind = 'CANCEL'::public.calendar_exception_kind) AND (moved_local_start_date IS NULL) AND (moved_local_start_time IS NULL) AND (moved_time_zone IS NULL)) OR ((exception_kind = 'MOVE'::public.calendar_exception_kind) AND (moved_local_start_date IS NOT NULL) AND (moved_local_start_time IS NOT NULL))))
);


--
-- Name: calendar_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_occurrences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    release_id uuid NOT NULL,
    release_event_id uuid NOT NULL,
    event_kind public.calendar_event_kind NOT NULL,
    release_exception_id uuid,
    release_exception_kind public.calendar_exception_kind,
    recurrence_key text NOT NULL,
    nominal_local_start_date date NOT NULL,
    nominal_local_start_time time without time zone NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    airing_window tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)'::text)) STORED,
    is_moved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_occurrences_half_open_check CHECK (((ends_at IS NOT NULL) AND (ends_at > starts_at))),
    CONSTRAINT calendar_occurrences_move_check CHECK (((is_moved AND (release_exception_id IS NOT NULL) AND (release_exception_kind = 'MOVE'::public.calendar_exception_kind)) OR ((NOT is_moved) AND (release_exception_id IS NULL) AND (release_exception_kind IS NULL)))),
    CONSTRAINT calendar_occurrences_recurrence_key_check CHECK (((char_length(recurrence_key) >= 1) AND (char_length(recurrence_key) <= 500)))
);


--
-- Name: calendar_profile_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_profile_drafts (
    station_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    profile_strategy public.station_programming_strategy DEFAULT 'CALENDAR_EVENTS'::public.station_programming_strategy NOT NULL,
    draft_version integer DEFAULT 1 NOT NULL,
    updated_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_profile_drafts_draft_version_check CHECK ((draft_version > 0)),
    CONSTRAINT calendar_profile_drafts_profile_strategy_check CHECK ((profile_strategy = 'CALENDAR_EVENTS'::public.station_programming_strategy))
);


--
-- Name: calendar_radio_occurrence_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_radio_occurrence_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    release_id uuid NOT NULL,
    occurrence_id uuid NOT NULL,
    release_event_id uuid NOT NULL,
    source_role text NOT NULL,
    "position" integer NOT NULL,
    release_block_id uuid NOT NULL,
    release_item_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    source_offset_ms bigint DEFAULT 0 NOT NULL,
    playback_duration_ms bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_radio_occurrence_items_playback_duration_ms_check CHECK ((playback_duration_ms > 0)),
    CONSTRAINT calendar_radio_occurrence_items_position_check CHECK (("position" >= 0)),
    CONSTRAINT calendar_radio_occurrence_items_source_offset_ms_check CHECK ((source_offset_ms >= 0)),
    CONSTRAINT calendar_radio_occurrence_items_source_role_check CHECK ((source_role = ANY (ARRAY['PRIMARY'::text, 'EVENT_FALLBACK'::text]))),
    CONSTRAINT calendar_radio_occurrence_items_window_check CHECK ((ends_at = (starts_at + ((playback_duration_ms)::double precision * '00:00:00.001'::interval))))
);


--
-- Name: calendar_release_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_release_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    release_id uuid NOT NULL,
    source_event_id uuid NOT NULL,
    title text NOT NULL,
    event_kind public.calendar_event_kind NOT NULL,
    source_kind public.calendar_source_kind NOT NULL,
    source_tv_schedule_id uuid,
    source_clock_release_id uuid,
    source_clock_block_id uuid,
    fallback_source_kind public.calendar_source_kind DEFAULT 'NONE'::public.calendar_source_kind NOT NULL,
    fallback_tv_schedule_id uuid,
    fallback_clock_release_id uuid,
    fallback_clock_block_id uuid,
    local_start_date date NOT NULL,
    local_start_time time without time zone NOT NULL,
    time_zone text NOT NULL,
    duration_ms bigint,
    recurrence_kind public.calendar_recurrence_kind NOT NULL,
    recurrence_interval integer NOT NULL,
    recurrence_count integer,
    recurrence_until_date date,
    recurrence_weekdays smallint[],
    recurrence_month_days smallint[],
    dst_gap_policy public.calendar_dst_gap_policy NOT NULL,
    dst_fold_policy public.calendar_dst_fold_policy NOT NULL,
    priority integer NOT NULL,
    late_join_policy public.calendar_late_join_policy NOT NULL,
    CONSTRAINT calendar_release_events_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms > 0))),
    CONSTRAINT calendar_release_events_kind_source_check CHECK ((((event_kind = ANY (ARRAY['PROGRAM'::public.calendar_event_kind, 'PREMIERE'::public.calendar_event_kind])) AND (source_kind = ANY (ARRAY['TV_SCHEDULE'::public.calendar_source_kind, 'RADIO_CLOCK_BLOCK'::public.calendar_source_kind]))) OR ((event_kind = 'OFFLINE'::public.calendar_event_kind) AND (source_kind = 'NONE'::public.calendar_source_kind) AND (fallback_source_kind = 'NONE'::public.calendar_source_kind)))),
    CONSTRAINT calendar_release_events_month_days_check CHECK (((recurrence_month_days IS NULL) OR (recurrence_month_days <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint, (13)::smallint, (14)::smallint, (15)::smallint, (16)::smallint, (17)::smallint, (18)::smallint, (19)::smallint, (20)::smallint, (21)::smallint, (22)::smallint, (23)::smallint, (24)::smallint, (25)::smallint, (26)::smallint, (27)::smallint, (28)::smallint, (29)::smallint, (30)::smallint, (31)::smallint]))),
    CONSTRAINT calendar_release_events_priority_check CHECK (((priority >= '-1000000'::integer) AND (priority <= 1000000))),
    CONSTRAINT calendar_release_events_recurrence_check CHECK ((((recurrence_kind = 'NONE'::public.calendar_recurrence_kind) AND (recurrence_count IS NULL) AND (recurrence_until_date IS NULL) AND (recurrence_weekdays IS NULL) AND (recurrence_month_days IS NULL)) OR (recurrence_kind = 'DAILY'::public.calendar_recurrence_kind) OR ((recurrence_kind = 'WEEKLY'::public.calendar_recurrence_kind) AND (recurrence_weekdays IS NOT NULL) AND (cardinality(recurrence_weekdays) > 0)) OR ((recurrence_kind = 'MONTHLY'::public.calendar_recurrence_kind) AND (recurrence_month_days IS NOT NULL) AND (cardinality(recurrence_month_days) > 0)))),
    CONSTRAINT calendar_release_events_recurrence_count_check CHECK (((recurrence_count >= 1) AND (recurrence_count <= 1000000))),
    CONSTRAINT calendar_release_events_recurrence_interval_check CHECK (((recurrence_interval >= 1) AND (recurrence_interval <= 366))),
    CONSTRAINT calendar_release_events_time_zone_check CHECK (public.is_calendar_iana_time_zone(time_zone)),
    CONSTRAINT calendar_release_events_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200))),
    CONSTRAINT calendar_release_events_until_check CHECK (((recurrence_until_date IS NULL) OR (recurrence_until_date >= local_start_date))),
    CONSTRAINT calendar_release_events_weekdays_check CHECK (((recurrence_weekdays IS NULL) OR (recurrence_weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])))
);


--
-- Name: calendar_release_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_release_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    release_id uuid NOT NULL,
    release_event_id uuid NOT NULL,
    source_exception_id uuid NOT NULL,
    recurrence_key text NOT NULL,
    exception_kind public.calendar_exception_kind NOT NULL,
    moved_local_start_date date,
    moved_local_start_time time without time zone,
    moved_time_zone text,
    CONSTRAINT calendar_release_exceptions_moved_time_zone_check CHECK (((moved_time_zone IS NULL) OR public.is_calendar_iana_time_zone(moved_time_zone))),
    CONSTRAINT calendar_release_exceptions_recurrence_key_check CHECK (((char_length(recurrence_key) >= 1) AND (char_length(recurrence_key) <= 500))),
    CONSTRAINT calendar_release_exceptions_shape_check CHECK ((((exception_kind = 'CANCEL'::public.calendar_exception_kind) AND (moved_local_start_date IS NULL) AND (moved_local_start_time IS NULL) AND (moved_time_zone IS NULL)) OR ((exception_kind = 'MOVE'::public.calendar_exception_kind) AND (moved_local_start_date IS NOT NULL) AND (moved_local_start_time IS NOT NULL))))
);


--
-- Name: calendar_release_materialization_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_release_materialization_state (
    station_id uuid NOT NULL,
    release_id uuid NOT NULL,
    status public.calendar_materialization_status DEFAULT 'PENDING'::public.calendar_materialization_status NOT NULL,
    horizon_from timestamp with time zone,
    materialized_through timestamp with time zone,
    target_through timestamp with time zone,
    occurrence_count bigint DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    last_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_materialization_status_check CHECK ((((status = 'FAILED'::public.calendar_materialization_status) AND (last_error IS NOT NULL)) OR ((status <> 'FAILED'::public.calendar_materialization_status) AND (last_error IS NULL)))),
    CONSTRAINT calendar_materialization_window_check CHECK ((((horizon_from IS NULL) AND (materialized_through IS NULL) AND (target_through IS NULL)) OR ((horizon_from IS NOT NULL) AND (target_through IS NOT NULL) AND (target_through > horizon_from) AND ((materialized_through IS NULL) OR ((materialized_through >= horizon_from) AND (materialized_through <= target_through)))))),
    CONSTRAINT calendar_release_materialization_state_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 2000))),
    CONSTRAINT calendar_release_materialization_state_occurrence_count_check CHECK ((occurrence_count >= 0)),
    CONSTRAINT calendar_release_materialization_state_version_check CHECK ((version > 0))
);


--
-- Name: calendar_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    profile_strategy public.station_programming_strategy DEFAULT 'CALENDAR_EVENTS'::public.station_programming_strategy NOT NULL,
    release_number integer NOT NULL,
    source_draft_version integer NOT NULL,
    idempotency_key uuid NOT NULL,
    published_by_user_id uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_releases_profile_strategy_check CHECK ((profile_strategy = 'CALENDAR_EVENTS'::public.station_programming_strategy)),
    CONSTRAINT calendar_releases_release_number_check CHECK ((release_number > 0)),
    CONSTRAINT calendar_releases_source_draft_version_check CHECK ((source_draft_version > 0))
);


--
-- Name: calendar_runtime_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_runtime_state (
    station_id uuid NOT NULL,
    status public.calendar_runtime_status DEFAULT 'IDLE'::public.calendar_runtime_status NOT NULL,
    active_release_id uuid,
    current_occurrence_id uuid,
    version integer DEFAULT 1 NOT NULL,
    transition_sequence bigint DEFAULT 0 NOT NULL,
    occurrence_started_at timestamp with time zone,
    last_error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_role public.calendar_source_role,
    source_kind public.calendar_source_kind,
    next_boundary_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    public_revision bigint DEFAULT 0 NOT NULL,
    CONSTRAINT calendar_runtime_state_current_check CHECK ((((status = 'IDLE'::public.calendar_runtime_status) AND (current_occurrence_id IS NULL) AND (occurrence_started_at IS NULL)) OR ((status = 'FAILED'::public.calendar_runtime_status) AND (active_release_id IS NOT NULL)) OR ((status = 'PLAYING'::public.calendar_runtime_status) AND (active_release_id IS NOT NULL)) OR ((status = ANY (ARRAY['OFFLINE'::public.calendar_runtime_status, 'FALLBACK'::public.calendar_runtime_status])) AND (active_release_id IS NOT NULL) AND (current_occurrence_id IS NOT NULL) AND (occurrence_started_at IS NOT NULL)))),
    CONSTRAINT calendar_runtime_state_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 2000))),
    CONSTRAINT calendar_runtime_state_public_revision_check CHECK ((public_revision >= 0)),
    CONSTRAINT calendar_runtime_state_source_check CHECK ((((source_role IS NULL) AND (source_kind IS NULL)) OR ((source_role IS NOT NULL) AND (source_kind IS NOT NULL) AND (active_release_id IS NOT NULL) AND (((source_role = 'BASELINE'::public.calendar_source_role) AND (current_occurrence_id IS NULL)) OR ((source_role = ANY (ARRAY['PRIMARY'::public.calendar_source_role, 'FALLBACK'::public.calendar_source_role])) AND (current_occurrence_id IS NOT NULL)))))),
    CONSTRAINT calendar_runtime_state_transition_sequence_check CHECK ((transition_sequence >= 0)),
    CONSTRAINT calendar_runtime_state_version_check CHECK ((version > 0))
);


--
-- Name: calendar_runtime_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_runtime_transitions (
    id bigint NOT NULL,
    station_id uuid NOT NULL,
    sequence bigint NOT NULL,
    release_id uuid,
    occurrence_id uuid,
    transition_kind public.calendar_runtime_transition_kind NOT NULL,
    from_status public.calendar_runtime_status NOT NULL,
    to_status public.calendar_runtime_status NOT NULL,
    reason text,
    transitioned_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_runtime_transitions_occurrence_check CHECK (((occurrence_id IS NULL) OR (release_id IS NOT NULL))),
    CONSTRAINT calendar_runtime_transitions_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 1000))),
    CONSTRAINT calendar_runtime_transitions_sequence_check CHECK ((sequence > 0))
);


--
-- Name: calendar_runtime_transitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.calendar_runtime_transitions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.calendar_runtime_transitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    display_name text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_guests_display_name_check CHECK (((char_length(display_name) >= 2) AND (char_length(display_name) <= 32)))
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    author_kind text NOT NULL,
    author_user_id uuid,
    author_guest_id uuid,
    author_name text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pinned_at timestamp with time zone,
    pinned_by_user_id uuid,
    hidden_at timestamp with time zone,
    hidden_by_user_id uuid,
    hidden_reason text,
    CONSTRAINT chat_messages_author_kind_check CHECK ((author_kind = ANY (ARRAY['GUEST'::text, 'REGISTERED'::text, 'HOST'::text]))),
    CONSTRAINT chat_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500))),
    CONSTRAINT chat_messages_hidden_reason_check CHECK (((hidden_reason IS NULL) OR (char_length(hidden_reason) <= 500)))
);


--
-- Name: clock_draft_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clock_draft_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    start_minute smallint NOT NULL,
    source_kind public.clock_source_kind NOT NULL,
    radio_rotation_id uuid,
    tv_schedule_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    page integer NOT NULL,
    story_slug text NOT NULL,
    segment_type text DEFAULT 'AUDIO'::text NOT NULL,
    planned_duration_ms bigint,
    editorial_status text DEFAULT 'DRAFT'::text NOT NULL,
    technical_status text DEFAULT 'UNCHECKED'::text NOT NULL,
    talent text DEFAULT ''::text NOT NULL,
    camera_source_note text DEFAULT ''::text NOT NULL,
    script text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT clock_draft_blocks_camera_note_check CHECK ((char_length(camera_source_note) <= 2000)),
    CONSTRAINT clock_draft_blocks_check CHECK ((((source_kind = 'RADIO_ROTATION'::public.clock_source_kind) AND (radio_rotation_id IS NOT NULL) AND (tv_schedule_id IS NULL)) OR ((source_kind = 'TV_PLAYLIST'::public.clock_source_kind) AND (radio_rotation_id IS NULL) AND (tv_schedule_id IS NOT NULL)))),
    CONSTRAINT clock_draft_blocks_editorial_status_check CHECK ((editorial_status = ANY (ARRAY['DRAFT'::text, 'IN_REVIEW'::text, 'APPROVED'::text, 'KILLED'::text]))),
    CONSTRAINT clock_draft_blocks_notes_check CHECK ((char_length(notes) <= 50000)),
    CONSTRAINT clock_draft_blocks_page_check CHECK (((page >= 1) AND (page <= 9999))),
    CONSTRAINT clock_draft_blocks_planned_duration_check CHECK (((planned_duration_ms IS NULL) OR ((planned_duration_ms >= 0) AND (planned_duration_ms <= 604800000)))),
    CONSTRAINT clock_draft_blocks_script_check CHECK ((char_length(script) <= 50000)),
    CONSTRAINT clock_draft_blocks_segment_type_check CHECK ((segment_type = ANY (ARRAY['STORY'::text, 'PACKAGE'::text, 'VO'::text, 'SOT'::text, 'LIVE'::text, 'BREAK'::text, 'BUMP'::text, 'GRAPHIC'::text, 'AUDIO'::text, 'COMMAND'::text, 'NOTE'::text]))),
    CONSTRAINT clock_draft_blocks_start_minute_check CHECK (((start_minute >= 0) AND (start_minute <= 10079))),
    CONSTRAINT clock_draft_blocks_story_slug_check CHECK (((char_length(story_slug) >= 1) AND (char_length(story_slug) <= 160))),
    CONSTRAINT clock_draft_blocks_talent_check CHECK ((char_length(talent) <= 500)),
    CONSTRAINT clock_draft_blocks_technical_status_check CHECK ((technical_status = ANY (ARRAY['UNCHECKED'::text, 'READY'::text, 'WARNING'::text, 'BLOCKED'::text])))
);


--
-- Name: clock_release_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clock_release_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    "position" integer NOT NULL,
    start_minute smallint NOT NULL,
    source_kind public.clock_source_kind NOT NULL,
    source_id uuid NOT NULL,
    source_name text NOT NULL,
    page integer DEFAULT 1 NOT NULL,
    story_slug text DEFAULT 'Legacy clock block'::text NOT NULL,
    segment_type text DEFAULT 'AUDIO'::text NOT NULL,
    planned_duration_ms bigint,
    editorial_status text DEFAULT 'DRAFT'::text NOT NULL,
    technical_status text DEFAULT 'UNCHECKED'::text NOT NULL,
    talent text DEFAULT ''::text NOT NULL,
    camera_source_note text DEFAULT ''::text NOT NULL,
    script text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT clock_release_blocks_camera_source_note_check CHECK ((char_length(camera_source_note) <= 2000)),
    CONSTRAINT clock_release_blocks_editorial_status_check CHECK ((editorial_status = ANY (ARRAY['DRAFT'::text, 'IN_REVIEW'::text, 'APPROVED'::text, 'KILLED'::text]))),
    CONSTRAINT clock_release_blocks_notes_check CHECK ((char_length(notes) <= 50000)),
    CONSTRAINT clock_release_blocks_page_check CHECK (((page >= 1) AND (page <= 9999))),
    CONSTRAINT clock_release_blocks_planned_duration_ms_check CHECK (((planned_duration_ms IS NULL) OR ((planned_duration_ms >= 0) AND (planned_duration_ms <= 604800000)))),
    CONSTRAINT clock_release_blocks_position_check CHECK (("position" >= 0)),
    CONSTRAINT clock_release_blocks_script_check CHECK ((char_length(script) <= 50000)),
    CONSTRAINT clock_release_blocks_segment_type_check CHECK ((segment_type = ANY (ARRAY['STORY'::text, 'PACKAGE'::text, 'VO'::text, 'SOT'::text, 'LIVE'::text, 'BREAK'::text, 'BUMP'::text, 'GRAPHIC'::text, 'AUDIO'::text, 'COMMAND'::text, 'NOTE'::text]))),
    CONSTRAINT clock_release_blocks_start_minute_check CHECK (((start_minute >= 0) AND (start_minute <= 10079))),
    CONSTRAINT clock_release_blocks_story_slug_check CHECK (((char_length(story_slug) >= 1) AND (char_length(story_slug) <= 160))),
    CONSTRAINT clock_release_blocks_talent_check CHECK ((char_length(talent) <= 500)),
    CONSTRAINT clock_release_blocks_technical_status_check CHECK ((technical_status = ANY (ARRAY['UNCHECKED'::text, 'READY'::text, 'WARNING'::text, 'BLOCKED'::text])))
);


--
-- Name: clock_release_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clock_release_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_block_id uuid NOT NULL,
    "position" integer NOT NULL,
    media_kind public.clock_media_kind NOT NULL,
    radio_track_id uuid,
    video_id uuid,
    title text NOT NULL,
    artist text DEFAULT ''::text NOT NULL,
    album text DEFAULT ''::text NOT NULL,
    duration_ms bigint NOT NULL,
    media_key text NOT NULL,
    artwork_key text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT clock_release_items_check CHECK ((((media_kind = 'RADIO_TRACK'::public.clock_media_kind) AND (radio_track_id IS NOT NULL) AND (video_id IS NULL)) OR ((media_kind = 'VIDEO'::public.clock_media_kind) AND (radio_track_id IS NULL) AND (video_id IS NOT NULL)))),
    CONSTRAINT clock_release_items_duration_ms_check CHECK ((duration_ms > 0)),
    CONSTRAINT clock_release_items_position_check CHECK (("position" >= 0))
);


--
-- Name: clock_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clock_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    release_number integer NOT NULL,
    source_draft_version integer NOT NULL,
    time_zone text NOT NULL,
    published_by_user_id uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clock_releases_release_number_check CHECK ((release_number > 0)),
    CONSTRAINT clock_releases_source_draft_version_check CHECK ((source_draft_version >= 0))
);


--
-- Name: clock_timeline_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clock_timeline_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    service_week date NOT NULL,
    "position" integer NOT NULL,
    release_block_id uuid NOT NULL,
    release_item_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    source_offset_ms bigint DEFAULT 0 NOT NULL,
    playback_duration_ms bigint NOT NULL,
    CONSTRAINT clock_timeline_items_check CHECK ((ends_at > starts_at)),
    CONSTRAINT clock_timeline_items_playback_duration_ms_check CHECK ((playback_duration_ms > 0)),
    CONSTRAINT clock_timeline_items_position_check CHECK (("position" >= 0)),
    CONSTRAINT clock_timeline_items_source_offset_ms_check CHECK ((source_offset_ms >= 0))
);


--
-- Name: content_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_code text NOT NULL,
    subject_type text NOT NULL,
    station_id uuid,
    video_id uuid,
    chat_message_id uuid,
    reporter_user_id uuid,
    reporter_guest_id uuid,
    reporter_email text,
    reason text NOT NULL,
    details text NOT NULL,
    subject_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    assigned_to_user_id uuid,
    decision_source text,
    resolution_note text,
    resolved_by_user_id uuid,
    resolved_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_reports_decision_source_check CHECK (((decision_source IS NULL) OR (decision_source = ANY (ARRAY['HUMAN'::text, 'BOT'::text])))),
    CONSTRAINT content_reports_details_check CHECK (((char_length(details) >= 10) AND (char_length(details) <= 2000))),
    CONSTRAINT content_reports_reason_check CHECK ((reason = ANY (ARRAY['ILLEGAL_CONTENT'::text, 'CHILD_SAFETY'::text, 'INTELLECTUAL_PROPERTY'::text, 'VIOLENCE_OR_THREATS'::text, 'HATE_OR_HARASSMENT'::text, 'SPAM_OR_SCAM'::text, 'OTHER'::text]))),
    CONSTRAINT content_reports_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_REVIEW'::text, 'ACTIONED'::text, 'DISMISSED'::text]))),
    CONSTRAINT content_reports_subject_type_check CHECK ((subject_type = ANY (ARRAY['STATION'::text, 'VIDEO'::text, 'CHAT_MESSAGE'::text]))),
    CONSTRAINT content_reports_version_check CHECK ((version > 0))
);


--
-- Name: device_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_code_hash character(64) NOT NULL,
    user_code_hash character(64) NOT NULL,
    device_type public.linked_device_type NOT NULL,
    display_name text NOT NULL,
    scopes text[] DEFAULT ARRAY['catalog:read'::text, 'tunes:write'::text] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    poll_interval_seconds integer DEFAULT 5 NOT NULL,
    next_poll_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_user_id uuid,
    approved_at timestamp with time zone,
    consumed_at timestamp with time zone,
    CONSTRAINT device_authorizations_approval_check CHECK ((((approved_user_id IS NULL) AND (approved_at IS NULL)) OR ((approved_user_id IS NOT NULL) AND (approved_at IS NOT NULL)))),
    CONSTRAINT device_authorizations_display_name_check CHECK (((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 80))),
    CONSTRAINT device_authorizations_poll_interval_seconds_check CHECK ((poll_interval_seconds >= 5)),
    CONSTRAINT device_authorizations_scopes_check CHECK (((scopes <@ ARRAY['catalog:read'::text, 'tunes:write'::text, 'rooms:join'::text]) AND (scopes @> ARRAY['catalog:read'::text, 'tunes:write'::text, 'rooms:join'::text])))
);


--
-- Name: device_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    authorization_id uuid,
    user_id uuid NOT NULL,
    device_type public.linked_device_type NOT NULL,
    display_name text NOT NULL,
    token_hash character(64) NOT NULL,
    scopes text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    authentication_method text DEFAULT 'PAIRING'::text NOT NULL,
    CONSTRAINT device_sessions_authentication_method_check CHECK ((authentication_method = ANY (ARRAY['PAIRING'::text, 'PASSWORD'::text]))),
    CONSTRAINT device_sessions_display_name_check CHECK (((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 80))),
    CONSTRAINT device_sessions_scopes_check CHECK (((scopes <@ ARRAY['catalog:read'::text, 'tunes:write'::text, 'rooms:join'::text]) AND (cardinality(scopes) > 0)))
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    invalidated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_verification_completion_check CHECK (((consumed_at IS NULL) OR (invalidated_at IS NULL))),
    CONSTRAINT email_verification_expiry_check CHECK ((expires_at > created_at)),
    CONSTRAINT email_verification_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: media_asset_provenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_asset_provenance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_asset_id uuid NOT NULL,
    source_kind public.media_asset_source_kind NOT NULL,
    parent_media_asset_id uuid,
    legacy_video_id uuid,
    legacy_radio_track_id uuid,
    external_provider text,
    external_source_id text,
    normalized_source_url text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    recorded_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_asset_provenance_details_check CHECK ((jsonb_typeof(details) = 'object'::text)),
    CONSTRAINT media_asset_provenance_external_provider_check CHECK (((external_provider IS NULL) OR (char_length(external_provider) <= 80))),
    CONSTRAINT media_asset_provenance_external_source_id_check CHECK (((external_source_id IS NULL) OR (char_length(external_source_id) <= 512))),
    CONSTRAINT media_asset_provenance_legacy_source_check CHECK ((NOT ((legacy_video_id IS NOT NULL) AND (legacy_radio_track_id IS NOT NULL)))),
    CONSTRAINT media_asset_provenance_normalized_source_url_check CHECK (((normalized_source_url IS NULL) OR (char_length(normalized_source_url) <= 2048)))
);


--
-- Name: media_asset_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_asset_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_asset_id uuid NOT NULL,
    role public.media_asset_variant_role NOT NULL,
    generation integer NOT NULL,
    status public.media_asset_variant_status DEFAULT 'PENDING'::public.media_asset_variant_status NOT NULL,
    storage_authority public.media_storage_authority DEFAULT 'CANONICAL'::public.media_storage_authority NOT NULL,
    object_key text NOT NULL,
    mime_type text,
    size_bytes bigint,
    checksum_sha256 text,
    technical_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    duration_ms bigint,
    width integer,
    height integer,
    codec text,
    bitrate_bps bigint,
    sample_rate_hz integer,
    channels integer,
    ready_at timestamp with time zone,
    failure_code text,
    failure_detail text,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_asset_variants_bitrate_bps_check CHECK (((bitrate_bps IS NULL) OR (bitrate_bps > 0))),
    CONSTRAINT media_asset_variants_channels_check CHECK (((channels IS NULL) OR (channels > 0))),
    CONSTRAINT media_asset_variants_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT media_asset_variants_deleted_check CHECK (((status <> 'DELETED'::public.media_asset_variant_status) OR (deleted_at IS NOT NULL))),
    CONSTRAINT media_asset_variants_dimensions_check CHECK ((((width IS NULL) AND (height IS NULL)) OR ((width IS NOT NULL) AND (height IS NOT NULL)))),
    CONSTRAINT media_asset_variants_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms > 0))),
    CONSTRAINT media_asset_variants_failure_detail_check CHECK (((failure_detail IS NULL) OR (char_length(failure_detail) <= 2000))),
    CONSTRAINT media_asset_variants_generation_check CHECK ((generation > 0)),
    CONSTRAINT media_asset_variants_height_check CHECK (((height IS NULL) OR (height > 0))),
    CONSTRAINT media_asset_variants_mime_type_check CHECK (((mime_type IS NULL) OR (char_length(mime_type) <= 255))),
    CONSTRAINT media_asset_variants_object_key_check CHECK (((char_length(object_key) >= 1) AND (char_length(object_key) <= 1024))),
    CONSTRAINT media_asset_variants_ready_check CHECK (((status <> 'READY'::public.media_asset_variant_status) OR ((size_bytes IS NOT NULL) AND (ready_at IS NOT NULL)))),
    CONSTRAINT media_asset_variants_sample_rate_hz_check CHECK (((sample_rate_hz IS NULL) OR (sample_rate_hz > 0))),
    CONSTRAINT media_asset_variants_size_bytes_check CHECK (((size_bytes IS NULL) OR (size_bytes >= 0))),
    CONSTRAINT media_asset_variants_technical_metadata_check CHECK ((jsonb_typeof(technical_metadata) = 'object'::text)),
    CONSTRAINT media_asset_variants_width_check CHECK (((width IS NULL) OR (width > 0)))
);


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    media_type public.media_asset_type NOT NULL,
    status public.media_asset_status DEFAULT 'PENDING_UPLOAD'::public.media_asset_status NOT NULL,
    storage_authority public.media_storage_authority DEFAULT 'CANONICAL'::public.media_storage_authority NOT NULL,
    source_kind public.media_asset_source_kind DEFAULT 'UPLOAD'::public.media_asset_source_kind NOT NULL,
    version bigint DEFAULT 1 NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    original_file_name text,
    mime_type text,
    source_object_key text,
    checksum_sha256 text,
    quota_bytes bigint DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    duration_ms bigint,
    width integer,
    height integer,
    frame_rate numeric(12,6),
    video_codec text,
    audio_codec text,
    audio_sample_rate_hz integer,
    audio_channels integer,
    bitrate_bps bigint,
    ready_at timestamp with time zone,
    archived_at timestamp with time zone,
    deletion_requested_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_from_status public.media_asset_status,
    CONSTRAINT media_assets_archived_from_status_check CHECK ((((status = 'ARCHIVED'::public.media_asset_status) AND ((archived_from_status IS NULL) OR (archived_from_status = ANY (ARRAY['READY'::public.media_asset_status, 'PARTIAL'::public.media_asset_status, 'FAILED'::public.media_asset_status])))) OR ((status <> 'ARCHIVED'::public.media_asset_status) AND (archived_from_status IS NULL)))),
    CONSTRAINT media_assets_archived_lifecycle_check CHECK (((status <> 'ARCHIVED'::public.media_asset_status) OR (archived_at IS NOT NULL))),
    CONSTRAINT media_assets_audio_channels_check CHECK (((audio_channels IS NULL) OR (audio_channels > 0))),
    CONSTRAINT media_assets_audio_sample_rate_hz_check CHECK (((audio_sample_rate_hz IS NULL) OR (audio_sample_rate_hz > 0))),
    CONSTRAINT media_assets_bitrate_bps_check CHECK (((bitrate_bps IS NULL) OR (bitrate_bps > 0))),
    CONSTRAINT media_assets_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT media_assets_deleted_lifecycle_check CHECK (((status <> 'DELETED'::public.media_asset_status) OR (deleted_at IS NOT NULL))),
    CONSTRAINT media_assets_dimensions_check CHECK ((((width IS NULL) AND (height IS NULL)) OR ((width IS NOT NULL) AND (height IS NOT NULL)))),
    CONSTRAINT media_assets_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms > 0))),
    CONSTRAINT media_assets_frame_rate_check CHECK (((frame_rate IS NULL) OR (frame_rate > (0)::numeric))),
    CONSTRAINT media_assets_height_check CHECK (((height IS NULL) OR (height > 0))),
    CONSTRAINT media_assets_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT media_assets_mime_type_check CHECK (((mime_type IS NULL) OR (char_length(mime_type) <= 255))),
    CONSTRAINT media_assets_original_file_name_check CHECK (((original_file_name IS NULL) OR (char_length(original_file_name) <= 512))),
    CONSTRAINT media_assets_quota_bytes_check CHECK ((quota_bytes >= 0)),
    CONSTRAINT media_assets_ready_lifecycle_check CHECK (((status <> 'READY'::public.media_asset_status) OR (ready_at IS NOT NULL))),
    CONSTRAINT media_assets_source_object_key_check CHECK (((source_object_key IS NULL) OR ((char_length(source_object_key) >= 1) AND (char_length(source_object_key) <= 1024)))),
    CONSTRAINT media_assets_title_check CHECK ((char_length(title) <= 240)),
    CONSTRAINT media_assets_version_check CHECK ((version > 0)),
    CONSTRAINT media_assets_width_check CHECK (((width IS NULL) OR (width > 0)))
);


--
-- Name: media_gc_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_gc_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_asset_id uuid NOT NULL,
    hold_kind text NOT NULL,
    reason text NOT NULL,
    held_by_user_id uuid,
    held_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    released_by_user_id uuid,
    released_at timestamp with time zone,
    release_reason text,
    CONSTRAINT media_gc_holds_expiry_check CHECK (((expires_at IS NULL) OR (expires_at > held_at))),
    CONSTRAINT media_gc_holds_hold_kind_check CHECK ((hold_kind = ANY (ARRAY['LEGAL'::text, 'EDITORIAL'::text, 'RELEASE'::text, 'OPERATIONS'::text]))),
    CONSTRAINT media_gc_holds_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 1000))),
    CONSTRAINT media_gc_holds_release_check CHECK ((((released_at IS NULL) AND (released_by_user_id IS NULL) AND (release_reason IS NULL)) OR (released_at IS NOT NULL))),
    CONSTRAINT media_gc_holds_release_reason_check CHECK (((release_reason IS NULL) OR (char_length(release_reason) <= 1000)))
);


--
-- Name: media_gc_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_gc_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    media_asset_id uuid,
    media_asset_variant_id uuid,
    task_kind text NOT NULL,
    storage_authority public.media_storage_authority NOT NULL,
    object_key text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    reason text NOT NULL,
    not_before timestamp with time zone DEFAULT now() NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 10 NOT NULL,
    claim_token uuid,
    claimed_by text,
    lease_expires_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_gc_tasks_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT media_gc_tasks_attempts_check CHECK ((attempt_count <= max_attempts)),
    CONSTRAINT media_gc_tasks_claim_check CHECK (((status <> 'RUNNING'::text) OR ((claim_token IS NOT NULL) AND (claimed_by IS NOT NULL) AND (lease_expires_at IS NOT NULL)))),
    CONSTRAINT media_gc_tasks_claimed_by_check CHECK (((claimed_by IS NULL) OR (char_length(claimed_by) <= 255))),
    CONSTRAINT media_gc_tasks_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 4000))),
    CONSTRAINT media_gc_tasks_max_attempts_check CHECK ((max_attempts > 0)),
    CONSTRAINT media_gc_tasks_object_key_check CHECK (((char_length(object_key) >= 1) AND (char_length(object_key) <= 1024))),
    CONSTRAINT media_gc_tasks_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 240))),
    CONSTRAINT media_gc_tasks_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'CANCELLED'::text, 'HELD'::text]))),
    CONSTRAINT media_gc_tasks_task_kind_check CHECK ((task_kind = ANY (ARRAY['DELETE_OBJECT'::text, 'DELETE_PREFIX'::text, 'ABORT_MULTIPART'::text])))
);


--
-- Name: media_processing_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_processing_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_asset_id uuid NOT NULL,
    media_asset_variant_id uuid,
    job_type text NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'QUEUED'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    claim_token uuid,
    claimed_by text,
    lease_expires_at timestamp with time zone,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_processing_jobs_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT media_processing_jobs_attempts_check CHECK ((attempt_count <= max_attempts)),
    CONSTRAINT media_processing_jobs_claim_check CHECK (((status <> 'RUNNING'::text) OR ((claim_token IS NOT NULL) AND (claimed_by IS NOT NULL) AND (lease_expires_at IS NOT NULL)))),
    CONSTRAINT media_processing_jobs_claimed_by_check CHECK (((claimed_by IS NULL) OR (char_length(claimed_by) <= 255))),
    CONSTRAINT media_processing_jobs_idempotency_key_check CHECK (((char_length(idempotency_key) >= 1) AND (char_length(idempotency_key) <= 255))),
    CONSTRAINT media_processing_jobs_job_type_check CHECK (((char_length(job_type) >= 1) AND (char_length(job_type) <= 80))),
    CONSTRAINT media_processing_jobs_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 4000))),
    CONSTRAINT media_processing_jobs_max_attempts_check CHECK ((max_attempts > 0)),
    CONSTRAINT media_processing_jobs_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT media_processing_jobs_result_check CHECK (((result IS NULL) OR (jsonb_typeof(result) = 'object'::text))),
    CONSTRAINT media_processing_jobs_status_check CHECK ((status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'CANCELLED'::text])))
);


--
-- Name: media_rights_attestations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_rights_attestations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_asset_id uuid NOT NULL,
    attestation_version integer NOT NULL,
    rights_basis text NOT NULL,
    statement text NOT NULL,
    territories text[] DEFAULT '{}'::text[] NOT NULL,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    attested_by_user_id uuid,
    attested_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_by_user_id uuid,
    revoked_at timestamp with time zone,
    revocation_reason text,
    CONSTRAINT media_rights_attestations_attestation_version_check CHECK ((attestation_version > 0)),
    CONSTRAINT media_rights_attestations_evidence_check CHECK ((jsonb_typeof(evidence) = 'object'::text)),
    CONSTRAINT media_rights_attestations_revocation_check CHECK ((((revoked_at IS NULL) AND (revoked_by_user_id IS NULL) AND (revocation_reason IS NULL)) OR (revoked_at IS NOT NULL))),
    CONSTRAINT media_rights_attestations_revocation_reason_check CHECK (((revocation_reason IS NULL) OR (char_length(revocation_reason) <= 1000))),
    CONSTRAINT media_rights_attestations_rights_basis_check CHECK ((rights_basis = ANY (ARRAY['OWNER'::text, 'LICENSED'::text, 'PUBLIC_DOMAIN'::text, 'PERMISSION'::text, 'OTHER'::text]))),
    CONSTRAINT media_rights_attestations_statement_check CHECK (((char_length(statement) >= 1) AND (char_length(statement) <= 4000))),
    CONSTRAINT media_rights_attestations_validity_check CHECK (((valid_until IS NULL) OR (valid_from IS NULL) OR (valid_until > valid_from)))
);


--
-- Name: media_upload_parts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_upload_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_session_id uuid NOT NULL,
    part_number integer NOT NULL,
    size_bytes bigint NOT NULL,
    etag text NOT NULL,
    checksum_sha256 text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_upload_parts_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT media_upload_parts_etag_check CHECK (((char_length(etag) >= 1) AND (char_length(etag) <= 512))),
    CONSTRAINT media_upload_parts_part_number_check CHECK ((part_number > 0)),
    CONSTRAINT media_upload_parts_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: media_upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_asset_id uuid NOT NULL,
    initiated_by_user_id uuid,
    idempotency_key uuid NOT NULL,
    status text DEFAULT 'INITIATED'::text NOT NULL,
    storage_authority public.media_storage_authority DEFAULT 'CANONICAL'::public.media_storage_authority NOT NULL,
    object_key text NOT NULL,
    provider_upload_id text,
    expected_bytes bigint NOT NULL,
    received_bytes bigint DEFAULT 0 NOT NULL,
    part_size_bytes bigint,
    expected_parts integer,
    checksum_sha256 text,
    expires_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    aborted_at timestamp with time zone,
    error_detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_upload_sessions_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT media_upload_sessions_error_detail_check CHECK (((error_detail IS NULL) OR (char_length(error_detail) <= 2000))),
    CONSTRAINT media_upload_sessions_expected_bytes_check CHECK ((expected_bytes >= 0)),
    CONSTRAINT media_upload_sessions_expected_parts_check CHECK (((expected_parts IS NULL) OR (expected_parts > 0))),
    CONSTRAINT media_upload_sessions_expiry_check CHECK ((expires_at > created_at)),
    CONSTRAINT media_upload_sessions_object_key_check CHECK (((char_length(object_key) >= 1) AND (char_length(object_key) <= 1024))),
    CONSTRAINT media_upload_sessions_part_size_bytes_check CHECK (((part_size_bytes IS NULL) OR (part_size_bytes > 0))),
    CONSTRAINT media_upload_sessions_provider_upload_id_check CHECK (((provider_upload_id IS NULL) OR (char_length(provider_upload_id) <= 1024))),
    CONSTRAINT media_upload_sessions_received_bytes_check CHECK ((received_bytes >= 0)),
    CONSTRAINT media_upload_sessions_received_le_expected_check CHECK ((received_bytes <= expected_bytes)),
    CONSTRAINT media_upload_sessions_status_check CHECK ((status = ANY (ARRAY['INITIATED'::text, 'UPLOADING'::text, 'COMPLETING'::text, 'COMPLETE'::text, 'ABORTED'::text, 'EXPIRED'::text, 'FAILED'::text])))
);


--
-- Name: mobile_refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mobile_refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    replacement_id uuid,
    authenticated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mobile_refresh_tokens_check CHECK ((expires_at > created_at)),
    CONSTRAINT mobile_refresh_tokens_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: moderation_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid,
    actor_type text NOT NULL,
    actor_user_id uuid,
    actor_token_id uuid,
    actor_name text NOT NULL,
    action text NOT NULL,
    note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_audit_log_actor_type_check CHECK ((actor_type = ANY (ARRAY['HUMAN'::text, 'BOT'::text, 'SYSTEM'::text])))
);


--
-- Name: moderation_service_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_service_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: radio_tracks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_tracks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    upload_request_id uuid NOT NULL,
    title text NOT NULL,
    artist text DEFAULT ''::text NOT NULL,
    album text DEFAULT ''::text NOT NULL,
    status public.radio_track_status DEFAULT 'UPLOADING'::public.radio_track_status NOT NULL,
    source_key text NOT NULL,
    source_file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    duration_ms bigint,
    source_codec text,
    source_sample_rate integer,
    source_channels integer,
    integrated_lufs double precision,
    true_peak_db double precision,
    loudness_range_lu double precision,
    mezzanine_key text,
    artwork_key text,
    processing_progress integer DEFAULT 0 NOT NULL,
    processing_attempts integer DEFAULT 0 NOT NULL,
    processing_error text,
    processing_claim_id uuid,
    processing_started_at timestamp with time zone,
    processing_finished_at timestamp with time zone,
    processing_duration_ms bigint,
    metadata_edited_at timestamp with time zone,
    rights_attested_at timestamp with time zone NOT NULL,
    rights_attested_by uuid,
    rights_attestation_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_hls_key text,
    audio_hls_segment_ms integer DEFAULT 1000 NOT NULL,
    media_asset_id uuid,
    CONSTRAINT radio_tracks_album_check CHECK ((char_length(album) <= 120)),
    CONSTRAINT radio_tracks_artist_check CHECK ((char_length(artist) <= 120)),
    CONSTRAINT radio_tracks_audio_hls_segment_ms_check CHECK (((audio_hls_segment_ms >= 1000) AND (audio_hls_segment_ms <= 10000))),
    CONSTRAINT radio_tracks_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms > 0))),
    CONSTRAINT radio_tracks_processing_error_check CHECK (((processing_error IS NULL) OR (char_length(processing_error) <= 1000))),
    CONSTRAINT radio_tracks_processing_progress_check CHECK (((processing_progress >= 0) AND (processing_progress <= 100))),
    CONSTRAINT radio_tracks_ready_output_check CHECK (((status <> 'READY'::public.radio_track_status) OR ((duration_ms IS NOT NULL) AND (mezzanine_key IS NOT NULL)))),
    CONSTRAINT radio_tracks_rights_attestation_version_check CHECK ((rights_attestation_version > 0)),
    CONSTRAINT radio_tracks_size_bytes_check CHECK ((size_bytes >= 0)),
    CONSTRAINT radio_tracks_source_channels_check CHECK (((source_channels IS NULL) OR (source_channels > 0))),
    CONSTRAINT radio_tracks_source_sample_rate_check CHECK (((source_sample_rate IS NULL) OR (source_sample_rate > 0))),
    CONSTRAINT radio_tracks_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);


--
-- Name: stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    mode public.station_mode DEFAULT 'SYNCHRONIZED'::public.station_mode NOT NULL,
    logo_key text,
    offline_slate_key text,
    transition_ms integer DEFAULT 0 NOT NULL,
    access_token_hash text NOT NULL,
    access_token_ciphertext text NOT NULL,
    access_token_hint text NOT NULL,
    access_enabled boolean DEFAULT true NOT NULL,
    access_password_hash text,
    access_expires_at timestamp with time zone,
    active_schedule_id uuid,
    pending_schedule_id uuid,
    pending_activation_at timestamp with time zone,
    schedule_started_at timestamp with time zone,
    playlist_version integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    broadcast_state public.station_broadcast_state DEFAULT 'RUNNING'::public.station_broadcast_state NOT NULL,
    stopped_at timestamp with time zone,
    paused_schedule_id uuid,
    paused_cycle_offset_ms bigint,
    deleted_at timestamp with time zone,
    purge_after timestamp with time zone,
    deleted_access_enabled boolean,
    purge_attempts integer DEFAULT 0 NOT NULL,
    purge_error text,
    moderation_status public.station_moderation_status DEFAULT 'ACTIVE'::public.station_moderation_status NOT NULL,
    moderation_restricted_at timestamp with time zone,
    moderation_restricted_by uuid,
    moderation_note text,
    legal_hold_at timestamp with time zone,
    legal_hold_by uuid,
    visibility text DEFAULT 'PRIVATE'::text NOT NULL,
    genre_id uuid NOT NULL,
    owner_declared_explicit boolean DEFAULT false NOT NULL,
    explicit_enforced_at timestamp with time zone,
    explicit_enforced_by uuid,
    explicit_enforcement_note text,
    playback_order public.station_playback_order DEFAULT 'SEQUENTIAL'::public.station_playback_order NOT NULL,
    auto_publish_next_loop boolean DEFAULT true NOT NULL,
    paused_cycle_number bigint,
    station_kind public.station_kind DEFAULT 'TV'::public.station_kind NOT NULL,
    programming_mode public.station_programming_mode DEFAULT 'LEGACY_LOOP'::public.station_programming_mode NOT NULL,
    time_zone text DEFAULT 'UTC'::text NOT NULL,
    clock_draft_version integer DEFAULT 0 NOT NULL,
    active_clock_release_id uuid,
    is_featured boolean DEFAULT false NOT NULL,
    radio_delivery_mode public.radio_delivery_mode DEFAULT 'PLAYOUT'::public.radio_delivery_mode NOT NULL,
    previous_clock_release_id uuid,
    radio_release_changed_at timestamp with time zone,
    tv_delivery_mode public.tv_delivery_mode DEFAULT 'LEGACY_VOD'::public.tv_delivery_mode NOT NULL,
    tv_channel_rendition_mode public.tv_channel_rendition_mode DEFAULT 'DUAL'::public.tv_channel_rendition_mode NOT NULL,
    active_programming_profile_id uuid,
    playback_type text DEFAULT 'conventional'::text NOT NULL,
    active_calendar_release_id uuid,
    pending_calendar_release_id uuid,
    pending_calendar_activation_at timestamp with time zone,
    active_calendar_release_changed_at timestamp with time zone,
    CONSTRAINT stations_clock_draft_version_check CHECK ((clock_draft_version >= 0)),
    CONSTRAINT stations_clock_release_mode_check CHECK (((active_clock_release_id IS NULL) OR (programming_mode = 'CLOCK'::public.station_programming_mode))),
    CONSTRAINT stations_mode_synchronized CHECK ((mode = 'SYNCHRONIZED'::public.station_mode)),
    CONSTRAINT stations_paused_cycle_number_check CHECK (((paused_cycle_number IS NULL) OR (paused_cycle_number >= 0))),
    CONSTRAINT stations_paused_cycle_offset_ms_check CHECK (((paused_cycle_offset_ms IS NULL) OR (paused_cycle_offset_ms >= 0))),
    CONSTRAINT stations_pending_calendar_release_pair_check CHECK (((pending_calendar_release_id IS NULL) = (pending_calendar_activation_at IS NULL))),
    CONSTRAINT stations_playback_type_check CHECK (((playback_type = 'conventional'::text) OR ((playback_type = 'WEATHERSTAR_4000'::text) AND (station_kind = 'TV'::public.station_kind)))),
    CONSTRAINT stations_public_password_check CHECK (((visibility <> 'PUBLIC'::text) OR (access_password_hash IS NULL))),
    CONSTRAINT stations_purge_attempts_check CHECK ((purge_attempts >= 0)),
    CONSTRAINT stations_transition_ms_check CHECK (((transition_ms >= 0) AND (transition_ms <= 10000))),
    CONSTRAINT stations_tv_channel_delivery_check CHECK (((tv_delivery_mode <> 'CHANNEL_HLS'::public.tv_delivery_mode) OR (station_kind = 'TV'::public.station_kind))),
    CONSTRAINT stations_tv_channel_rendition_mode_check CHECK (((tv_channel_rendition_mode = 'DUAL'::public.tv_channel_rendition_mode) OR (station_kind = 'TV'::public.station_kind))),
    CONSTRAINT stations_visibility_check CHECK ((visibility = ANY (ARRAY['PRIVATE'::text, 'PUBLIC'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role public.user_role DEFAULT 'USER'::public.user_role NOT NULL,
    show_explicit_content boolean DEFAULT false NOT NULL,
    explicit_age_attested_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_at timestamp with time zone,
    disabled_reason text,
    disabled_by_user_id uuid,
    must_change_password boolean DEFAULT false NOT NULL,
    deletion_requested_at timestamp with time zone,
    anonymize_after timestamp with time zone,
    deletion_requested_by_user_id uuid,
    anonymized_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    avatar_revision text,
    weather_zip_code text,
    CONSTRAINT users_avatar_revision_format_check CHECK (((avatar_revision IS NULL) OR (avatar_revision ~ '^[A-Za-z0-9_-]{43}$'::text))),
    CONSTRAINT users_deletion_timing_check CHECK ((((deletion_requested_at IS NULL) AND (anonymize_after IS NULL)) OR ((deletion_requested_at IS NOT NULL) AND (anonymize_after IS NOT NULL) AND (anonymize_after >= deletion_requested_at)))),
    CONSTRAINT users_disabled_reason_check CHECK ((((disabled_at IS NULL) AND (disabled_reason IS NULL)) OR (disabled_at IS NOT NULL))),
    CONSTRAINT users_version_positive_check CHECK ((version > 0)),
    CONSTRAINT users_weather_zip_code_check CHECK (((weather_zip_code IS NULL) OR ((char_length(weather_zip_code) = 5) AND (weather_zip_code ~ '^[0-9]{5}$'::text))))
);


--
-- Name: videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status public.video_status DEFAULT 'UPLOADING'::public.video_status NOT NULL,
    source_key text NOT NULL,
    source_file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    duration_ms bigint,
    width integer,
    height integer,
    hls_key text,
    thumbnail_key text,
    captions_key text,
    processing_progress integer DEFAULT 0 NOT NULL,
    processing_attempts integer DEFAULT 0 NOT NULL,
    processing_error text,
    replacement_for_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_started_at timestamp with time zone,
    processing_finished_at timestamp with time zone,
    processing_duration_ms bigint,
    processing_encoder text,
    processing_rendition_count integer,
    source_kind text DEFAULT 'UPLOAD'::text NOT NULL,
    normalized_source_url text,
    external_source_id text,
    ingestion_status text,
    ingestion_error text,
    ingestion_request_id uuid,
    rights_attested_at timestamp with time zone,
    rights_attested_by uuid,
    rights_attestation_version integer,
    media_asset_id uuid,
    CONSTRAINT videos_ingestion_error_check CHECK (((ingestion_error IS NULL) OR (char_length(ingestion_error) <= 1000))),
    CONSTRAINT videos_ingestion_status_check CHECK (((ingestion_status IS NULL) OR (ingestion_status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text, 'COMPLETE'::text, 'FAILED'::text])))),
    CONSTRAINT videos_processing_duration_check CHECK (((processing_duration_ms IS NULL) OR (processing_duration_ms >= 0))),
    CONSTRAINT videos_processing_progress_check CHECK (((processing_progress >= 0) AND (processing_progress <= 100))),
    CONSTRAINT videos_processing_rendition_count_check CHECK (((processing_rendition_count IS NULL) OR ((processing_rendition_count >= 1) AND (processing_rendition_count <= 3)))),
    CONSTRAINT videos_size_bytes_check CHECK ((size_bytes >= 0)),
    CONSTRAINT videos_source_kind_check CHECK ((source_kind = ANY (ARRAY['UPLOAD'::text, 'YOUTUBE'::text]))),
    CONSTRAINT videos_youtube_provenance_check CHECK (((source_kind = 'UPLOAD'::text) OR ((normalized_source_url IS NOT NULL) AND (external_source_id ~ '^[A-Za-z0-9_-]{11}$'::text) AND (ingestion_status IS NOT NULL) AND (ingestion_request_id IS NOT NULL) AND (rights_attested_at IS NOT NULL) AND (rights_attested_by IS NOT NULL) AND (rights_attestation_version > 0))))
);


--
-- Name: owner_media_storage_usage_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.owner_media_storage_usage_v AS
 WITH storage_entries AS (
         SELECT media_assets.owner_id,
            media_assets.quota_bytes AS canonical_quota_bytes,
            (0)::bigint AS unlinked_legacy_video_bytes,
            (0)::bigint AS unlinked_legacy_radio_bytes
           FROM public.media_assets
          WHERE (media_assets.status <> 'DELETED'::public.media_asset_status)
        UNION ALL
         SELECT station.owner_id,
            (0)::bigint AS int8,
            video.size_bytes,
            (0)::bigint AS int8
           FROM (public.videos video
             JOIN public.stations station ON ((station.id = video.station_id)))
          WHERE (video.media_asset_id IS NULL)
        UNION ALL
         SELECT station.owner_id,
            (0)::bigint AS int8,
            (0)::bigint AS int8,
            track.size_bytes
           FROM (public.radio_tracks track
             JOIN public.stations station ON ((station.id = track.station_id)))
          WHERE (track.media_asset_id IS NULL)
        ), usage_by_owner AS (
         SELECT storage_entries.owner_id,
            (sum(storage_entries.canonical_quota_bytes))::bigint AS canonical_quota_bytes,
            (sum(storage_entries.unlinked_legacy_video_bytes))::bigint AS unlinked_legacy_video_bytes,
            (sum(storage_entries.unlinked_legacy_radio_bytes))::bigint AS unlinked_legacy_radio_bytes
           FROM storage_entries
          GROUP BY storage_entries.owner_id
        )
 SELECT owner_row.id AS owner_id,
    COALESCE(usage.canonical_quota_bytes, (0)::bigint) AS canonical_quota_bytes,
    COALESCE(usage.unlinked_legacy_video_bytes, (0)::bigint) AS unlinked_legacy_video_bytes,
    COALESCE(usage.unlinked_legacy_radio_bytes, (0)::bigint) AS unlinked_legacy_radio_bytes,
    ((COALESCE(usage.canonical_quota_bytes, (0)::bigint) + COALESCE(usage.unlinked_legacy_video_bytes, (0)::bigint)) + COALESCE(usage.unlinked_legacy_radio_bytes, (0)::bigint)) AS quota_bytes
   FROM (public.users owner_row
     LEFT JOIN usage_by_owner usage ON ((usage.owner_id = owner_row.id)));


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    invalidated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT password_reset_completion_check CHECK (((consumed_at IS NULL) OR (invalidated_at IS NULL))),
    CONSTRAINT password_reset_expiry_check CHECK ((expires_at > created_at)),
    CONSTRAINT password_reset_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: playlist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    video_id uuid NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    page integer NOT NULL,
    story_slug text NOT NULL,
    segment_type text DEFAULT 'PACKAGE'::text NOT NULL,
    planned_duration_ms bigint,
    timing_mode text DEFAULT 'FOLLOW'::text NOT NULL,
    hard_start_offset_ms bigint,
    editorial_status text DEFAULT 'DRAFT'::text NOT NULL,
    technical_status text DEFAULT 'UNCHECKED'::text NOT NULL,
    talent text DEFAULT ''::text NOT NULL,
    camera_source_note text DEFAULT ''::text NOT NULL,
    script text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT playlist_items_camera_note_check CHECK ((char_length(camera_source_note) <= 2000)),
    CONSTRAINT playlist_items_editorial_status_check CHECK ((editorial_status = ANY (ARRAY['DRAFT'::text, 'IN_REVIEW'::text, 'APPROVED'::text, 'KILLED'::text]))),
    CONSTRAINT playlist_items_notes_check CHECK ((char_length(notes) <= 50000)),
    CONSTRAINT playlist_items_page_check CHECK (((page >= 1) AND (page <= 9999))),
    CONSTRAINT playlist_items_planned_duration_check CHECK (((planned_duration_ms IS NULL) OR ((planned_duration_ms >= 0) AND (planned_duration_ms <= 86400000)))),
    CONSTRAINT playlist_items_position_check CHECK (("position" >= 0)),
    CONSTRAINT playlist_items_script_check CHECK ((char_length(script) <= 50000)),
    CONSTRAINT playlist_items_segment_type_check CHECK ((segment_type = ANY (ARRAY['STORY'::text, 'PACKAGE'::text, 'VO'::text, 'SOT'::text, 'LIVE'::text, 'BREAK'::text, 'BUMP'::text, 'GRAPHIC'::text, 'AUDIO'::text, 'COMMAND'::text, 'NOTE'::text]))),
    CONSTRAINT playlist_items_story_slug_check CHECK (((char_length(story_slug) >= 1) AND (char_length(story_slug) <= 160))),
    CONSTRAINT playlist_items_talent_check CHECK ((char_length(talent) <= 500)),
    CONSTRAINT playlist_items_technical_status_check CHECK ((technical_status = ANY (ARRAY['UNCHECKED'::text, 'READY'::text, 'WARNING'::text, 'BLOCKED'::text]))),
    CONSTRAINT playlist_items_timing_check CHECK ((((timing_mode = 'HARD'::text) AND ((hard_start_offset_ms >= 0) AND (hard_start_offset_ms <= 604800000))) OR ((timing_mode = ANY (ARRAY['FOLLOW'::text, 'FLOAT'::text])) AND (hard_start_offset_ms IS NULL))))
);


--
-- Name: radio_playout_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_playout_leases (
    station_id uuid NOT NULL,
    holder_id uuid NOT NULL,
    fence bigint NOT NULL,
    lease_until timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT radio_playout_leases_fence_check CHECK ((fence > 0))
);


--
-- Name: radio_playout_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_playout_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    lease_fence bigint NOT NULL,
    object_prefix text NOT NULL,
    audio_manifest_key text NOT NULL,
    waveform_manifest_key text NOT NULL,
    status public.radio_playout_session_status DEFAULT 'STARTING'::public.radio_playout_session_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    retired_at timestamp with time zone,
    CONSTRAINT radio_playout_sessions_lease_fence_check CHECK ((lease_fence > 0))
);


--
-- Name: radio_playout_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_playout_state (
    station_id uuid NOT NULL,
    status public.radio_playout_status DEFAULT 'OFFLINE'::public.radio_playout_status NOT NULL,
    lease_fence bigint,
    active_session_id uuid,
    current_release_id uuid,
    current_timeline_item_id uuid,
    source_position_ms bigint,
    audio_manifest_at timestamp with time zone,
    waveform_manifest_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    started_at timestamp with time zone,
    stopped_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone,
    restart_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    program_source text DEFAULT 'CLOCK'::text NOT NULL,
    source_changed_at timestamp with time zone,
    last_source_fallback_code text,
    last_source_fallback_at timestamp with time zone,
    occurrence_id uuid,
    calendar_release_id uuid,
    source_role public.calendar_source_role,
    current_calendar_item_id uuid,
    CONSTRAINT radio_playout_state_calendar_item_shape_check CHECK (((current_calendar_item_id IS NULL) OR ((calendar_release_id IS NOT NULL) AND (occurrence_id IS NOT NULL)))),
    CONSTRAINT radio_playout_state_calendar_occurrence_release_shape_check CHECK (((occurrence_id IS NULL) OR (calendar_release_id IS NOT NULL))),
    CONSTRAINT radio_playout_state_calendar_provenance_check CHECK (((source_role IS NULL) OR ((calendar_release_id IS NOT NULL) AND (((source_role = 'BASELINE'::public.calendar_source_role) AND (occurrence_id IS NULL)) OR ((source_role = ANY (ARRAY['PRIMARY'::public.calendar_source_role, 'FALLBACK'::public.calendar_source_role])) AND (occurrence_id IS NOT NULL)))))),
    CONSTRAINT radio_playout_state_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 1000))),
    CONSTRAINT radio_playout_state_last_source_fallback_code_check CHECK (((last_source_fallback_code IS NULL) OR (char_length(last_source_fallback_code) <= 80))),
    CONSTRAINT radio_playout_state_program_source_check CHECK ((program_source = ANY (ARRAY['CLOCK'::text, 'SILENCE'::text]))),
    CONSTRAINT radio_playout_state_restart_count_check CHECK ((restart_count >= 0)),
    CONSTRAINT radio_playout_state_source_position_ms_check CHECK (((source_position_ms IS NULL) OR (source_position_ms >= 0)))
);


--
-- Name: radio_release_item_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_release_item_delivery (
    release_item_id uuid NOT NULL,
    audio_hls_key text NOT NULL,
    segment_duration_ms integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT radio_release_item_delivery_segment_duration_ms_check CHECK (((segment_duration_ms >= 1000) AND (segment_duration_ms <= 10000)))
);


--
-- Name: radio_rotation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_rotation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rotation_id uuid NOT NULL,
    track_id uuid NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT radio_rotation_items_position_check CHECK (("position" >= 0))
);


--
-- Name: radio_rotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_rotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    name text NOT NULL,
    purpose public.rotation_purpose DEFAULT 'CONTENT'::public.rotation_purpose NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT radio_rotations_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))
);


--
-- Name: radio_timeline_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_timeline_delivery (
    timeline_item_id uuid NOT NULL,
    release_id uuid NOT NULL,
    service_week date NOT NULL,
    media_sequence_start bigint NOT NULL,
    discontinuity_sequence bigint NOT NULL,
    first_segment integer NOT NULL,
    segment_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT radio_timeline_delivery_discontinuity_sequence_check CHECK ((discontinuity_sequence >= 0)),
    CONSTRAINT radio_timeline_delivery_first_segment_check CHECK ((first_segment >= 0)),
    CONSTRAINT radio_timeline_delivery_media_sequence_start_check CHECK ((media_sequence_start >= 0)),
    CONSTRAINT radio_timeline_delivery_segment_count_check CHECK ((segment_count > 0))
);


--
-- Name: radio_visual_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radio_visual_settings (
    station_id uuid NOT NULL,
    mode text DEFAULT 'VISUALIZER'::text NOT NULL,
    visualizer_id text DEFAULT 'mirrored-wave'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT radio_visual_settings_mode_check CHECK ((mode = ANY (ARRAY['COVER'::text, 'VISUALIZER'::text]))),
    CONSTRAINT radio_visual_settings_version_check CHECK ((version > 0)),
    CONSTRAINT radio_visual_settings_visualizer_id_check CHECK ((visualizer_id = ANY (ARRAY['oscilloscope'::text, 'mirrored-wave'::text, 'dot-wave'::text, 'spectrum-bars'::text, 'spectrum-lines'::text, 'spectrum-fire'::text, 'spectrogram-scroll'::text, 'spectrogram-rain'::text, 'vector-orbit'::text, 'vector-polar'::text])))
);


--
-- Name: schedule_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    video_id uuid NOT NULL,
    "position" integer NOT NULL,
    title text NOT NULL,
    duration_ms bigint NOT NULL,
    hls_key text NOT NULL,
    thumbnail_key text,
    captions_key text,
    page integer NOT NULL,
    story_slug text NOT NULL,
    segment_type text DEFAULT 'PACKAGE'::text NOT NULL,
    planned_duration_ms bigint,
    timing_mode text DEFAULT 'FOLLOW'::text NOT NULL,
    hard_start_offset_ms bigint,
    editorial_status text DEFAULT 'DRAFT'::text NOT NULL,
    technical_status text DEFAULT 'UNCHECKED'::text NOT NULL,
    talent text DEFAULT ''::text NOT NULL,
    camera_source_note text DEFAULT ''::text NOT NULL,
    script text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT schedule_items_camera_note_check CHECK ((char_length(camera_source_note) <= 2000)),
    CONSTRAINT schedule_items_duration_ms_check CHECK ((duration_ms > 0)),
    CONSTRAINT schedule_items_editorial_status_check CHECK ((editorial_status = ANY (ARRAY['DRAFT'::text, 'IN_REVIEW'::text, 'APPROVED'::text, 'KILLED'::text]))),
    CONSTRAINT schedule_items_notes_check CHECK ((char_length(notes) <= 50000)),
    CONSTRAINT schedule_items_page_check CHECK (((page >= 1) AND (page <= 9999))),
    CONSTRAINT schedule_items_planned_duration_check CHECK (((planned_duration_ms IS NULL) OR ((planned_duration_ms >= 0) AND (planned_duration_ms <= 86400000)))),
    CONSTRAINT schedule_items_position_check CHECK (("position" >= 0)),
    CONSTRAINT schedule_items_script_check CHECK ((char_length(script) <= 50000)),
    CONSTRAINT schedule_items_segment_type_check CHECK ((segment_type = ANY (ARRAY['STORY'::text, 'PACKAGE'::text, 'VO'::text, 'SOT'::text, 'LIVE'::text, 'BREAK'::text, 'BUMP'::text, 'GRAPHIC'::text, 'AUDIO'::text, 'COMMAND'::text, 'NOTE'::text]))),
    CONSTRAINT schedule_items_story_slug_check CHECK (((char_length(story_slug) >= 1) AND (char_length(story_slug) <= 160))),
    CONSTRAINT schedule_items_talent_check CHECK ((char_length(talent) <= 500)),
    CONSTRAINT schedule_items_technical_status_check CHECK ((technical_status = ANY (ARRAY['UNCHECKED'::text, 'READY'::text, 'WARNING'::text, 'BLOCKED'::text]))),
    CONSTRAINT schedule_items_timing_check CHECK ((((timing_mode = 'HARD'::text) AND ((hard_start_offset_ms >= 0) AND (hard_start_offset_ms <= 604800000))) OR ((timing_mode = ANY (ARRAY['FOLLOW'::text, 'FLOAT'::text])) AND (hard_start_offset_ms IS NULL))))
);


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    source_playlist_version integer NOT NULL,
    transition_ms integer DEFAULT 0 NOT NULL,
    total_duration_ms bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    playback_order public.station_playback_order DEFAULT 'SEQUENTIAL'::public.station_playback_order NOT NULL,
    shuffle_seed bigint DEFAULT 0 NOT NULL,
    CONSTRAINT schedules_total_duration_ms_check CHECK ((total_duration_ms > 0))
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    audience text DEFAULT 'MAIN'::text NOT NULL,
    mobile_refresh_family_id uuid,
    authenticated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sessions_audience_check CHECK ((audience = ANY (ARRAY['MAIN'::text, 'RADIO'::text, 'MOBILE'::text])))
);


--
-- Name: station_fans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_fans (
    user_id uuid NOT NULL,
    station_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: station_genres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_genres (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_explicit boolean DEFAULT false NOT NULL,
    CONSTRAINT station_genres_description_check CHECK ((char_length(description) <= 240)),
    CONSTRAINT station_genres_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 60))),
    CONSTRAINT station_genres_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text))
);


--
-- Name: station_media_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_media_allocations (
    station_id uuid NOT NULL,
    media_asset_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: station_media_storage_usage_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.station_media_storage_usage_v AS
 WITH canonical AS (
         SELECT allocation.station_id,
            (COALESCE(sum(asset.quota_bytes) FILTER (WHERE (asset.status <> 'DELETED'::public.media_asset_status)), (0)::numeric))::bigint AS canonical_quota_bytes
           FROM (public.station_media_allocations allocation
             JOIN public.media_assets asset ON ((asset.id = allocation.media_asset_id)))
          GROUP BY allocation.station_id
        ), legacy_video AS (
         SELECT videos.station_id,
            (COALESCE(sum(videos.size_bytes), (0)::numeric))::bigint AS legacy_video_bytes
           FROM public.videos
          WHERE (videos.media_asset_id IS NULL)
          GROUP BY videos.station_id
        ), legacy_radio AS (
         SELECT radio_tracks.station_id,
            (COALESCE(sum(radio_tracks.size_bytes), (0)::numeric))::bigint AS legacy_radio_bytes
           FROM public.radio_tracks
          WHERE (radio_tracks.media_asset_id IS NULL)
          GROUP BY radio_tracks.station_id
        )
 SELECT station.id AS station_id,
    COALESCE(canonical.canonical_quota_bytes, (0)::bigint) AS canonical_quota_bytes,
    COALESCE(legacy_video.legacy_video_bytes, (0)::bigint) AS legacy_video_bytes,
    COALESCE(legacy_radio.legacy_radio_bytes, (0)::bigint) AS legacy_radio_bytes,
    ((COALESCE(canonical.canonical_quota_bytes, (0)::bigint) + COALESCE(legacy_video.legacy_video_bytes, (0)::bigint)) + COALESCE(legacy_radio.legacy_radio_bytes, (0)::bigint)) AS quota_bytes
   FROM (((public.stations station
     LEFT JOIN canonical ON ((canonical.station_id = station.id)))
     LEFT JOIN legacy_video ON ((legacy_video.station_id = station.id)))
     LEFT JOIN legacy_radio ON ((legacy_radio.station_id = station.id)));


--
-- Name: station_operation_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_operation_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT station_operation_audit_action_check CHECK (((char_length(action) >= 1) AND (char_length(action) <= 80))),
    CONSTRAINT station_operation_audit_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text))
);


--
-- Name: station_programming_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_programming_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    name text NOT NULL,
    strategy public.station_programming_strategy NOT NULL,
    lifecycle public.programming_profile_lifecycle DEFAULT 'DRAFT'::public.programming_profile_lifecycle NOT NULL,
    source_profile_id uuid,
    migration_preview jsonb DEFAULT '{}'::jsonb NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT station_programming_profiles_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
    CONSTRAINT station_programming_profiles_version_check CHECK ((version > 0))
);


--
-- Name: station_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_ratings (
    user_id uuid NOT NULL,
    station_id uuid NOT NULL,
    rating smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT station_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: station_room_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_room_access (
    station_id uuid NOT NULL,
    code_lookup_hash character(64) NOT NULL,
    generation uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rotated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: station_room_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_room_memberships (
    station_id uuid NOT NULL,
    user_id uuid NOT NULL,
    access_generation uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: station_room_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_room_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    access_generation uuid NOT NULL,
    token_hash character(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone
);


--
-- Name: station_tunes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.station_tunes (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    station_id uuid NOT NULL,
    client public.station_tune_client NOT NULL,
    tuned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: studio_asset_clips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_asset_clips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    parent_media_asset_id uuid NOT NULL,
    child_media_asset_id uuid NOT NULL,
    clip_request_id uuid NOT NULL,
    start_ms bigint NOT NULL,
    end_ms bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_asset_clips_check CHECK (((end_ms > start_ms) AND (((end_ms - start_ms) >= 1000) AND ((end_ms - start_ms) <= 7200000)))),
    CONSTRAINT studio_asset_clips_start_ms_check CHECK ((start_ms >= 0))
);


--
-- Name: studio_draft_asset_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_draft_asset_references (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    draft_version integer NOT NULL,
    reference_key text NOT NULL,
    media_asset_id uuid NOT NULL,
    media_asset_variant_id uuid,
    requested_role public.media_asset_variant_role,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_draft_asset_references_draft_version_check CHECK ((draft_version > 0)),
    CONSTRAINT studio_draft_asset_references_reference_key_check CHECK (((char_length(reference_key) >= 1) AND (char_length(reference_key) <= 255)))
);


--
-- Name: studio_project_mutation_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_project_mutation_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    actor_user_id uuid,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    expected_draft_version integer NOT NULL,
    applied_draft_version integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_project_mutation_receipts_applied_draft_version_check CHECK ((applied_draft_version > 0)),
    CONSTRAINT studio_project_mutation_receipts_expected_draft_version_check CHECK ((expected_draft_version > 0)),
    CONSTRAINT studio_project_mutation_receipts_request_hash_check CHECK ((request_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: studio_project_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_project_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    release_number integer NOT NULL,
    document jsonb NOT NULL,
    document_hash text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_draft_version integer NOT NULL,
    idempotency_key uuid NOT NULL,
    CONSTRAINT studio_project_releases_document_check CHECK ((jsonb_typeof(document) = 'object'::text)),
    CONSTRAINT studio_project_releases_document_hash_check CHECK ((document_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT studio_project_releases_release_number_check CHECK ((release_number > 0)),
    CONSTRAINT studio_project_releases_source_draft_version_check CHECK ((source_draft_version > 0))
);


--
-- Name: studio_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    draft_document jsonb NOT NULL,
    draft_version integer DEFAULT 1 NOT NULL,
    active_release_id uuid,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_projects_description_check CHECK ((char_length(description) <= 2000)),
    CONSTRAINT studio_projects_draft_document_check CHECK ((jsonb_typeof(draft_document) = 'object'::text)),
    CONSTRAINT studio_projects_draft_version_check CHECK ((draft_version > 0)),
    CONSTRAINT studio_projects_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)))
);


--
-- Name: studio_release_asset_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_release_asset_references (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    reference_key text NOT NULL,
    media_asset_id uuid NOT NULL,
    media_asset_variant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_release_asset_references_reference_key_check CHECK (((char_length(reference_key) >= 1) AND (char_length(reference_key) <= 255)))
);


--
-- Name: studio_rundown_cues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_rundown_cues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rundown_id uuid NOT NULL,
    item_id uuid NOT NULL,
    "position" integer NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    target_id uuid,
    trigger_mode text DEFAULT 'MANUAL'::text NOT NULL,
    expected_duration_ms bigint,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    safety_class text DEFAULT 'LOCAL_PROGRAM'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_rundown_cues_air_control_check CHECK (((kind <> ALL (ARRAY['MIC_SET_MUTED'::text, 'CROSSFADER_SET'::text, 'AIR_TAKE'::text, 'AIR_RETURN'::text])) OR (safety_class = 'AIR_CONTROL'::text))),
    CONSTRAINT studio_rundown_cues_expected_duration_ms_check CHECK (((expected_duration_ms IS NULL) OR ((expected_duration_ms >= 0) AND (expected_duration_ms <= 86400000)))),
    CONSTRAINT studio_rundown_cues_kind_check CHECK ((kind = ANY (ARRAY['NOTE'::text, 'TV_SCENE'::text, 'TV_CLIP'::text, 'TV_GRAPHIC'::text, 'RADIO_DECK'::text, 'RADIO_CART'::text, 'MIC_SET_MUTED'::text, 'CROSSFADER_SET'::text, 'AIR_TAKE'::text, 'AIR_RETURN'::text]))),
    CONSTRAINT studio_rundown_cues_label_check CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 240))),
    CONSTRAINT studio_rundown_cues_noop_check CHECK (((kind <> 'NOTE'::text) OR (safety_class = 'NOOP'::text))),
    CONSTRAINT studio_rundown_cues_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT studio_rundown_cues_position_check CHECK ((("position" >= 0) AND ("position" <= 99999))),
    CONSTRAINT studio_rundown_cues_safety_class_check CHECK ((safety_class = ANY (ARRAY['LOCAL_PROGRAM'::text, 'AIR_CONTROL'::text, 'NOOP'::text]))),
    CONSTRAINT studio_rundown_cues_trigger_mode_check CHECK ((trigger_mode = ANY (ARRAY['MANUAL'::text, 'AUTO_FOLLOW'::text]))),
    CONSTRAINT studio_rundown_cues_version_check CHECK ((version > 0))
);


--
-- Name: studio_rundown_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_rundown_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rundown_id uuid NOT NULL,
    "position" integer NOT NULL,
    page integer NOT NULL,
    slug text NOT NULL,
    segment_type text NOT NULL,
    planned_duration_ms bigint NOT NULL,
    timing_mode text DEFAULT 'FOLLOW'::text NOT NULL,
    hard_start_offset_ms bigint,
    editorial_status text DEFAULT 'DRAFT'::text NOT NULL,
    technical_status text DEFAULT 'UNCHECKED'::text NOT NULL,
    talent text DEFAULT ''::text NOT NULL,
    camera_source_note text DEFAULT ''::text NOT NULL,
    script text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_rundown_items_camera_source_note_check CHECK ((char_length(camera_source_note) <= 2000)),
    CONSTRAINT studio_rundown_items_editorial_status_check CHECK ((editorial_status = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'READY'::text, 'OMITTED'::text]))),
    CONSTRAINT studio_rundown_items_hard_start_offset_ms_check CHECK (((hard_start_offset_ms IS NULL) OR ((hard_start_offset_ms >= 0) AND (hard_start_offset_ms <= 604800000)))),
    CONSTRAINT studio_rundown_items_hard_timing_check CHECK ((((timing_mode = 'HARD'::text) AND (hard_start_offset_ms IS NOT NULL)) OR ((timing_mode <> 'HARD'::text) AND (hard_start_offset_ms IS NULL)))),
    CONSTRAINT studio_rundown_items_notes_check CHECK ((char_length(notes) <= 20000)),
    CONSTRAINT studio_rundown_items_page_check CHECK (((page >= 1) AND (page <= 99999))),
    CONSTRAINT studio_rundown_items_planned_duration_ms_check CHECK (((planned_duration_ms >= 0) AND (planned_duration_ms <= 86400000))),
    CONSTRAINT studio_rundown_items_position_check CHECK ((("position" >= 0) AND ("position" <= 99999))),
    CONSTRAINT studio_rundown_items_script_check CHECK ((char_length(script) <= 100000)),
    CONSTRAINT studio_rundown_items_segment_type_check CHECK ((segment_type = ANY (ARRAY['OPEN'::text, 'STORY'::text, 'INTERVIEW'::text, 'PACKAGE'::text, 'LIVE'::text, 'BREAK'::text, 'MUSIC'::text, 'CLOSE'::text, 'OTHER'::text]))),
    CONSTRAINT studio_rundown_items_slug_check CHECK ((((char_length(slug) >= 1) AND (char_length(slug) <= 120)) AND (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))),
    CONSTRAINT studio_rundown_items_talent_check CHECK ((char_length(talent) <= 1000)),
    CONSTRAINT studio_rundown_items_technical_status_check CHECK ((technical_status = ANY (ARRAY['UNCHECKED'::text, 'READY'::text, 'WARNING'::text, 'BLOCKED'::text]))),
    CONSTRAINT studio_rundown_items_timing_mode_check CHECK ((timing_mode = ANY (ARRAY['FOLLOW'::text, 'FLOAT'::text, 'HARD'::text]))),
    CONSTRAINT studio_rundown_items_version_check CHECK ((version > 0))
);


--
-- Name: studio_rundown_mutation_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_rundown_mutation_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rundown_id uuid NOT NULL,
    actor_user_id uuid,
    mutation_kind text NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    expected_draft_version integer NOT NULL,
    applied_draft_version integer NOT NULL,
    release_id uuid,
    response jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_rundown_mutation_receipts_applied_draft_version_check CHECK ((applied_draft_version > 0)),
    CONSTRAINT studio_rundown_mutation_receipts_expected_draft_version_check CHECK ((expected_draft_version > 0)),
    CONSTRAINT studio_rundown_mutation_receipts_mutation_kind_check CHECK ((mutation_kind = ANY (ARRAY['DRAFT'::text, 'RELEASE'::text, 'ACTIVATE_RELEASE'::text]))),
    CONSTRAINT studio_rundown_mutation_receipts_release_check CHECK ((((mutation_kind = 'DRAFT'::text) AND (release_id IS NULL)) OR ((mutation_kind = ANY (ARRAY['RELEASE'::text, 'ACTIVATE_RELEASE'::text])) AND (release_id IS NOT NULL)))),
    CONSTRAINT studio_rundown_mutation_receipts_request_hash_check CHECK ((request_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT studio_rundown_mutation_receipts_response_check CHECK ((jsonb_typeof(response) = 'object'::text))
);


--
-- Name: studio_rundown_release_cues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_rundown_release_cues (
    release_id uuid NOT NULL,
    source_item_id uuid NOT NULL,
    source_cue_id uuid NOT NULL,
    source_version integer NOT NULL,
    "position" integer NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    target_id uuid,
    trigger_mode text NOT NULL,
    expected_duration_ms bigint,
    payload jsonb NOT NULL,
    safety_class text NOT NULL,
    CONSTRAINT studio_rundown_release_cues_air_control_check CHECK (((kind <> ALL (ARRAY['MIC_SET_MUTED'::text, 'CROSSFADER_SET'::text, 'AIR_TAKE'::text, 'AIR_RETURN'::text])) OR (safety_class = 'AIR_CONTROL'::text))),
    CONSTRAINT studio_rundown_release_cues_expected_duration_ms_check CHECK (((expected_duration_ms IS NULL) OR ((expected_duration_ms >= 0) AND (expected_duration_ms <= 86400000)))),
    CONSTRAINT studio_rundown_release_cues_kind_check CHECK ((kind = ANY (ARRAY['NOTE'::text, 'TV_SCENE'::text, 'TV_CLIP'::text, 'TV_GRAPHIC'::text, 'RADIO_DECK'::text, 'RADIO_CART'::text, 'MIC_SET_MUTED'::text, 'CROSSFADER_SET'::text, 'AIR_TAKE'::text, 'AIR_RETURN'::text]))),
    CONSTRAINT studio_rundown_release_cues_label_check CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 240))),
    CONSTRAINT studio_rundown_release_cues_noop_check CHECK (((kind <> 'NOTE'::text) OR (safety_class = 'NOOP'::text))),
    CONSTRAINT studio_rundown_release_cues_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT studio_rundown_release_cues_position_check CHECK ((("position" >= 0) AND ("position" <= 99999))),
    CONSTRAINT studio_rundown_release_cues_safety_class_check CHECK ((safety_class = ANY (ARRAY['LOCAL_PROGRAM'::text, 'AIR_CONTROL'::text, 'NOOP'::text]))),
    CONSTRAINT studio_rundown_release_cues_source_version_check CHECK ((source_version > 0)),
    CONSTRAINT studio_rundown_release_cues_trigger_mode_check CHECK ((trigger_mode = ANY (ARRAY['MANUAL'::text, 'AUTO_FOLLOW'::text])))
);


--
-- Name: studio_rundown_release_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_rundown_release_items (
    release_id uuid NOT NULL,
    source_item_id uuid NOT NULL,
    source_version integer NOT NULL,
    "position" integer NOT NULL,
    page integer NOT NULL,
    slug text NOT NULL,
    segment_type text NOT NULL,
    planned_duration_ms bigint NOT NULL,
    timing_mode text NOT NULL,
    hard_start_offset_ms bigint,
    editorial_status text NOT NULL,
    technical_status text NOT NULL,
    talent text NOT NULL,
    camera_source_note text NOT NULL,
    script text NOT NULL,
    notes text NOT NULL,
    CONSTRAINT studio_rundown_release_items_camera_source_note_check CHECK ((char_length(camera_source_note) <= 2000)),
    CONSTRAINT studio_rundown_release_items_editorial_status_check CHECK ((editorial_status = ANY (ARRAY['DRAFT'::text, 'REVIEW'::text, 'READY'::text, 'OMITTED'::text]))),
    CONSTRAINT studio_rundown_release_items_hard_start_offset_ms_check CHECK (((hard_start_offset_ms IS NULL) OR ((hard_start_offset_ms >= 0) AND (hard_start_offset_ms <= 604800000)))),
    CONSTRAINT studio_rundown_release_items_hard_timing_check CHECK ((((timing_mode = 'HARD'::text) AND (hard_start_offset_ms IS NOT NULL)) OR ((timing_mode <> 'HARD'::text) AND (hard_start_offset_ms IS NULL)))),
    CONSTRAINT studio_rundown_release_items_notes_check CHECK ((char_length(notes) <= 20000)),
    CONSTRAINT studio_rundown_release_items_page_check CHECK (((page >= 1) AND (page <= 99999))),
    CONSTRAINT studio_rundown_release_items_planned_duration_ms_check CHECK (((planned_duration_ms >= 0) AND (planned_duration_ms <= 86400000))),
    CONSTRAINT studio_rundown_release_items_position_check CHECK ((("position" >= 0) AND ("position" <= 99999))),
    CONSTRAINT studio_rundown_release_items_script_check CHECK ((char_length(script) <= 100000)),
    CONSTRAINT studio_rundown_release_items_segment_type_check CHECK ((segment_type = ANY (ARRAY['OPEN'::text, 'STORY'::text, 'INTERVIEW'::text, 'PACKAGE'::text, 'LIVE'::text, 'BREAK'::text, 'MUSIC'::text, 'CLOSE'::text, 'OTHER'::text]))),
    CONSTRAINT studio_rundown_release_items_slug_check CHECK ((((char_length(slug) >= 1) AND (char_length(slug) <= 120)) AND (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))),
    CONSTRAINT studio_rundown_release_items_source_version_check CHECK ((source_version > 0)),
    CONSTRAINT studio_rundown_release_items_talent_check CHECK ((char_length(talent) <= 1000)),
    CONSTRAINT studio_rundown_release_items_technical_status_check CHECK ((technical_status = ANY (ARRAY['UNCHECKED'::text, 'READY'::text, 'WARNING'::text, 'BLOCKED'::text]))),
    CONSTRAINT studio_rundown_release_items_timing_mode_check CHECK ((timing_mode = ANY (ARRAY['FOLLOW'::text, 'FLOAT'::text, 'HARD'::text])))
);


--
-- Name: studio_rundown_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_rundown_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rundown_id uuid NOT NULL,
    release_number integer NOT NULL,
    source_draft_version integer NOT NULL,
    canonical_hash text NOT NULL,
    schema_version integer NOT NULL,
    compiler_version text NOT NULL,
    idempotency_key uuid NOT NULL,
    published_by_user_id uuid NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_rundown_releases_canonical_hash_check CHECK ((canonical_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT studio_rundown_releases_compiler_version_check CHECK (((char_length(btrim(compiler_version)) >= 1) AND (char_length(btrim(compiler_version)) <= 80))),
    CONSTRAINT studio_rundown_releases_release_number_check CHECK (((release_number >= 1) AND (release_number <= 1000000000))),
    CONSTRAINT studio_rundown_releases_schema_version_check CHECK ((schema_version > 0)),
    CONSTRAINT studio_rundown_releases_source_draft_version_check CHECK ((source_draft_version > 0))
);


--
-- Name: studio_rundowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_rundowns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    draft_version integer DEFAULT 1 NOT NULL,
    lifecycle text DEFAULT 'DRAFT'::text NOT NULL,
    active_release_id uuid,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_rundowns_description_check CHECK ((char_length(description) <= 4000)),
    CONSTRAINT studio_rundowns_draft_version_check CHECK ((draft_version > 0)),
    CONSTRAINT studio_rundowns_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'ARCHIVED'::text]))),
    CONSTRAINT studio_rundowns_lifecycle_release_check CHECK (((lifecycle <> 'ACTIVE'::text) OR (active_release_id IS NOT NULL))),
    CONSTRAINT studio_rundowns_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120)))
);


--
-- Name: studio_station_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_station_settings (
    station_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    readiness text DEFAULT 'WORKSPACE'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_station_settings_readiness_check CHECK ((readiness = ANY (ARRAY['WORKSPACE'::text, 'PREPARING'::text, 'LIVE_READY'::text, 'ERROR'::text]))),
    CONSTRAINT studio_station_settings_version_check CHECK ((version > 0))
);


--
-- Name: tv_channel_delivery_descriptors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_channel_delivery_descriptors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile text NOT NULL,
    master_playlist_object_key text NOT NULL,
    master_playlist_checksum_sha256 text NOT NULL,
    duration_ms bigint NOT NULL,
    segment_duration_ms integer DEFAULT 2000 NOT NULL,
    segment_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tv_channel_delivery_descript_master_playlist_checksum_sha_check CHECK ((master_playlist_checksum_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tv_channel_delivery_descriptor_master_playlist_object_key_check CHECK (((char_length(master_playlist_object_key) >= 1) AND (char_length(master_playlist_object_key) <= 1024))),
    CONSTRAINT tv_channel_delivery_descriptors_duration_ms_check CHECK ((duration_ms > 0)),
    CONSTRAINT tv_channel_delivery_descriptors_profile_check CHECK ((profile = 'tv-channel-v1'::text)),
    CONSTRAINT tv_channel_delivery_descriptors_segment_count_check CHECK ((segment_count > 0)),
    CONSTRAINT tv_channel_delivery_descriptors_segment_duration_ms_check CHECK ((segment_duration_ms = 2000))
);


--
-- Name: tv_channel_delivery_renditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_channel_delivery_renditions (
    descriptor_id uuid NOT NULL,
    rendition text NOT NULL,
    playlist_object_key text NOT NULL,
    playlist_checksum_sha256 text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    frame_rate integer DEFAULT 30 NOT NULL,
    video_codec text DEFAULT 'h264'::text NOT NULL,
    video_profile text DEFAULT 'Main'::text NOT NULL,
    video_level text DEFAULT '3.1'::text NOT NULL,
    pixel_format text DEFAULT 'yuv420p'::text NOT NULL,
    color_primaries text DEFAULT 'bt709'::text NOT NULL,
    color_transfer text DEFAULT 'bt709'::text NOT NULL,
    color_space text DEFAULT 'bt709'::text NOT NULL,
    video_bitrate_bps integer NOT NULL,
    vbv_minrate_bps integer NOT NULL,
    vbv_maxrate_bps integer NOT NULL,
    vbv_bufsize_bps integer NOT NULL,
    gop_frames integer DEFAULT 60 NOT NULL,
    b_frames integer DEFAULT 0 NOT NULL,
    audio_codec text DEFAULT 'aac'::text NOT NULL,
    audio_profile text DEFAULT 'LC'::text NOT NULL,
    audio_bitrate_bps integer DEFAULT 128000 NOT NULL,
    audio_sample_rate_hz integer DEFAULT 48000 NOT NULL,
    audio_channels integer DEFAULT 2 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tv_channel_delivery_renditions_audio_bitrate_bps_check CHECK ((audio_bitrate_bps = 128000)),
    CONSTRAINT tv_channel_delivery_renditions_audio_channels_check CHECK ((audio_channels = 2)),
    CONSTRAINT tv_channel_delivery_renditions_audio_codec_check CHECK ((audio_codec = 'aac'::text)),
    CONSTRAINT tv_channel_delivery_renditions_audio_profile_check CHECK ((audio_profile = 'LC'::text)),
    CONSTRAINT tv_channel_delivery_renditions_audio_sample_rate_hz_check CHECK ((audio_sample_rate_hz = 48000)),
    CONSTRAINT tv_channel_delivery_renditions_b_frames_check CHECK ((b_frames = 0)),
    CONSTRAINT tv_channel_delivery_renditions_color_primaries_check CHECK ((color_primaries = 'bt709'::text)),
    CONSTRAINT tv_channel_delivery_renditions_color_space_check CHECK ((color_space = 'bt709'::text)),
    CONSTRAINT tv_channel_delivery_renditions_color_transfer_check CHECK ((color_transfer = 'bt709'::text)),
    CONSTRAINT tv_channel_delivery_renditions_contract_check CHECK ((((rendition = '720p'::text) AND (width = 1280) AND (height = 720) AND (video_bitrate_bps = 2500000) AND (vbv_minrate_bps = 2500000) AND (vbv_maxrate_bps = 2500000) AND (vbv_bufsize_bps = 5000000)) OR ((rendition = '360p'::text) AND (width = 640) AND (height = 360) AND (video_bitrate_bps = 800000) AND (vbv_minrate_bps = 800000) AND (vbv_maxrate_bps = 800000) AND (vbv_bufsize_bps = 1600000)))),
    CONSTRAINT tv_channel_delivery_renditions_frame_rate_check CHECK ((frame_rate = 30)),
    CONSTRAINT tv_channel_delivery_renditions_gop_frames_check CHECK ((gop_frames = 60)),
    CONSTRAINT tv_channel_delivery_renditions_pixel_format_check CHECK ((pixel_format = 'yuv420p'::text)),
    CONSTRAINT tv_channel_delivery_renditions_playlist_checksum_sha256_check CHECK ((playlist_checksum_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tv_channel_delivery_renditions_playlist_object_key_check CHECK (((char_length(playlist_object_key) >= 1) AND (char_length(playlist_object_key) <= 1024))),
    CONSTRAINT tv_channel_delivery_renditions_rendition_check CHECK ((rendition = ANY (ARRAY['720p'::text, '360p'::text]))),
    CONSTRAINT tv_channel_delivery_renditions_video_codec_check CHECK ((video_codec = 'h264'::text)),
    CONSTRAINT tv_channel_delivery_renditions_video_level_check CHECK ((video_level = '3.1'::text)),
    CONSTRAINT tv_channel_delivery_renditions_video_profile_check CHECK ((video_profile = 'Main'::text))
);


--
-- Name: tv_channel_delivery_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_channel_delivery_segments (
    descriptor_id uuid NOT NULL,
    rendition text NOT NULL,
    segment_index integer NOT NULL,
    start_offset_ms bigint NOT NULL,
    duration_ms integer NOT NULL,
    object_key text NOT NULL,
    size_bytes bigint NOT NULL,
    checksum_sha256 text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tv_channel_delivery_segments_alignment_check CHECK ((start_offset_ms = ((segment_index)::bigint * 2000))),
    CONSTRAINT tv_channel_delivery_segments_checksum_sha256_check CHECK ((checksum_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tv_channel_delivery_segments_duration_ms_check CHECK (((duration_ms >= 1) AND (duration_ms <= 2000))),
    CONSTRAINT tv_channel_delivery_segments_object_key_check CHECK (((char_length(object_key) >= 1) AND (char_length(object_key) <= 1024))),
    CONSTRAINT tv_channel_delivery_segments_segment_index_check CHECK ((segment_index >= 0)),
    CONSTRAINT tv_channel_delivery_segments_size_bytes_check CHECK ((size_bytes > 0)),
    CONSTRAINT tv_channel_delivery_segments_start_offset_ms_check CHECK ((start_offset_ms >= 0))
);


--
-- Name: tv_channel_derivatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_channel_derivatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    descriptor_id uuid NOT NULL,
    media_asset_id uuid NOT NULL,
    source_media_asset_variant_id uuid NOT NULL,
    media_asset_variant_id uuid NOT NULL,
    profile text DEFAULT 'tv-channel-v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tv_channel_derivatives_profile_check CHECK ((profile = 'tv-channel-v1'::text))
);


--
-- Name: tv_channel_transition_fillers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_channel_transition_fillers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    descriptor_id uuid NOT NULL,
    profile text DEFAULT 'tv-channel-v1'::text NOT NULL,
    transition_ms integer NOT NULL,
    generation integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tv_channel_transition_fillers_generation_check CHECK ((generation > 0)),
    CONSTRAINT tv_channel_transition_fillers_profile_check CHECK ((profile = 'tv-channel-v1'::text)),
    CONSTRAINT tv_channel_transition_fillers_transition_ms_check CHECK (((transition_ms >= 1) AND (transition_ms <= 10000)))
);


--
-- Name: tv_playout_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_playout_leases (
    station_id uuid NOT NULL,
    holder_id uuid NOT NULL,
    fence bigint NOT NULL,
    lease_until timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tv_playout_leases_fence_check CHECK ((fence > 0))
);


--
-- Name: tv_playout_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_playout_state (
    station_id uuid NOT NULL,
    observed_source text DEFAULT 'AUTOMATION'::text NOT NULL,
    lease_fence bigint NOT NULL,
    source_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_fallback_code text,
    last_fallback_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_id uuid,
    calendar_release_id uuid,
    source_role public.calendar_source_role,
    CONSTRAINT tv_playout_state_calendar_occurrence_release_shape_check CHECK (((occurrence_id IS NULL) OR (calendar_release_id IS NOT NULL))),
    CONSTRAINT tv_playout_state_calendar_provenance_check CHECK (((source_role IS NULL) OR ((calendar_release_id IS NOT NULL) AND (((source_role = 'BASELINE'::public.calendar_source_role) AND (occurrence_id IS NULL)) OR ((source_role = ANY (ARRAY['PRIMARY'::public.calendar_source_role, 'FALLBACK'::public.calendar_source_role])) AND (occurrence_id IS NOT NULL)))))),
    CONSTRAINT tv_playout_state_last_fallback_code_check CHECK (((last_fallback_code IS NULL) OR (char_length(last_fallback_code) <= 80))),
    CONSTRAINT tv_playout_state_lease_fence_check CHECK ((lease_fence > 0)),
    CONSTRAINT tv_playout_state_observed_source_check CHECK ((observed_source = 'AUTOMATION'::text))
);


--
-- Name: tv_schedule_item_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_schedule_item_delivery (
    schedule_item_id uuid NOT NULL,
    derivative_id uuid NOT NULL,
    transition_filler_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tv_segment_journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tv_segment_journal (
    station_id uuid NOT NULL,
    media_sequence bigint NOT NULL,
    discontinuity_sequence bigint NOT NULL,
    discontinuity boolean DEFAULT false NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    duration_ms integer NOT NULL,
    playout_fence bigint NOT NULL,
    source_kind public.tv_segment_source_kind DEFAULT 'AUTOMATION'::public.tv_segment_source_kind NOT NULL,
    automation_schedule_id uuid,
    automation_schedule_item_id uuid,
    automation_derivative_id uuid,
    automation_transition_filler_id uuid,
    automation_part public.tv_automation_segment_part,
    descriptor_id uuid,
    descriptor_segment_index integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_id uuid,
    calendar_release_id uuid,
    calendar_source_role public.calendar_source_role,
    automation_epoch_at timestamp with time zone,
    CONSTRAINT tv_segment_journal_calendar_provenance_check CHECK (((calendar_source_role IS NULL) OR ((calendar_release_id IS NOT NULL) AND (((calendar_source_role = 'BASELINE'::public.calendar_source_role) AND (occurrence_id IS NULL)) OR ((calendar_source_role = ANY (ARRAY['PRIMARY'::public.calendar_source_role, 'FALLBACK'::public.calendar_source_role])) AND (occurrence_id IS NOT NULL))) AND ((source_kind <> 'AUTOMATION'::public.tv_segment_source_kind) OR (automation_epoch_at IS NOT NULL))))),
    CONSTRAINT tv_segment_journal_descriptor_segment_index_check CHECK (((descriptor_segment_index IS NULL) OR (descriptor_segment_index >= 0))),
    CONSTRAINT tv_segment_journal_discontinuity_sequence_check CHECK ((discontinuity_sequence >= 0)),
    CONSTRAINT tv_segment_journal_duration_ms_check CHECK (((duration_ms >= 1) AND (duration_ms <= 2000))),
    CONSTRAINT tv_segment_journal_half_open_check CHECK ((ends_at = (starts_at + ((duration_ms)::double precision * '00:00:00.001'::interval)))),
    CONSTRAINT tv_segment_journal_media_sequence_check CHECK ((media_sequence >= 0)),
    CONSTRAINT tv_segment_journal_playout_fence_check CHECK ((playout_fence > 0))
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_user_id uuid NOT NULL,
    blocked_user_id uuid,
    blocked_guest_id uuid,
    snapshot_display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_blocks_exactly_one_target_check CHECK ((num_nonnulls(blocked_user_id, blocked_guest_id) = 1)),
    CONSTRAINT user_blocks_no_self_check CHECK (((blocked_user_id IS NULL) OR (blocked_user_id <> blocker_user_id))),
    CONSTRAINT user_blocks_snapshot_display_name_check CHECK (((char_length(btrim(snapshot_display_name)) >= 1) AND (char_length(btrim(snapshot_display_name)) <= 80)))
);


--
-- Name: weather_playback_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_playback_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tune_id uuid NOT NULL,
    token_hash text NOT NULL,
    user_id uuid NOT NULL,
    station_id uuid NOT NULL,
    zip_code text NOT NULL,
    feed_key text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT weather_playback_sessions_feed_key_check CHECK (((char_length(feed_key) >= 1) AND (char_length(feed_key) <= 512))),
    CONSTRAINT weather_playback_sessions_zip_code_check CHECK ((zip_code ~ '^[0-9]{5}$'::text))
);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: calendar_draft_events calendar_draft_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_draft_events calendar_draft_events_station_id_profile_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_events_station_id_profile_id_id_key UNIQUE (station_id, profile_id, id);


--
-- Name: calendar_draft_exceptions calendar_draft_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_exceptions
    ADD CONSTRAINT calendar_draft_exceptions_pkey PRIMARY KEY (id);


--
-- Name: calendar_draft_exceptions calendar_draft_exceptions_station_id_profile_id_event_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_exceptions
    ADD CONSTRAINT calendar_draft_exceptions_station_id_profile_id_event_id_id_key UNIQUE (station_id, profile_id, event_id, id);


--
-- Name: calendar_draft_exceptions calendar_draft_exceptions_station_id_profile_id_event_id_re_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_exceptions
    ADD CONSTRAINT calendar_draft_exceptions_station_id_profile_id_event_id_re_key UNIQUE (station_id, profile_id, event_id, recurrence_key);


--
-- Name: calendar_occurrences calendar_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_occurrences
    ADD CONSTRAINT calendar_occurrences_pkey PRIMARY KEY (id);


--
-- Name: calendar_occurrences calendar_occurrences_release_event_id_recurrence_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_occurrences
    ADD CONSTRAINT calendar_occurrences_release_event_id_recurrence_key_key UNIQUE (release_event_id, recurrence_key);


--
-- Name: calendar_occurrences calendar_occurrences_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_occurrences
    ADD CONSTRAINT calendar_occurrences_station_id_id_key UNIQUE (station_id, id);


--
-- Name: calendar_occurrences calendar_occurrences_station_id_release_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_occurrences
    ADD CONSTRAINT calendar_occurrences_station_id_release_id_id_key UNIQUE (station_id, release_id, id);


--
-- Name: calendar_profile_drafts calendar_profile_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_profile_drafts
    ADD CONSTRAINT calendar_profile_drafts_pkey PRIMARY KEY (profile_id);


--
-- Name: calendar_profile_drafts calendar_profile_drafts_station_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_profile_drafts
    ADD CONSTRAINT calendar_profile_drafts_station_id_profile_id_key UNIQUE (station_id, profile_id);


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_ite_occurrence_id_source_role_pos_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_ite_occurrence_id_source_role_pos_key UNIQUE (occurrence_id, source_role, "position");


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_ite_occurrence_id_source_role_sta_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_ite_occurrence_id_source_role_sta_key UNIQUE (occurrence_id, source_role, starts_at);


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_ite_station_id_release_id_occurre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_ite_station_id_release_id_occurre_key UNIQUE (station_id, release_id, occurrence_id, id);


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_items_pkey PRIMARY KEY (id);


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_items_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_items_station_id_id_key UNIQUE (station_id, id);


--
-- Name: calendar_release_events calendar_release_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_release_events calendar_release_events_release_id_source_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_events_release_id_source_event_id_key UNIQUE (release_id, source_event_id);


--
-- Name: calendar_release_events calendar_release_events_station_id_profile_id_release_id_i_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_events_station_id_profile_id_release_id_i_key1 UNIQUE (station_id, profile_id, release_id, id, event_kind);


--
-- Name: calendar_release_events calendar_release_events_station_id_profile_id_release_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_events_station_id_profile_id_release_id_id_key UNIQUE (station_id, profile_id, release_id, id);


--
-- Name: calendar_release_events calendar_release_events_station_id_release_id_id_event_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_events_station_id_release_id_id_event_kind_key UNIQUE (station_id, release_id, id, event_kind);


--
-- Name: calendar_release_events calendar_release_events_station_id_release_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_events_station_id_release_id_id_key UNIQUE (station_id, release_id, id);


--
-- Name: calendar_release_exceptions calendar_release_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_exceptions
    ADD CONSTRAINT calendar_release_exceptions_pkey PRIMARY KEY (id);


--
-- Name: calendar_release_exceptions calendar_release_exceptions_release_id_source_exception_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_exceptions
    ADD CONSTRAINT calendar_release_exceptions_release_id_source_exception_id_key UNIQUE (release_id, source_exception_id);


--
-- Name: calendar_release_exceptions calendar_release_exceptions_station_id_profile_id_release__key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_exceptions
    ADD CONSTRAINT calendar_release_exceptions_station_id_profile_id_release__key1 UNIQUE (station_id, profile_id, release_id, release_event_id, id, exception_kind);


--
-- Name: calendar_release_exceptions calendar_release_exceptions_station_id_profile_id_release_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_exceptions
    ADD CONSTRAINT calendar_release_exceptions_station_id_profile_id_release_i_key UNIQUE (station_id, profile_id, release_id, release_event_id, id);


--
-- Name: calendar_release_exceptions calendar_release_exceptions_station_id_release_id_release__key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_exceptions
    ADD CONSTRAINT calendar_release_exceptions_station_id_release_id_release__key1 UNIQUE (station_id, release_id, release_event_id, id);


--
-- Name: calendar_release_exceptions calendar_release_exceptions_station_id_release_id_release_e_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_exceptions
    ADD CONSTRAINT calendar_release_exceptions_station_id_release_id_release_e_key UNIQUE (station_id, release_id, release_event_id, recurrence_key);


--
-- Name: calendar_release_materialization_state calendar_release_materialization_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_materialization_state
    ADD CONSTRAINT calendar_release_materialization_state_pkey PRIMARY KEY (release_id);


--
-- Name: calendar_releases calendar_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_pkey PRIMARY KEY (id);


--
-- Name: calendar_releases calendar_releases_profile_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_profile_id_idempotency_key_key UNIQUE (profile_id, idempotency_key);


--
-- Name: calendar_releases calendar_releases_profile_id_release_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_profile_id_release_number_key UNIQUE (profile_id, release_number);


--
-- Name: calendar_releases calendar_releases_profile_id_source_draft_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_profile_id_source_draft_version_key UNIQUE (profile_id, source_draft_version);


--
-- Name: calendar_releases calendar_releases_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_station_id_id_key UNIQUE (station_id, id);


--
-- Name: calendar_releases calendar_releases_station_id_profile_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_station_id_profile_id_id_key UNIQUE (station_id, profile_id, id);


--
-- Name: calendar_runtime_state calendar_runtime_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_state
    ADD CONSTRAINT calendar_runtime_state_pkey PRIMARY KEY (station_id);


--
-- Name: calendar_runtime_transitions calendar_runtime_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_transitions
    ADD CONSTRAINT calendar_runtime_transitions_pkey PRIMARY KEY (id);


--
-- Name: calendar_runtime_transitions calendar_runtime_transitions_station_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_transitions
    ADD CONSTRAINT calendar_runtime_transitions_station_id_sequence_key UNIQUE (station_id, sequence);


--
-- Name: chat_guests chat_guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_guests
    ADD CONSTRAINT chat_guests_pkey PRIMARY KEY (id);


--
-- Name: chat_guests chat_guests_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_guests
    ADD CONSTRAINT chat_guests_token_hash_key UNIQUE (token_hash);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: clock_draft_blocks clock_draft_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_draft_blocks
    ADD CONSTRAINT clock_draft_blocks_pkey PRIMARY KEY (id);


--
-- Name: clock_draft_blocks clock_draft_blocks_station_id_start_minute_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_draft_blocks
    ADD CONSTRAINT clock_draft_blocks_station_id_start_minute_key UNIQUE (station_id, start_minute);


--
-- Name: clock_release_blocks clock_release_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_blocks
    ADD CONSTRAINT clock_release_blocks_pkey PRIMARY KEY (id);


--
-- Name: clock_release_blocks clock_release_blocks_release_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_blocks
    ADD CONSTRAINT clock_release_blocks_release_id_position_key UNIQUE (release_id, "position");


--
-- Name: clock_release_blocks clock_release_blocks_release_id_start_minute_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_blocks
    ADD CONSTRAINT clock_release_blocks_release_id_start_minute_key UNIQUE (release_id, start_minute);


--
-- Name: clock_release_items clock_release_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_items
    ADD CONSTRAINT clock_release_items_pkey PRIMARY KEY (id);


--
-- Name: clock_release_items clock_release_items_release_block_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_items
    ADD CONSTRAINT clock_release_items_release_block_id_position_key UNIQUE (release_block_id, "position");


--
-- Name: clock_releases clock_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_releases
    ADD CONSTRAINT clock_releases_pkey PRIMARY KEY (id);


--
-- Name: clock_releases clock_releases_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_releases
    ADD CONSTRAINT clock_releases_station_id_id_key UNIQUE (station_id, id);


--
-- Name: clock_releases clock_releases_station_id_release_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_releases
    ADD CONSTRAINT clock_releases_station_id_release_number_key UNIQUE (station_id, release_number);


--
-- Name: clock_timeline_items clock_timeline_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_timeline_items
    ADD CONSTRAINT clock_timeline_items_pkey PRIMARY KEY (id);


--
-- Name: clock_timeline_items clock_timeline_items_release_id_service_week_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_timeline_items
    ADD CONSTRAINT clock_timeline_items_release_id_service_week_position_key UNIQUE (release_id, service_week, "position");


--
-- Name: content_reports content_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);


--
-- Name: content_reports content_reports_reference_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reference_code_key UNIQUE (reference_code);


--
-- Name: device_authorizations device_authorizations_device_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_authorizations
    ADD CONSTRAINT device_authorizations_device_code_hash_key UNIQUE (device_code_hash);


--
-- Name: device_authorizations device_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_authorizations
    ADD CONSTRAINT device_authorizations_pkey PRIMARY KEY (id);


--
-- Name: device_authorizations device_authorizations_user_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_authorizations
    ADD CONSTRAINT device_authorizations_user_code_hash_key UNIQUE (user_code_hash);


--
-- Name: device_sessions device_sessions_authorization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_sessions
    ADD CONSTRAINT device_sessions_authorization_id_key UNIQUE (authorization_id);


--
-- Name: device_sessions device_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_sessions
    ADD CONSTRAINT device_sessions_pkey PRIMARY KEY (id);


--
-- Name: device_sessions device_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_sessions
    ADD CONSTRAINT device_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: media_asset_provenance media_asset_provenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_provenance
    ADD CONSTRAINT media_asset_provenance_pkey PRIMARY KEY (id);


--
-- Name: media_asset_variants media_asset_variants_media_asset_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_variants
    ADD CONSTRAINT media_asset_variants_media_asset_id_id_key UNIQUE (media_asset_id, id);


--
-- Name: media_asset_variants media_asset_variants_media_asset_id_role_generation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_variants
    ADD CONSTRAINT media_asset_variants_media_asset_id_role_generation_key UNIQUE (media_asset_id, role, generation);


--
-- Name: media_asset_variants media_asset_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_variants
    ADD CONSTRAINT media_asset_variants_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_owner_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_owner_id_id_key UNIQUE (owner_id, id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: media_gc_holds media_gc_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_holds
    ADD CONSTRAINT media_gc_holds_pkey PRIMARY KEY (id);


--
-- Name: media_gc_tasks media_gc_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_tasks
    ADD CONSTRAINT media_gc_tasks_pkey PRIMARY KEY (id);


--
-- Name: media_gc_tasks media_gc_tasks_storage_authority_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_tasks
    ADD CONSTRAINT media_gc_tasks_storage_authority_object_key_key UNIQUE (storage_authority, object_key);


--
-- Name: media_processing_jobs media_processing_jobs_media_asset_id_job_type_idempotency_k_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_processing_jobs
    ADD CONSTRAINT media_processing_jobs_media_asset_id_job_type_idempotency_k_key UNIQUE (media_asset_id, job_type, idempotency_key);


--
-- Name: media_processing_jobs media_processing_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_processing_jobs
    ADD CONSTRAINT media_processing_jobs_pkey PRIMARY KEY (id);


--
-- Name: media_rights_attestations media_rights_attestations_media_asset_id_attestation_versio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_rights_attestations
    ADD CONSTRAINT media_rights_attestations_media_asset_id_attestation_versio_key UNIQUE (media_asset_id, attestation_version);


--
-- Name: media_rights_attestations media_rights_attestations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_rights_attestations
    ADD CONSTRAINT media_rights_attestations_pkey PRIMARY KEY (id);


--
-- Name: media_upload_parts media_upload_parts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_parts
    ADD CONSTRAINT media_upload_parts_pkey PRIMARY KEY (id);


--
-- Name: media_upload_parts media_upload_parts_upload_session_id_part_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_parts
    ADD CONSTRAINT media_upload_parts_upload_session_id_part_number_key UNIQUE (upload_session_id, part_number);


--
-- Name: media_upload_sessions media_upload_sessions_media_asset_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_media_asset_id_idempotency_key_key UNIQUE (media_asset_id, idempotency_key);


--
-- Name: media_upload_sessions media_upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: mobile_refresh_tokens mobile_refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_refresh_tokens
    ADD CONSTRAINT mobile_refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: mobile_refresh_tokens mobile_refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_refresh_tokens
    ADD CONSTRAINT mobile_refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: moderation_audit_log moderation_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_audit_log
    ADD CONSTRAINT moderation_audit_log_pkey PRIMARY KEY (id);


--
-- Name: moderation_service_tokens moderation_service_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_service_tokens
    ADD CONSTRAINT moderation_service_tokens_pkey PRIMARY KEY (id);


--
-- Name: moderation_service_tokens moderation_service_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_service_tokens
    ADD CONSTRAINT moderation_service_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: playlist_items playlist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_items
    ADD CONSTRAINT playlist_items_pkey PRIMARY KEY (id);


--
-- Name: playlist_items playlist_items_station_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_items
    ADD CONSTRAINT playlist_items_station_id_position_key UNIQUE (station_id, "position");


--
-- Name: radio_playout_leases radio_playout_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_leases
    ADD CONSTRAINT radio_playout_leases_pkey PRIMARY KEY (station_id);


--
-- Name: radio_playout_sessions radio_playout_sessions_object_prefix_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_sessions
    ADD CONSTRAINT radio_playout_sessions_object_prefix_key UNIQUE (object_prefix);


--
-- Name: radio_playout_sessions radio_playout_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_sessions
    ADD CONSTRAINT radio_playout_sessions_pkey PRIMARY KEY (id);


--
-- Name: radio_playout_sessions radio_playout_sessions_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_sessions
    ADD CONSTRAINT radio_playout_sessions_station_id_id_key UNIQUE (station_id, id);


--
-- Name: radio_playout_state radio_playout_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_pkey PRIMARY KEY (station_id);


--
-- Name: radio_release_item_delivery radio_release_item_delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_release_item_delivery
    ADD CONSTRAINT radio_release_item_delivery_pkey PRIMARY KEY (release_item_id);


--
-- Name: radio_rotation_items radio_rotation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_rotation_items
    ADD CONSTRAINT radio_rotation_items_pkey PRIMARY KEY (id);


--
-- Name: radio_rotation_items radio_rotation_items_rotation_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_rotation_items
    ADD CONSTRAINT radio_rotation_items_rotation_id_position_key UNIQUE (rotation_id, "position");


--
-- Name: radio_rotations radio_rotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_rotations
    ADD CONSTRAINT radio_rotations_pkey PRIMARY KEY (id);


--
-- Name: radio_rotations radio_rotations_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_rotations
    ADD CONSTRAINT radio_rotations_station_id_id_key UNIQUE (station_id, id);


--
-- Name: radio_timeline_delivery radio_timeline_delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_timeline_delivery
    ADD CONSTRAINT radio_timeline_delivery_pkey PRIMARY KEY (timeline_item_id);


--
-- Name: radio_timeline_delivery radio_timeline_delivery_release_id_media_sequence_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_timeline_delivery
    ADD CONSTRAINT radio_timeline_delivery_release_id_media_sequence_start_key UNIQUE (release_id, media_sequence_start);


--
-- Name: radio_tracks radio_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_tracks
    ADD CONSTRAINT radio_tracks_pkey PRIMARY KEY (id);


--
-- Name: radio_tracks radio_tracks_station_id_upload_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_tracks
    ADD CONSTRAINT radio_tracks_station_id_upload_request_id_key UNIQUE (station_id, upload_request_id);


--
-- Name: radio_visual_settings radio_visual_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_visual_settings
    ADD CONSTRAINT radio_visual_settings_pkey PRIMARY KEY (station_id);


--
-- Name: schedule_items schedule_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_items
    ADD CONSTRAINT schedule_items_pkey PRIMARY KEY (id);


--
-- Name: schedule_items schedule_items_schedule_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_items
    ADD CONSTRAINT schedule_items_schedule_id_position_key UNIQUE (schedule_id, "position");


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: station_fans station_fans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_fans
    ADD CONSTRAINT station_fans_pkey PRIMARY KEY (user_id, station_id);


--
-- Name: station_genres station_genres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_genres
    ADD CONSTRAINT station_genres_pkey PRIMARY KEY (id);


--
-- Name: station_genres station_genres_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_genres
    ADD CONSTRAINT station_genres_slug_key UNIQUE (slug);


--
-- Name: station_media_allocations station_media_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_media_allocations
    ADD CONSTRAINT station_media_allocations_pkey PRIMARY KEY (station_id, media_asset_id);


--
-- Name: station_operation_audit station_operation_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_operation_audit
    ADD CONSTRAINT station_operation_audit_pkey PRIMARY KEY (id);


--
-- Name: station_programming_profiles station_programming_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_programming_profiles
    ADD CONSTRAINT station_programming_profiles_pkey PRIMARY KEY (id);


--
-- Name: station_programming_profiles station_programming_profiles_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_programming_profiles
    ADD CONSTRAINT station_programming_profiles_station_id_id_key UNIQUE (station_id, id);


--
-- Name: station_ratings station_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_ratings
    ADD CONSTRAINT station_ratings_pkey PRIMARY KEY (user_id, station_id);


--
-- Name: station_room_access station_room_access_code_lookup_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_access
    ADD CONSTRAINT station_room_access_code_lookup_hash_key UNIQUE (code_lookup_hash);


--
-- Name: station_room_access station_room_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_access
    ADD CONSTRAINT station_room_access_pkey PRIMARY KEY (station_id);


--
-- Name: station_room_access station_room_access_station_id_generation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_access
    ADD CONSTRAINT station_room_access_station_id_generation_key UNIQUE (station_id, generation);


--
-- Name: station_room_memberships station_room_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_memberships
    ADD CONSTRAINT station_room_memberships_pkey PRIMARY KEY (station_id, user_id);


--
-- Name: station_room_sessions station_room_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_sessions
    ADD CONSTRAINT station_room_sessions_pkey PRIMARY KEY (id);


--
-- Name: station_room_sessions station_room_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_sessions
    ADD CONSTRAINT station_room_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: station_tunes station_tunes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_tunes
    ADD CONSTRAINT station_tunes_pkey PRIMARY KEY (id);


--
-- Name: stations stations_access_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_access_token_hash_key UNIQUE (access_token_hash);


--
-- Name: stations stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_pkey PRIMARY KEY (id);


--
-- Name: studio_asset_clips studio_asset_clips_child_media_asset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_asset_clips
    ADD CONSTRAINT studio_asset_clips_child_media_asset_id_key UNIQUE (child_media_asset_id);


--
-- Name: studio_asset_clips studio_asset_clips_owner_id_clip_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_asset_clips
    ADD CONSTRAINT studio_asset_clips_owner_id_clip_request_id_key UNIQUE (owner_id, clip_request_id);


--
-- Name: studio_asset_clips studio_asset_clips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_asset_clips
    ADD CONSTRAINT studio_asset_clips_pkey PRIMARY KEY (id);


--
-- Name: studio_draft_asset_references studio_draft_asset_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_draft_asset_references
    ADD CONSTRAINT studio_draft_asset_references_pkey PRIMARY KEY (id);


--
-- Name: studio_draft_asset_references studio_draft_asset_references_project_id_draft_version_refe_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_draft_asset_references
    ADD CONSTRAINT studio_draft_asset_references_project_id_draft_version_refe_key UNIQUE (project_id, draft_version, reference_key);


--
-- Name: studio_project_mutation_receipts studio_project_mutation_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_mutation_receipts
    ADD CONSTRAINT studio_project_mutation_receipts_pkey PRIMARY KEY (id);


--
-- Name: studio_project_mutation_receipts studio_project_mutation_receipts_project_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_mutation_receipts
    ADD CONSTRAINT studio_project_mutation_receipts_project_id_idempotency_key_key UNIQUE (project_id, idempotency_key);


--
-- Name: studio_project_releases studio_project_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_releases
    ADD CONSTRAINT studio_project_releases_pkey PRIMARY KEY (id);


--
-- Name: studio_project_releases studio_project_releases_project_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_releases
    ADD CONSTRAINT studio_project_releases_project_id_id_key UNIQUE (project_id, id);


--
-- Name: studio_project_releases studio_project_releases_project_id_release_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_releases
    ADD CONSTRAINT studio_project_releases_project_id_release_number_key UNIQUE (project_id, release_number);


--
-- Name: studio_projects studio_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_projects
    ADD CONSTRAINT studio_projects_pkey PRIMARY KEY (id);


--
-- Name: studio_release_asset_references studio_release_asset_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_release_asset_references
    ADD CONSTRAINT studio_release_asset_references_pkey PRIMARY KEY (id);


--
-- Name: studio_release_asset_references studio_release_asset_references_release_id_reference_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_release_asset_references
    ADD CONSTRAINT studio_release_asset_references_release_id_reference_key_key UNIQUE (release_id, reference_key);


--
-- Name: studio_rundown_cues studio_rundown_cues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_cues
    ADD CONSTRAINT studio_rundown_cues_pkey PRIMARY KEY (id);


--
-- Name: studio_rundown_cues studio_rundown_cues_rundown_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_cues
    ADD CONSTRAINT studio_rundown_cues_rundown_id_id_key UNIQUE (rundown_id, id);


--
-- Name: studio_rundown_items studio_rundown_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_items
    ADD CONSTRAINT studio_rundown_items_pkey PRIMARY KEY (id);


--
-- Name: studio_rundown_items studio_rundown_items_rundown_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_items
    ADD CONSTRAINT studio_rundown_items_rundown_id_id_key UNIQUE (rundown_id, id);


--
-- Name: studio_rundown_items studio_rundown_items_rundown_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_items
    ADD CONSTRAINT studio_rundown_items_rundown_id_slug_key UNIQUE (rundown_id, slug);


--
-- Name: studio_rundown_mutation_receipts studio_rundown_mutation_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_mutation_receipts
    ADD CONSTRAINT studio_rundown_mutation_receipts_pkey PRIMARY KEY (id);


--
-- Name: studio_rundown_mutation_receipts studio_rundown_mutation_receipts_rundown_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_mutation_receipts
    ADD CONSTRAINT studio_rundown_mutation_receipts_rundown_id_idempotency_key_key UNIQUE (rundown_id, idempotency_key);


--
-- Name: studio_rundown_release_cues studio_rundown_release_cues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_cues
    ADD CONSTRAINT studio_rundown_release_cues_pkey PRIMARY KEY (release_id, source_cue_id);


--
-- Name: studio_rundown_release_cues studio_rundown_release_cues_release_id_source_item_id_posit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_cues
    ADD CONSTRAINT studio_rundown_release_cues_release_id_source_item_id_posit_key UNIQUE (release_id, source_item_id, "position");


--
-- Name: studio_rundown_release_cues studio_rundown_release_cues_release_id_source_item_id_sourc_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_cues
    ADD CONSTRAINT studio_rundown_release_cues_release_id_source_item_id_sourc_key UNIQUE (release_id, source_item_id, source_cue_id);


--
-- Name: studio_rundown_release_items studio_rundown_release_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_items
    ADD CONSTRAINT studio_rundown_release_items_pkey PRIMARY KEY (release_id, source_item_id);


--
-- Name: studio_rundown_release_items studio_rundown_release_items_release_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_items
    ADD CONSTRAINT studio_rundown_release_items_release_id_position_key UNIQUE (release_id, "position");


--
-- Name: studio_rundown_release_items studio_rundown_release_items_release_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_items
    ADD CONSTRAINT studio_rundown_release_items_release_id_slug_key UNIQUE (release_id, slug);


--
-- Name: studio_rundown_releases studio_rundown_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_pkey PRIMARY KEY (id);


--
-- Name: studio_rundown_releases studio_rundown_releases_rundown_id_canonical_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_rundown_id_canonical_hash_key UNIQUE (rundown_id, canonical_hash);


--
-- Name: studio_rundown_releases studio_rundown_releases_rundown_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_rundown_id_id_key UNIQUE (rundown_id, id);


--
-- Name: studio_rundown_releases studio_rundown_releases_rundown_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_rundown_id_idempotency_key_key UNIQUE (rundown_id, idempotency_key);


--
-- Name: studio_rundown_releases studio_rundown_releases_rundown_id_release_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_rundown_id_release_number_key UNIQUE (rundown_id, release_number);


--
-- Name: studio_rundown_releases studio_rundown_releases_rundown_id_source_draft_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_rundown_id_source_draft_version_key UNIQUE (rundown_id, source_draft_version);


--
-- Name: studio_rundowns studio_rundowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_pkey PRIMARY KEY (id);


--
-- Name: studio_rundowns studio_rundowns_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_project_id_key UNIQUE (project_id);


--
-- Name: studio_rundowns studio_rundowns_station_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_station_id_id_key UNIQUE (station_id, id);


--
-- Name: studio_station_settings studio_station_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_station_settings
    ADD CONSTRAINT studio_station_settings_pkey PRIMARY KEY (station_id);


--
-- Name: tv_channel_delivery_descriptors tv_channel_delivery_descriptors_master_playlist_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_descriptors
    ADD CONSTRAINT tv_channel_delivery_descriptors_master_playlist_object_key_key UNIQUE (master_playlist_object_key);


--
-- Name: tv_channel_delivery_descriptors tv_channel_delivery_descriptors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_descriptors
    ADD CONSTRAINT tv_channel_delivery_descriptors_pkey PRIMARY KEY (id);


--
-- Name: tv_channel_delivery_renditions tv_channel_delivery_renditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_renditions
    ADD CONSTRAINT tv_channel_delivery_renditions_pkey PRIMARY KEY (descriptor_id, rendition);


--
-- Name: tv_channel_delivery_renditions tv_channel_delivery_renditions_playlist_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_renditions
    ADD CONSTRAINT tv_channel_delivery_renditions_playlist_object_key_key UNIQUE (playlist_object_key);


--
-- Name: tv_channel_delivery_segments tv_channel_delivery_segments_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_segments
    ADD CONSTRAINT tv_channel_delivery_segments_object_key_key UNIQUE (object_key);


--
-- Name: tv_channel_delivery_segments tv_channel_delivery_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_segments
    ADD CONSTRAINT tv_channel_delivery_segments_pkey PRIMARY KEY (descriptor_id, rendition, segment_index);


--
-- Name: tv_channel_derivatives tv_channel_derivatives_descriptor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_descriptor_id_key UNIQUE (descriptor_id);


--
-- Name: tv_channel_derivatives tv_channel_derivatives_media_asset_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_media_asset_variant_id_key UNIQUE (media_asset_variant_id);


--
-- Name: tv_channel_derivatives tv_channel_derivatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_pkey PRIMARY KEY (id);


--
-- Name: tv_channel_derivatives tv_channel_derivatives_source_media_asset_variant_id_profil_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_source_media_asset_variant_id_profil_key UNIQUE (source_media_asset_variant_id, profile);


--
-- Name: tv_channel_transition_fillers tv_channel_transition_fillers_descriptor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_transition_fillers
    ADD CONSTRAINT tv_channel_transition_fillers_descriptor_id_key UNIQUE (descriptor_id);


--
-- Name: tv_channel_transition_fillers tv_channel_transition_fillers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_transition_fillers
    ADD CONSTRAINT tv_channel_transition_fillers_pkey PRIMARY KEY (id);


--
-- Name: tv_channel_transition_fillers tv_channel_transition_fillers_station_id_profile_transition_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_transition_fillers
    ADD CONSTRAINT tv_channel_transition_fillers_station_id_profile_transition_key UNIQUE (station_id, profile, transition_ms, generation);


--
-- Name: tv_playout_leases tv_playout_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_playout_leases
    ADD CONSTRAINT tv_playout_leases_pkey PRIMARY KEY (station_id);


--
-- Name: tv_playout_state tv_playout_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_playout_state
    ADD CONSTRAINT tv_playout_state_pkey PRIMARY KEY (station_id);


--
-- Name: tv_schedule_item_delivery tv_schedule_item_delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_schedule_item_delivery
    ADD CONSTRAINT tv_schedule_item_delivery_pkey PRIMARY KEY (schedule_item_id);


--
-- Name: tv_segment_journal tv_segment_journal_calendar_occurrence_release_shape_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_calendar_occurrence_release_shape_check CHECK (((occurrence_id IS NULL) OR (calendar_release_id IS NOT NULL))) NOT VALID;


--
-- Name: tv_segment_journal tv_segment_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_pkey PRIMARY KEY (station_id, media_sequence);


--
-- Name: tv_segment_journal tv_segment_journal_station_id_starts_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_station_id_starts_at_key UNIQUE (station_id, starts_at);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: weather_playback_sessions weather_playback_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_playback_sessions
    ADD CONSTRAINT weather_playback_sessions_pkey PRIMARY KEY (id);


--
-- Name: weather_playback_sessions weather_playback_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_playback_sessions
    ADD CONSTRAINT weather_playback_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: admin_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_created_idx ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: admin_audit_target_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_target_user_idx ON public.admin_audit_log USING btree (target_user_id, created_at DESC) WHERE (target_user_id IS NOT NULL);


--
-- Name: calendar_draft_events_profile_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_draft_events_profile_start_idx ON public.calendar_draft_events USING btree (profile_id, local_start_date, local_start_time, priority DESC);


--
-- Name: calendar_materialization_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_materialization_pending_idx ON public.calendar_release_materialization_state USING btree (status, updated_at) WHERE (status = ANY (ARRAY['PENDING'::public.calendar_materialization_status, 'RUNNING'::public.calendar_materialization_status, 'FAILED'::public.calendar_materialization_status]));


--
-- Name: calendar_occurrences_release_event_exact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_occurrences_release_event_exact_idx ON public.calendar_occurrences USING btree (station_id, release_id, id, release_event_id);


--
-- Name: calendar_occurrences_release_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_occurrences_release_time_idx ON public.calendar_occurrences USING btree (release_id, starts_at, ends_at);


--
-- Name: calendar_occurrences_station_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_occurrences_station_time_idx ON public.calendar_occurrences USING btree (station_id, starts_at, ends_at);


--
-- Name: calendar_occurrences_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_occurrences_window_idx ON public.calendar_occurrences USING gist (airing_window);


--
-- Name: calendar_radio_occurrence_items_clock_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_radio_occurrence_items_clock_source_idx ON public.calendar_radio_occurrence_items USING btree (release_block_id, release_item_id);


--
-- Name: calendar_radio_occurrence_items_occurrence_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_radio_occurrence_items_occurrence_time_idx ON public.calendar_radio_occurrence_items USING btree (occurrence_id, source_role, starts_at, ends_at);


--
-- Name: calendar_radio_occurrence_items_release_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_radio_occurrence_items_release_event_idx ON public.calendar_radio_occurrence_items USING btree (release_event_id, source_role, "position");


--
-- Name: calendar_radio_occurrence_items_release_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_radio_occurrence_items_release_time_idx ON public.calendar_radio_occurrence_items USING btree (release_id, starts_at, ends_at);


--
-- Name: calendar_release_events_release_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_release_events_release_start_idx ON public.calendar_release_events USING btree (release_id, local_start_date, local_start_time, priority DESC);


--
-- Name: calendar_releases_station_profile_release_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_releases_station_profile_release_idx ON public.calendar_releases USING btree (station_id, profile_id, id);


--
-- Name: calendar_runtime_state_heartbeat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_runtime_state_heartbeat_idx ON public.calendar_runtime_state USING btree (heartbeat_at) WHERE (heartbeat_at IS NOT NULL);


--
-- Name: calendar_runtime_state_next_boundary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_runtime_state_next_boundary_idx ON public.calendar_runtime_state USING btree (next_boundary_at) WHERE (next_boundary_at IS NOT NULL);


--
-- Name: calendar_runtime_transitions_station_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_runtime_transitions_station_created_idx ON public.calendar_runtime_transitions USING btree (station_id, transitioned_at, sequence);


--
-- Name: chat_guests_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_guests_expiry_idx ON public.chat_guests USING btree (expires_at);


--
-- Name: chat_messages_pinned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_pinned_idx ON public.chat_messages USING btree (station_id, pinned_at DESC) WHERE (pinned_at IS NOT NULL);


--
-- Name: chat_messages_public_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_public_activity_idx ON public.chat_messages USING btree (station_id, created_at DESC) WHERE (hidden_at IS NULL);


--
-- Name: chat_messages_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_retention_idx ON public.chat_messages USING btree (created_at) WHERE (pinned_at IS NULL);


--
-- Name: chat_messages_station_cursor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_station_cursor_idx ON public.chat_messages USING btree (station_id, created_at DESC, id DESC);


--
-- Name: clock_draft_blocks_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clock_draft_blocks_station_idx ON public.clock_draft_blocks USING btree (station_id, start_minute);


--
-- Name: clock_release_blocks_release_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clock_release_blocks_release_id_idx ON public.clock_release_blocks USING btree (release_id, id);


--
-- Name: clock_release_items_block_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clock_release_items_block_id_idx ON public.clock_release_items USING btree (release_block_id, id);


--
-- Name: clock_timeline_release_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clock_timeline_release_time_idx ON public.clock_timeline_items USING btree (release_id, starts_at, ends_at);


--
-- Name: content_reports_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_reports_queue_idx ON public.content_reports USING btree (status, created_at);


--
-- Name: content_reports_resolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_reports_resolved_idx ON public.content_reports USING btree (resolved_at) WHERE (resolved_at IS NOT NULL);


--
-- Name: content_reports_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_reports_station_idx ON public.content_reports USING btree (station_id, created_at DESC);


--
-- Name: device_authorizations_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_authorizations_expiry_idx ON public.device_authorizations USING btree (expires_at);


--
-- Name: device_sessions_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_sessions_expiry_idx ON public.device_sessions USING btree (expires_at);


--
-- Name: device_sessions_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_sessions_user_created_idx ON public.device_sessions USING btree (user_id, created_at DESC);


--
-- Name: email_verification_tokens_active_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_active_user_idx ON public.email_verification_tokens USING btree (user_id, created_at DESC) WHERE ((consumed_at IS NULL) AND (invalidated_at IS NULL));


--
-- Name: media_asset_provenance_asset_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_asset_provenance_asset_created_idx ON public.media_asset_provenance USING btree (media_asset_id, created_at);


--
-- Name: media_asset_provenance_legacy_radio_track_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_asset_provenance_legacy_radio_track_idx ON public.media_asset_provenance USING btree (legacy_radio_track_id) WHERE (legacy_radio_track_id IS NOT NULL);


--
-- Name: media_asset_provenance_legacy_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_asset_provenance_legacy_video_idx ON public.media_asset_provenance USING btree (legacy_video_id) WHERE (legacy_video_id IS NOT NULL);


--
-- Name: media_asset_variants_asset_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_asset_variants_asset_status_idx ON public.media_asset_variants USING btree (media_asset_id, status, role, generation DESC);


--
-- Name: media_asset_variants_processing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_asset_variants_processing_idx ON public.media_asset_variants USING btree (status, updated_at) WHERE (status = ANY (ARRAY['PENDING'::public.media_asset_variant_status, 'PROCESSING'::public.media_asset_variant_status]));


--
-- Name: media_asset_variants_ready_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_asset_variants_ready_role_idx ON public.media_asset_variants USING btree (media_asset_id, role, generation DESC) WHERE (status = 'READY'::public.media_asset_variant_status);


--
-- Name: media_assets_lifecycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_lifecycle_idx ON public.media_assets USING btree (status, deletion_requested_at) WHERE (status = ANY (ARRAY['ARCHIVED'::public.media_asset_status, 'DELETING'::public.media_asset_status]));


--
-- Name: media_assets_owner_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_owner_status_created_idx ON public.media_assets USING btree (owner_id, status, created_at DESC);


--
-- Name: media_assets_owner_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_assets_owner_type_created_idx ON public.media_assets USING btree (owner_id, media_type, created_at DESC) WHERE (status <> 'DELETED'::public.media_asset_status);


--
-- Name: media_gc_holds_active_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_gc_holds_active_asset_idx ON public.media_gc_holds USING btree (media_asset_id, held_at DESC) WHERE (released_at IS NULL);


--
-- Name: media_gc_holds_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_gc_holds_expiry_idx ON public.media_gc_holds USING btree (expires_at) WHERE ((released_at IS NULL) AND (expires_at IS NOT NULL));


--
-- Name: media_gc_tasks_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_gc_tasks_asset_idx ON public.media_gc_tasks USING btree (media_asset_id, created_at DESC) WHERE (media_asset_id IS NOT NULL);


--
-- Name: media_gc_tasks_dispatch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_gc_tasks_dispatch_idx ON public.media_gc_tasks USING btree (not_before, created_at) WHERE (status = ANY (ARRAY['PENDING'::text, 'FAILED'::text]));


--
-- Name: media_gc_tasks_lease_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_gc_tasks_lease_idx ON public.media_gc_tasks USING btree (lease_expires_at) WHERE (status = 'RUNNING'::text);


--
-- Name: media_processing_jobs_asset_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_processing_jobs_asset_created_idx ON public.media_processing_jobs USING btree (media_asset_id, created_at DESC);


--
-- Name: media_processing_jobs_dispatch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_processing_jobs_dispatch_idx ON public.media_processing_jobs USING btree (priority DESC, available_at, created_at) WHERE (status = 'QUEUED'::text);


--
-- Name: media_processing_jobs_lease_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_processing_jobs_lease_idx ON public.media_processing_jobs USING btree (lease_expires_at) WHERE (status = 'RUNNING'::text);


--
-- Name: media_rights_attestations_asset_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_rights_attestations_asset_active_idx ON public.media_rights_attestations USING btree (media_asset_id, attestation_version DESC) WHERE (revoked_at IS NULL);


--
-- Name: media_upload_parts_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_upload_parts_session_idx ON public.media_upload_parts USING btree (upload_session_id, part_number);


--
-- Name: media_upload_sessions_asset_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_upload_sessions_asset_created_idx ON public.media_upload_sessions USING btree (media_asset_id, created_at DESC);


--
-- Name: media_upload_sessions_open_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_upload_sessions_open_expiry_idx ON public.media_upload_sessions USING btree (status, expires_at) WHERE (status = ANY (ARRAY['INITIATED'::text, 'UPLOADING'::text, 'COMPLETING'::text]));


--
-- Name: media_upload_sessions_owner_idempotency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_upload_sessions_owner_idempotency_idx ON public.media_upload_sessions USING btree (initiated_by_user_id, idempotency_key) WHERE (initiated_by_user_id IS NOT NULL);


--
-- Name: media_upload_sessions_provider_upload_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_upload_sessions_provider_upload_idx ON public.media_upload_sessions USING btree (storage_authority, provider_upload_id) WHERE (provider_upload_id IS NOT NULL);


--
-- Name: mobile_refresh_tokens_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mobile_refresh_tokens_expiry_idx ON public.mobile_refresh_tokens USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: mobile_refresh_tokens_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mobile_refresh_tokens_family_idx ON public.mobile_refresh_tokens USING btree (user_id, family_id);


--
-- Name: moderation_audit_bot_idempotency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX moderation_audit_bot_idempotency_idx ON public.moderation_audit_log USING btree (actor_token_id, idempotency_key) WHERE ((actor_token_id IS NOT NULL) AND (idempotency_key IS NOT NULL));


--
-- Name: moderation_audit_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_audit_report_idx ON public.moderation_audit_log USING btree (report_id, created_at);


--
-- Name: moderation_service_tokens_creator_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX moderation_service_tokens_creator_active_idx ON public.moderation_service_tokens USING btree (created_by_user_id) WHERE (active = true);


--
-- Name: password_reset_tokens_active_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_active_user_idx ON public.password_reset_tokens USING btree (user_id, created_at DESC) WHERE ((consumed_at IS NULL) AND (invalidated_at IS NULL));


--
-- Name: playlist_items_station_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playlist_items_station_page_idx ON public.playlist_items USING btree (station_id, page);


--
-- Name: playlist_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX playlist_station_idx ON public.playlist_items USING btree (station_id, "position");


--
-- Name: radio_playout_leases_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_playout_leases_expiry_idx ON public.radio_playout_leases USING btree (lease_until);


--
-- Name: radio_playout_sessions_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_playout_sessions_station_idx ON public.radio_playout_sessions USING btree (station_id, created_at DESC);


--
-- Name: radio_playout_state_calendar_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_playout_state_calendar_item_idx ON public.radio_playout_state USING btree (current_calendar_item_id) WHERE (current_calendar_item_id IS NOT NULL);


--
-- Name: radio_playout_state_calendar_release_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_playout_state_calendar_release_idx ON public.radio_playout_state USING btree (calendar_release_id, occurrence_id) WHERE (calendar_release_id IS NOT NULL);


--
-- Name: radio_playout_state_health_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_playout_state_health_idx ON public.radio_playout_state USING btree (status, heartbeat_at);


--
-- Name: radio_playout_state_occurrence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_playout_state_occurrence_idx ON public.radio_playout_state USING btree (occurrence_id) WHERE (occurrence_id IS NOT NULL);


--
-- Name: radio_rotation_items_track_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_rotation_items_track_idx ON public.radio_rotation_items USING btree (track_id);


--
-- Name: radio_rotations_station_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX radio_rotations_station_name_idx ON public.radio_rotations USING btree (station_id, lower(name));


--
-- Name: radio_timeline_delivery_release_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_timeline_delivery_release_week_idx ON public.radio_timeline_delivery USING btree (release_id, service_week, media_sequence_start);


--
-- Name: radio_tracks_media_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_tracks_media_asset_idx ON public.radio_tracks USING btree (media_asset_id) WHERE (media_asset_id IS NOT NULL);


--
-- Name: radio_tracks_processing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_tracks_processing_idx ON public.radio_tracks USING btree (status, updated_at) WHERE (status = ANY (ARRAY['QUEUED'::public.radio_track_status, 'PROCESSING'::public.radio_track_status]));


--
-- Name: radio_tracks_station_media_asset_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX radio_tracks_station_media_asset_unique_idx ON public.radio_tracks USING btree (station_id, media_asset_id) WHERE (media_asset_id IS NOT NULL);


--
-- Name: radio_tracks_station_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radio_tracks_station_status_idx ON public.radio_tracks USING btree (station_id, status, created_at DESC);


--
-- Name: schedule_items_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_items_idx ON public.schedule_items USING btree (schedule_id, "position");


--
-- Name: schedules_station_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schedules_station_id_idx ON public.schedules USING btree (station_id, id);


--
-- Name: sessions_audience_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_audience_expiry_idx ON public.sessions USING btree (audience, expires_at);


--
-- Name: sessions_mobile_recent_auth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_mobile_recent_auth_idx ON public.sessions USING btree (user_id, authenticated_at DESC) WHERE (audience = 'MOBILE'::text);


--
-- Name: sessions_mobile_refresh_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_mobile_refresh_family_idx ON public.sessions USING btree (user_id, mobile_refresh_family_id) WHERE ((audience = 'MOBILE'::text) AND (mobile_refresh_family_id IS NOT NULL));


--
-- Name: sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_idx ON public.sessions USING btree (user_id);


--
-- Name: station_fans_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_fans_station_idx ON public.station_fans USING btree (station_id, created_at DESC);


--
-- Name: station_genres_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX station_genres_name_lower_idx ON public.station_genres USING btree (lower(name));


--
-- Name: station_media_allocations_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_media_allocations_asset_idx ON public.station_media_allocations USING btree (media_asset_id, station_id);


--
-- Name: station_operation_audit_station_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_operation_audit_station_created_idx ON public.station_operation_audit USING btree (station_id, created_at DESC);


--
-- Name: station_programming_profiles_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX station_programming_profiles_active_idx ON public.station_programming_profiles USING btree (station_id) WHERE (lifecycle = 'ACTIVE'::public.programming_profile_lifecycle);


--
-- Name: station_programming_profiles_calendar_strategy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX station_programming_profiles_calendar_strategy_idx ON public.station_programming_profiles USING btree (station_id, id, strategy);


--
-- Name: station_programming_profiles_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX station_programming_profiles_name_idx ON public.station_programming_profiles USING btree (station_id, lower(name));


--
-- Name: station_ratings_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_ratings_station_idx ON public.station_ratings USING btree (station_id);


--
-- Name: station_room_memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_room_memberships_user_idx ON public.station_room_memberships USING btree (user_id, joined_at DESC);


--
-- Name: station_room_sessions_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_room_sessions_station_idx ON public.station_room_sessions USING btree (station_id, created_at DESC);


--
-- Name: station_tunes_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_tunes_retention_idx ON public.station_tunes USING btree (tuned_at);


--
-- Name: station_tunes_station_tuned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_tunes_station_tuned_idx ON public.station_tunes USING btree (station_id, tuned_at DESC);


--
-- Name: station_tunes_user_tuned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX station_tunes_user_tuned_idx ON public.station_tunes USING btree (user_id, tuned_at DESC);


--
-- Name: stations_active_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stations_active_owner_idx ON public.stations USING btree (owner_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: stations_explicit_guide_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stations_explicit_guide_idx ON public.stations USING btree (owner_declared_explicit, explicit_enforced_at, genre_id) WHERE ((visibility = 'PUBLIC'::text) AND (deleted_at IS NULL));


--
-- Name: stations_guide_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stations_guide_idx ON public.stations USING btree (visibility, genre_id, broadcast_state, updated_at DESC) WHERE ((deleted_at IS NULL) AND (moderation_status = 'ACTIVE'::public.station_moderation_status) AND (access_enabled = true));


--
-- Name: stations_guide_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stations_guide_kind_idx ON public.stations USING btree (station_kind, visibility, genre_id, broadcast_state, updated_at DESC) WHERE ((deleted_at IS NULL) AND (moderation_status = 'ACTIVE'::public.station_moderation_status) AND (access_enabled = true));


--
-- Name: stations_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stations_owner_idx ON public.stations USING btree (owner_id);


--
-- Name: stations_owner_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stations_owner_kind_idx ON public.stations USING btree (owner_id, station_kind, updated_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: stations_purge_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stations_purge_due_idx ON public.stations USING btree (purge_after) WHERE (deleted_at IS NOT NULL);


--
-- Name: stations_weatherstar_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stations_weatherstar_owner_idx ON public.stations USING btree (owner_id) WHERE ((playback_type = 'WEATHERSTAR_4000'::text) AND (deleted_at IS NULL));


--
-- Name: studio_asset_clips_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_asset_clips_parent_idx ON public.studio_asset_clips USING btree (parent_media_asset_id, created_at DESC);


--
-- Name: studio_draft_asset_references_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_draft_asset_references_asset_idx ON public.studio_draft_asset_references USING btree (media_asset_id, project_id);


--
-- Name: studio_draft_asset_references_project_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_draft_asset_references_project_version_idx ON public.studio_draft_asset_references USING btree (project_id, draft_version);


--
-- Name: studio_project_mutation_receipts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_project_mutation_receipts_created_idx ON public.studio_project_mutation_receipts USING btree (created_at);


--
-- Name: studio_project_releases_project_draft_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX studio_project_releases_project_draft_idx ON public.studio_project_releases USING btree (project_id, source_draft_version);


--
-- Name: studio_project_releases_project_idempotency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX studio_project_releases_project_idempotency_idx ON public.studio_project_releases USING btree (project_id, idempotency_key);


--
-- Name: studio_projects_station_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX studio_projects_station_id_idx ON public.studio_projects USING btree (station_id, id);


--
-- Name: studio_projects_station_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_projects_station_updated_idx ON public.studio_projects USING btree (station_id, updated_at DESC);


--
-- Name: studio_release_asset_references_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_release_asset_references_asset_idx ON public.studio_release_asset_references USING btree (media_asset_id, release_id);


--
-- Name: studio_release_asset_references_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_release_asset_references_variant_idx ON public.studio_release_asset_references USING btree (media_asset_variant_id);


--
-- Name: studio_rundown_cues_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX studio_rundown_cues_position_idx ON public.studio_rundown_cues USING btree (item_id, "position");


--
-- Name: studio_rundown_items_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX studio_rundown_items_position_idx ON public.studio_rundown_items USING btree (rundown_id, "position");


--
-- Name: studio_rundown_mutation_receipts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_rundown_mutation_receipts_created_idx ON public.studio_rundown_mutation_receipts USING btree (created_at);


--
-- Name: studio_rundowns_station_lifecycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX studio_rundowns_station_lifecycle_idx ON public.studio_rundowns USING btree (station_id, lifecycle, updated_at DESC);


--
-- Name: tv_channel_delivery_segments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_channel_delivery_segments_order_idx ON public.tv_channel_delivery_segments USING btree (descriptor_id, rendition, segment_index);


--
-- Name: tv_channel_derivatives_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_channel_derivatives_asset_idx ON public.tv_channel_derivatives USING btree (media_asset_id, created_at DESC);


--
-- Name: tv_channel_transition_fillers_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_channel_transition_fillers_station_idx ON public.tv_channel_transition_fillers USING btree (station_id, profile, transition_ms, generation DESC);


--
-- Name: tv_playout_leases_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_playout_leases_expiry_idx ON public.tv_playout_leases USING btree (lease_until);


--
-- Name: tv_playout_state_calendar_release_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_playout_state_calendar_release_idx ON public.tv_playout_state USING btree (calendar_release_id, occurrence_id) WHERE (calendar_release_id IS NOT NULL);


--
-- Name: tv_playout_state_occurrence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_playout_state_occurrence_idx ON public.tv_playout_state USING btree (occurrence_id) WHERE (occurrence_id IS NOT NULL);


--
-- Name: tv_schedule_item_delivery_derivative_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_schedule_item_delivery_derivative_idx ON public.tv_schedule_item_delivery USING btree (derivative_id);


--
-- Name: tv_schedule_item_delivery_filler_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_schedule_item_delivery_filler_idx ON public.tv_schedule_item_delivery USING btree (transition_filler_id) WHERE (transition_filler_id IS NOT NULL);


--
-- Name: tv_segment_journal_automation_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_segment_journal_automation_source_idx ON public.tv_segment_journal USING btree (automation_schedule_id, automation_schedule_item_id) WHERE (source_kind = 'AUTOMATION'::public.tv_segment_source_kind);


--
-- Name: tv_segment_journal_calendar_occurrence_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_segment_journal_calendar_occurrence_time_idx ON public.tv_segment_journal USING btree (occurrence_id, starts_at DESC) WHERE (occurrence_id IS NOT NULL);


--
-- Name: tv_segment_journal_calendar_release_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_segment_journal_calendar_release_time_idx ON public.tv_segment_journal USING btree (station_id, calendar_release_id, starts_at DESC) WHERE (calendar_release_id IS NOT NULL);


--
-- Name: tv_segment_journal_occurrence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_segment_journal_occurrence_idx ON public.tv_segment_journal USING btree (occurrence_id) WHERE (occurrence_id IS NOT NULL);


--
-- Name: tv_segment_journal_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tv_segment_journal_time_idx ON public.tv_segment_journal USING btree (station_id, starts_at DESC);


--
-- Name: user_blocks_blocker_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_blocks_blocker_created_idx ON public.user_blocks USING btree (blocker_user_id, created_at DESC);


--
-- Name: user_blocks_guest_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_blocks_guest_unique_idx ON public.user_blocks USING btree (blocker_user_id, blocked_guest_id) WHERE (blocked_guest_id IS NOT NULL);


--
-- Name: user_blocks_registered_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_blocks_registered_target_idx ON public.user_blocks USING btree (blocked_user_id) WHERE (blocked_user_id IS NOT NULL);


--
-- Name: user_blocks_registered_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_blocks_registered_unique_idx ON public.user_blocks USING btree (blocker_user_id, blocked_user_id) WHERE (blocked_user_id IS NOT NULL);


--
-- Name: users_anonymization_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_anonymization_due_idx ON public.users USING btree (anonymize_after) WHERE ((deletion_requested_at IS NOT NULL) AND (anonymized_at IS NULL));


--
-- Name: users_avatar_revision_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_avatar_revision_unique_idx ON public.users USING btree (avatar_revision) WHERE (avatar_revision IS NOT NULL);


--
-- Name: users_email_normalized_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_normalized_unique_idx ON public.users USING btree (lower(btrim(email)));


--
-- Name: users_enabled_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_enabled_admin_idx ON public.users USING btree (role) WHERE ((role = 'ADMIN'::public.user_role) AND (disabled_at IS NULL) AND (deletion_requested_at IS NULL) AND (anonymized_at IS NULL));


--
-- Name: videos_ingestion_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX videos_ingestion_request_idx ON public.videos USING btree (station_id, ingestion_request_id) WHERE (ingestion_request_id IS NOT NULL);


--
-- Name: videos_media_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_media_asset_idx ON public.videos USING btree (media_asset_id) WHERE (media_asset_id IS NOT NULL);


--
-- Name: videos_processing_metrics_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_processing_metrics_idx ON public.videos USING btree (processing_finished_at DESC) WHERE (processing_duration_ms IS NOT NULL);


--
-- Name: videos_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_station_idx ON public.videos USING btree (station_id);


--
-- Name: videos_station_media_asset_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX videos_station_media_asset_unique_idx ON public.videos USING btree (station_id, media_asset_id) WHERE (media_asset_id IS NOT NULL);


--
-- Name: videos_youtube_ingestion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_youtube_ingestion_idx ON public.videos USING btree (ingestion_status, updated_at) WHERE ((source_kind = 'YOUTUBE'::text) AND (ingestion_status = ANY (ARRAY['QUEUED'::text, 'PROCESSING'::text])));


--
-- Name: weather_playback_sessions_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_playback_sessions_expiry_idx ON public.weather_playback_sessions USING btree (expires_at);


--
-- Name: weather_playback_sessions_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_playback_sessions_feed_idx ON public.weather_playback_sessions USING btree (feed_key, expires_at DESC);


--
-- Name: weather_playback_sessions_station_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_playback_sessions_station_idx ON public.weather_playback_sessions USING btree (station_id, expires_at DESC);


--
-- Name: weather_playback_sessions_tune_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weather_playback_sessions_tune_idx ON public.weather_playback_sessions USING btree (user_id, station_id, tune_id);


--
-- Name: weather_playback_sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_playback_sessions_user_idx ON public.weather_playback_sessions USING btree (user_id, expires_at DESC);


--
-- Name: calendar_occurrences calendar_occurrences_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_occurrences_immutable BEFORE DELETE OR UPDATE ON public.calendar_occurrences FOR EACH ROW EXECUTE FUNCTION public.prevent_calendar_release_change();


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_items_fill_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_radio_occurrence_items_fill_event BEFORE INSERT ON public.calendar_radio_occurrence_items FOR EACH ROW EXECUTE FUNCTION public.fill_calendar_radio_occurrence_event();


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_items_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_radio_occurrence_items_immutable BEFORE DELETE OR UPDATE ON public.calendar_radio_occurrence_items FOR EACH ROW EXECUTE FUNCTION public.prevent_calendar_radio_occurrence_item_change();


--
-- Name: calendar_release_events calendar_release_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_release_events_immutable BEFORE DELETE OR UPDATE ON public.calendar_release_events FOR EACH ROW EXECUTE FUNCTION public.prevent_calendar_release_change();


--
-- Name: calendar_release_exceptions calendar_release_exceptions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_release_exceptions_immutable BEFORE DELETE OR UPDATE ON public.calendar_release_exceptions FOR EACH ROW EXECUTE FUNCTION public.prevent_calendar_release_change();


--
-- Name: calendar_releases calendar_releases_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_releases_immutable BEFORE DELETE OR UPDATE ON public.calendar_releases FOR EACH ROW EXECUTE FUNCTION public.prevent_calendar_release_change();


--
-- Name: calendar_runtime_transitions calendar_runtime_transitions_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_runtime_transitions_append_only BEFORE DELETE OR UPDATE ON public.calendar_runtime_transitions FOR EACH ROW EXECUTE FUNCTION public.prevent_calendar_runtime_transition_change();


--
-- Name: clock_release_blocks clock_release_blocks_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clock_release_blocks_immutable BEFORE UPDATE ON public.clock_release_blocks FOR EACH ROW EXECUTE FUNCTION public.prevent_clock_release_update();


--
-- Name: clock_release_items clock_release_items_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clock_release_items_immutable BEFORE UPDATE ON public.clock_release_items FOR EACH ROW EXECUTE FUNCTION public.prevent_clock_release_update();


--
-- Name: clock_releases clock_releases_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clock_releases_immutable BEFORE UPDATE ON public.clock_releases FOR EACH ROW EXECUTE FUNCTION public.prevent_clock_release_update();


--
-- Name: clock_timeline_items clock_timeline_items_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clock_timeline_items_immutable BEFORE UPDATE ON public.clock_timeline_items FOR EACH ROW EXECUTE FUNCTION public.prevent_clock_release_update();


--
-- Name: media_asset_variants media_asset_variants_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER media_asset_variants_immutable BEFORE UPDATE ON public.media_asset_variants FOR EACH ROW EXECUTE FUNCTION public.prevent_media_asset_variant_rewrite();


--
-- Name: media_assets media_assets_archived_from_status_lifecycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER media_assets_archived_from_status_lifecycle BEFORE UPDATE OF status ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.maintain_media_asset_archived_from_status();


--
-- Name: media_assets media_assets_station_storage_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER media_assets_station_storage_limit BEFORE UPDATE OF quota_bytes, status ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.enforce_allocated_asset_storage_limit();


--
-- Name: radio_release_item_delivery radio_release_item_delivery_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER radio_release_item_delivery_immutable BEFORE UPDATE ON public.radio_release_item_delivery FOR EACH ROW EXECUTE FUNCTION public.prevent_radio_delivery_update();


--
-- Name: radio_timeline_delivery radio_timeline_delivery_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER radio_timeline_delivery_immutable BEFORE UPDATE ON public.radio_timeline_delivery FOR EACH ROW EXECUTE FUNCTION public.prevent_radio_delivery_update();


--
-- Name: radio_tracks radio_tracks_station_storage_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER radio_tracks_station_storage_limit BEFORE INSERT OR UPDATE OF station_id, media_asset_id, size_bytes ON public.radio_tracks FOR EACH ROW EXECUTE FUNCTION public.enforce_station_legacy_storage_limit();


--
-- Name: station_media_allocations station_media_allocations_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER station_media_allocations_limit BEFORE INSERT OR UPDATE OF station_id, media_asset_id ON public.station_media_allocations FOR EACH ROW EXECUTE FUNCTION public.enforce_station_media_allocation_limit();


--
-- Name: station_operation_audit station_operation_audit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER station_operation_audit_append_only BEFORE UPDATE ON public.station_operation_audit FOR EACH ROW EXECUTE FUNCTION public.prevent_station_operation_audit_update();


--
-- Name: stations stations_foundation_validation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stations_foundation_validation BEFORE INSERT OR UPDATE OF station_kind, time_zone ON public.stations FOR EACH ROW EXECUTE FUNCTION public.validate_station_foundation();


--
-- Name: stations stations_note_active_calendar_release_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stations_note_active_calendar_release_change BEFORE UPDATE OF active_calendar_release_id ON public.stations FOR EACH ROW EXECUTE FUNCTION public.note_active_calendar_release_change();


--
-- Name: studio_project_releases studio_project_releases_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER studio_project_releases_immutable BEFORE UPDATE ON public.studio_project_releases FOR EACH ROW EXECUTE FUNCTION public.prevent_studio_release_update();


--
-- Name: studio_release_asset_references studio_release_asset_references_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER studio_release_asset_references_immutable BEFORE UPDATE ON public.studio_release_asset_references FOR EACH ROW EXECUTE FUNCTION public.prevent_studio_release_asset_reference_update();


--
-- Name: studio_rundown_release_cues studio_rundown_release_cues_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER studio_rundown_release_cues_immutable BEFORE DELETE OR UPDATE ON public.studio_rundown_release_cues FOR EACH ROW EXECUTE FUNCTION public.prevent_studio_rundown_release_change();


--
-- Name: studio_rundown_release_items studio_rundown_release_items_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER studio_rundown_release_items_immutable BEFORE DELETE OR UPDATE ON public.studio_rundown_release_items FOR EACH ROW EXECUTE FUNCTION public.prevent_studio_rundown_release_change();


--
-- Name: studio_rundown_releases studio_rundown_releases_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER studio_rundown_releases_immutable BEFORE DELETE OR UPDATE ON public.studio_rundown_releases FOR EACH ROW EXECUTE FUNCTION public.prevent_studio_rundown_release_change();


--
-- Name: tv_channel_delivery_descriptors tv_channel_delivery_descriptors_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_channel_delivery_descriptors_immutable BEFORE UPDATE ON public.tv_channel_delivery_descriptors FOR EACH ROW EXECUTE FUNCTION public.prevent_tv_channel_delivery_update();


--
-- Name: tv_channel_delivery_renditions tv_channel_delivery_renditions_published_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_channel_delivery_renditions_published_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.tv_channel_delivery_renditions FOR EACH ROW EXECUTE FUNCTION public.prevent_published_tv_channel_inventory_change();


--
-- Name: tv_channel_delivery_segments tv_channel_delivery_segments_published_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_channel_delivery_segments_published_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.tv_channel_delivery_segments FOR EACH ROW EXECUTE FUNCTION public.prevent_published_tv_channel_inventory_change();


--
-- Name: tv_channel_derivatives tv_channel_derivatives_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_channel_derivatives_immutable BEFORE UPDATE ON public.tv_channel_derivatives FOR EACH ROW EXECUTE FUNCTION public.prevent_tv_channel_delivery_update();


--
-- Name: tv_channel_derivatives tv_channel_derivatives_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_channel_derivatives_validate BEFORE INSERT ON public.tv_channel_derivatives FOR EACH ROW EXECUTE FUNCTION public.validate_tv_channel_derivative();


--
-- Name: tv_channel_transition_fillers tv_channel_transition_fillers_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_channel_transition_fillers_immutable BEFORE UPDATE ON public.tv_channel_transition_fillers FOR EACH ROW EXECUTE FUNCTION public.prevent_tv_channel_delivery_update();


--
-- Name: tv_channel_transition_fillers tv_channel_transition_fillers_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_channel_transition_fillers_validate BEFORE INSERT ON public.tv_channel_transition_fillers FOR EACH ROW EXECUTE FUNCTION public.validate_tv_channel_transition_filler();


--
-- Name: tv_schedule_item_delivery tv_schedule_item_delivery_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_schedule_item_delivery_immutable BEFORE UPDATE ON public.tv_schedule_item_delivery FOR EACH ROW EXECUTE FUNCTION public.prevent_tv_channel_delivery_update();


--
-- Name: tv_schedule_item_delivery tv_schedule_item_delivery_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_schedule_item_delivery_validate BEFORE INSERT ON public.tv_schedule_item_delivery FOR EACH ROW EXECUTE FUNCTION public.validate_tv_schedule_item_delivery();


--
-- Name: tv_segment_journal tv_segment_journal_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tv_segment_journal_append_only BEFORE DELETE OR UPDATE ON public.tv_segment_journal FOR EACH ROW EXECUTE FUNCTION public.prevent_tv_segment_journal_change();


--
-- Name: user_blocks user_blocks_verified_blocker_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_blocks_verified_blocker_trigger BEFORE INSERT OR UPDATE OF blocker_user_id ON public.user_blocks FOR EACH ROW EXECUTE FUNCTION public.require_verified_user_blocker();


--
-- Name: videos videos_station_storage_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER videos_station_storage_limit BEFORE INSERT OR UPDATE OF station_id, media_asset_id, size_bytes ON public.videos FOR EACH ROW EXECUTE FUNCTION public.enforce_station_legacy_storage_limit();


--
-- Name: admin_audit_log admin_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_audit_log admin_audit_log_target_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_target_station_id_fkey FOREIGN KEY (target_station_id) REFERENCES public.stations(id) ON DELETE SET NULL;


--
-- Name: admin_audit_log admin_audit_log_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: calendar_draft_events calendar_draft_events_station_id_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_events_station_id_profile_id_fkey FOREIGN KEY (station_id, profile_id) REFERENCES public.calendar_profile_drafts(station_id, profile_id) ON DELETE CASCADE;


--
-- Name: calendar_draft_exceptions calendar_draft_exceptions_station_id_profile_id_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_exceptions
    ADD CONSTRAINT calendar_draft_exceptions_station_id_profile_id_event_id_fkey FOREIGN KEY (station_id, profile_id, event_id) REFERENCES public.calendar_draft_events(station_id, profile_id, id) ON DELETE CASCADE;


--
-- Name: calendar_draft_events calendar_draft_fallback_clock_block_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_fallback_clock_block_fk FOREIGN KEY (fallback_clock_release_id, fallback_clock_block_id) REFERENCES public.clock_release_blocks(release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_draft_events calendar_draft_fallback_clock_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_fallback_clock_release_fk FOREIGN KEY (station_id, fallback_clock_release_id) REFERENCES public.clock_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_draft_events calendar_draft_fallback_tv_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_fallback_tv_schedule_fk FOREIGN KEY (station_id, fallback_tv_schedule_id) REFERENCES public.schedules(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_draft_events calendar_draft_source_clock_block_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_source_clock_block_fk FOREIGN KEY (source_clock_release_id, source_clock_block_id) REFERENCES public.clock_release_blocks(release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_draft_events calendar_draft_source_clock_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_source_clock_release_fk FOREIGN KEY (station_id, source_clock_release_id) REFERENCES public.clock_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_draft_events calendar_draft_source_tv_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_draft_events
    ADD CONSTRAINT calendar_draft_source_tv_schedule_fk FOREIGN KEY (station_id, source_tv_schedule_id) REFERENCES public.schedules(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_occurrences calendar_occurrences_station_id_profile_id_release_id_rel_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_occurrences
    ADD CONSTRAINT calendar_occurrences_station_id_profile_id_release_id_rel_fkey1 FOREIGN KEY (station_id, profile_id, release_id, release_event_id, release_exception_id, release_exception_kind) REFERENCES public.calendar_release_exceptions(station_id, profile_id, release_id, release_event_id, id, exception_kind) ON DELETE RESTRICT;


--
-- Name: calendar_occurrences calendar_occurrences_station_id_profile_id_release_id_rele_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_occurrences
    ADD CONSTRAINT calendar_occurrences_station_id_profile_id_release_id_rele_fkey FOREIGN KEY (station_id, profile_id, release_id, release_event_id, event_kind) REFERENCES public.calendar_release_events(station_id, profile_id, release_id, id, event_kind) ON DELETE CASCADE;


--
-- Name: calendar_profile_drafts calendar_profile_drafts_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_profile_drafts
    ADD CONSTRAINT calendar_profile_drafts_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: calendar_profile_drafts calendar_profile_drafts_station_id_profile_id_profile_stra_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_profile_drafts
    ADD CONSTRAINT calendar_profile_drafts_station_id_profile_id_profile_stra_fkey FOREIGN KEY (station_id, profile_id, profile_strategy) REFERENCES public.station_programming_profiles(station_id, id, strategy) ON DELETE CASCADE;


--
-- Name: calendar_profile_drafts calendar_profile_drafts_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_profile_drafts
    ADD CONSTRAINT calendar_profile_drafts_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_ite_release_block_id_release_ite_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_ite_release_block_id_release_ite_fkey FOREIGN KEY (release_block_id, release_item_id) REFERENCES public.clock_release_items(release_block_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_ite_station_id_release_id_occurr_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_ite_station_id_release_id_occurr_fkey FOREIGN KEY (station_id, release_id, occurrence_id, release_event_id) REFERENCES public.calendar_occurrences(station_id, release_id, id, release_event_id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_ite_station_id_release_id_releas_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_ite_station_id_release_id_releas_fkey FOREIGN KEY (station_id, release_id, release_event_id) REFERENCES public.calendar_release_events(station_id, release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_items_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_items_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: calendar_radio_occurrence_items calendar_radio_occurrence_items_station_id_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_radio_occurrence_items
    ADD CONSTRAINT calendar_radio_occurrence_items_station_id_release_id_fkey FOREIGN KEY (station_id, release_id) REFERENCES public.calendar_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_release_events calendar_release_events_station_id_profile_id_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_events_station_id_profile_id_release_id_fkey FOREIGN KEY (station_id, profile_id, release_id) REFERENCES public.calendar_releases(station_id, profile_id, id) ON DELETE CASCADE;


--
-- Name: calendar_release_exceptions calendar_release_exceptions_station_id_profile_id_release__fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_exceptions
    ADD CONSTRAINT calendar_release_exceptions_station_id_profile_id_release__fkey FOREIGN KEY (station_id, profile_id, release_id, release_event_id) REFERENCES public.calendar_release_events(station_id, profile_id, release_id, id) ON DELETE CASCADE;


--
-- Name: calendar_release_events calendar_release_fallback_clock_block_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_fallback_clock_block_fk FOREIGN KEY (fallback_clock_release_id, fallback_clock_block_id) REFERENCES public.clock_release_blocks(release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_release_events calendar_release_fallback_clock_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_fallback_clock_release_fk FOREIGN KEY (station_id, fallback_clock_release_id) REFERENCES public.clock_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_release_events calendar_release_fallback_tv_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_fallback_tv_schedule_fk FOREIGN KEY (station_id, fallback_tv_schedule_id) REFERENCES public.schedules(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_release_materialization_state calendar_release_materialization_sta_station_id_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_materialization_state
    ADD CONSTRAINT calendar_release_materialization_sta_station_id_release_id_fkey FOREIGN KEY (station_id, release_id) REFERENCES public.calendar_releases(station_id, id) ON DELETE CASCADE;


--
-- Name: calendar_release_events calendar_release_source_clock_block_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_source_clock_block_fk FOREIGN KEY (source_clock_release_id, source_clock_block_id) REFERENCES public.clock_release_blocks(release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_release_events calendar_release_source_clock_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_source_clock_release_fk FOREIGN KEY (station_id, source_clock_release_id) REFERENCES public.clock_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_release_events calendar_release_source_tv_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_release_events
    ADD CONSTRAINT calendar_release_source_tv_schedule_fk FOREIGN KEY (station_id, source_tv_schedule_id) REFERENCES public.schedules(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: calendar_releases calendar_releases_published_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_published_by_user_id_fkey FOREIGN KEY (published_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: calendar_releases calendar_releases_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: calendar_releases calendar_releases_station_id_profile_id_profile_strategy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_releases
    ADD CONSTRAINT calendar_releases_station_id_profile_id_profile_strategy_fkey FOREIGN KEY (station_id, profile_id, profile_strategy) REFERENCES public.station_programming_profiles(station_id, id, strategy) ON DELETE RESTRICT;


--
-- Name: calendar_runtime_state calendar_runtime_state_station_id_active_release_id_curren_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_state
    ADD CONSTRAINT calendar_runtime_state_station_id_active_release_id_curren_fkey FOREIGN KEY (station_id, active_release_id, current_occurrence_id) REFERENCES public.calendar_occurrences(station_id, release_id, id) ON DELETE RESTRICT;


--
-- Name: calendar_runtime_state calendar_runtime_state_station_id_active_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_state
    ADD CONSTRAINT calendar_runtime_state_station_id_active_release_id_fkey FOREIGN KEY (station_id, active_release_id) REFERENCES public.calendar_releases(station_id, id) ON DELETE RESTRICT;


--
-- Name: calendar_runtime_state calendar_runtime_state_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_state
    ADD CONSTRAINT calendar_runtime_state_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: calendar_runtime_transitions calendar_runtime_transitions_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_transitions
    ADD CONSTRAINT calendar_runtime_transitions_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: calendar_runtime_transitions calendar_runtime_transitions_station_id_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_transitions
    ADD CONSTRAINT calendar_runtime_transitions_station_id_release_id_fkey FOREIGN KEY (station_id, release_id) REFERENCES public.calendar_releases(station_id, id) ON DELETE RESTRICT;


--
-- Name: calendar_runtime_transitions calendar_runtime_transitions_station_id_release_id_occurre_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_runtime_transitions
    ADD CONSTRAINT calendar_runtime_transitions_station_id_release_id_occurre_fkey FOREIGN KEY (station_id, release_id, occurrence_id) REFERENCES public.calendar_occurrences(station_id, release_id, id) ON DELETE RESTRICT;


--
-- Name: chat_messages chat_messages_author_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_author_guest_id_fkey FOREIGN KEY (author_guest_id) REFERENCES public.chat_guests(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_hidden_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_hidden_by_user_id_fkey FOREIGN KEY (hidden_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_pinned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pinned_by_user_id_fkey FOREIGN KEY (pinned_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: clock_draft_blocks clock_draft_blocks_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_draft_blocks
    ADD CONSTRAINT clock_draft_blocks_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: clock_draft_blocks clock_draft_blocks_station_id_radio_rotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_draft_blocks
    ADD CONSTRAINT clock_draft_blocks_station_id_radio_rotation_id_fkey FOREIGN KEY (station_id, radio_rotation_id) REFERENCES public.radio_rotations(station_id, id) ON DELETE CASCADE;


--
-- Name: clock_draft_blocks clock_draft_blocks_tv_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_draft_blocks
    ADD CONSTRAINT clock_draft_blocks_tv_schedule_id_fkey FOREIGN KEY (tv_schedule_id) REFERENCES public.schedules(id) ON DELETE RESTRICT;


--
-- Name: clock_release_blocks clock_release_blocks_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_blocks
    ADD CONSTRAINT clock_release_blocks_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.clock_releases(id) ON DELETE CASCADE;


--
-- Name: clock_release_items clock_release_items_radio_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_items
    ADD CONSTRAINT clock_release_items_radio_track_id_fkey FOREIGN KEY (radio_track_id) REFERENCES public.radio_tracks(id) ON DELETE CASCADE;


--
-- Name: clock_release_items clock_release_items_release_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_items
    ADD CONSTRAINT clock_release_items_release_block_id_fkey FOREIGN KEY (release_block_id) REFERENCES public.clock_release_blocks(id) ON DELETE CASCADE;


--
-- Name: clock_release_items clock_release_items_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_release_items
    ADD CONSTRAINT clock_release_items_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: clock_releases clock_releases_published_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_releases
    ADD CONSTRAINT clock_releases_published_by_user_id_fkey FOREIGN KEY (published_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: clock_releases clock_releases_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_releases
    ADD CONSTRAINT clock_releases_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: clock_timeline_items clock_timeline_items_release_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_timeline_items
    ADD CONSTRAINT clock_timeline_items_release_block_id_fkey FOREIGN KEY (release_block_id) REFERENCES public.clock_release_blocks(id) ON DELETE CASCADE;


--
-- Name: clock_timeline_items clock_timeline_items_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_timeline_items
    ADD CONSTRAINT clock_timeline_items_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.clock_releases(id) ON DELETE CASCADE;


--
-- Name: clock_timeline_items clock_timeline_items_release_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clock_timeline_items
    ADD CONSTRAINT clock_timeline_items_release_item_id_fkey FOREIGN KEY (release_item_id) REFERENCES public.clock_release_items(id) ON DELETE CASCADE;


--
-- Name: content_reports content_reports_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: content_reports content_reports_chat_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_chat_message_id_fkey FOREIGN KEY (chat_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: content_reports content_reports_reporter_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_guest_id_fkey FOREIGN KEY (reporter_guest_id) REFERENCES public.chat_guests(id) ON DELETE SET NULL;


--
-- Name: content_reports content_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: content_reports content_reports_resolved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: content_reports content_reports_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE SET NULL;


--
-- Name: content_reports content_reports_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_reports
    ADD CONSTRAINT content_reports_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: device_authorizations device_authorizations_approved_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_authorizations
    ADD CONSTRAINT device_authorizations_approved_user_id_fkey FOREIGN KEY (approved_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: device_sessions device_sessions_authorization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_sessions
    ADD CONSTRAINT device_sessions_authorization_id_fkey FOREIGN KEY (authorization_id) REFERENCES public.device_authorizations(id) ON DELETE CASCADE;


--
-- Name: device_sessions device_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_sessions
    ADD CONSTRAINT device_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media_asset_provenance media_asset_provenance_legacy_radio_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_provenance
    ADD CONSTRAINT media_asset_provenance_legacy_radio_track_id_fkey FOREIGN KEY (legacy_radio_track_id) REFERENCES public.radio_tracks(id) ON DELETE SET NULL;


--
-- Name: media_asset_provenance media_asset_provenance_legacy_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_provenance
    ADD CONSTRAINT media_asset_provenance_legacy_video_id_fkey FOREIGN KEY (legacy_video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: media_asset_provenance media_asset_provenance_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_provenance
    ADD CONSTRAINT media_asset_provenance_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: media_asset_provenance media_asset_provenance_parent_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_provenance
    ADD CONSTRAINT media_asset_provenance_parent_media_asset_id_fkey FOREIGN KEY (parent_media_asset_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_asset_provenance media_asset_provenance_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_provenance
    ADD CONSTRAINT media_asset_provenance_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_asset_variants media_asset_variants_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset_variants
    ADD CONSTRAINT media_asset_variants_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: media_gc_holds media_gc_holds_held_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_holds
    ADD CONSTRAINT media_gc_holds_held_by_user_id_fkey FOREIGN KEY (held_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_gc_holds media_gc_holds_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_holds
    ADD CONSTRAINT media_gc_holds_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: media_gc_holds media_gc_holds_released_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_holds
    ADD CONSTRAINT media_gc_holds_released_by_user_id_fkey FOREIGN KEY (released_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_gc_tasks media_gc_tasks_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_tasks
    ADD CONSTRAINT media_gc_tasks_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: media_gc_tasks media_gc_tasks_media_asset_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_tasks
    ADD CONSTRAINT media_gc_tasks_media_asset_variant_id_fkey FOREIGN KEY (media_asset_variant_id) REFERENCES public.media_asset_variants(id) ON DELETE SET NULL;


--
-- Name: media_gc_tasks media_gc_tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_gc_tasks
    ADD CONSTRAINT media_gc_tasks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_processing_jobs media_processing_jobs_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_processing_jobs
    ADD CONSTRAINT media_processing_jobs_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: media_processing_jobs media_processing_jobs_media_asset_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_processing_jobs
    ADD CONSTRAINT media_processing_jobs_media_asset_variant_id_fkey FOREIGN KEY (media_asset_variant_id) REFERENCES public.media_asset_variants(id) ON DELETE SET NULL;


--
-- Name: media_rights_attestations media_rights_attestations_attested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_rights_attestations
    ADD CONSTRAINT media_rights_attestations_attested_by_user_id_fkey FOREIGN KEY (attested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_rights_attestations media_rights_attestations_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_rights_attestations
    ADD CONSTRAINT media_rights_attestations_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: media_rights_attestations media_rights_attestations_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_rights_attestations
    ADD CONSTRAINT media_rights_attestations_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_upload_parts media_upload_parts_upload_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_parts
    ADD CONSTRAINT media_upload_parts_upload_session_id_fkey FOREIGN KEY (upload_session_id) REFERENCES public.media_upload_sessions(id) ON DELETE CASCADE;


--
-- Name: media_upload_sessions media_upload_sessions_initiated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_initiated_by_user_id_fkey FOREIGN KEY (initiated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media_upload_sessions media_upload_sessions_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_upload_sessions
    ADD CONSTRAINT media_upload_sessions_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE CASCADE;


--
-- Name: mobile_refresh_tokens mobile_refresh_tokens_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_refresh_tokens
    ADD CONSTRAINT mobile_refresh_tokens_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.mobile_refresh_tokens(id) ON DELETE SET NULL;


--
-- Name: mobile_refresh_tokens mobile_refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_refresh_tokens
    ADD CONSTRAINT mobile_refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: moderation_audit_log moderation_audit_log_actor_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_audit_log
    ADD CONSTRAINT moderation_audit_log_actor_token_id_fkey FOREIGN KEY (actor_token_id) REFERENCES public.moderation_service_tokens(id) ON DELETE SET NULL;


--
-- Name: moderation_audit_log moderation_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_audit_log
    ADD CONSTRAINT moderation_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moderation_audit_log moderation_audit_log_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_audit_log
    ADD CONSTRAINT moderation_audit_log_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.content_reports(id) ON DELETE CASCADE;


--
-- Name: moderation_service_tokens moderation_service_tokens_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_service_tokens
    ADD CONSTRAINT moderation_service_tokens_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: playlist_items playlist_items_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_items
    ADD CONSTRAINT playlist_items_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: playlist_items playlist_items_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_items
    ADD CONSTRAINT playlist_items_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: radio_playout_leases radio_playout_leases_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_leases
    ADD CONSTRAINT radio_playout_leases_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: radio_playout_sessions radio_playout_sessions_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_sessions
    ADD CONSTRAINT radio_playout_sessions_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: radio_playout_state radio_playout_state_active_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_active_session_id_fkey FOREIGN KEY (active_session_id) REFERENCES public.radio_playout_sessions(id) ON DELETE SET NULL;


--
-- Name: radio_playout_state radio_playout_state_calendar_occurrence_legacy_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_calendar_occurrence_legacy_fk FOREIGN KEY (station_id, occurrence_id) REFERENCES public.calendar_occurrences(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: radio_playout_state radio_playout_state_calendar_occurrence_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_calendar_occurrence_release_fk FOREIGN KEY (station_id, calendar_release_id, occurrence_id) REFERENCES public.calendar_occurrences(station_id, release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: radio_playout_state radio_playout_state_calendar_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_calendar_release_fk FOREIGN KEY (station_id, calendar_release_id) REFERENCES public.calendar_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: radio_playout_state radio_playout_state_current_calendar_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_current_calendar_item_fk FOREIGN KEY (station_id, calendar_release_id, occurrence_id, current_calendar_item_id) REFERENCES public.calendar_radio_occurrence_items(station_id, release_id, occurrence_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: radio_playout_state radio_playout_state_current_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_current_release_id_fkey FOREIGN KEY (current_release_id) REFERENCES public.clock_releases(id) ON DELETE SET NULL;


--
-- Name: radio_playout_state radio_playout_state_current_timeline_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_current_timeline_item_id_fkey FOREIGN KEY (current_timeline_item_id) REFERENCES public.clock_timeline_items(id) ON DELETE SET NULL;


--
-- Name: radio_playout_state radio_playout_state_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_playout_state
    ADD CONSTRAINT radio_playout_state_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: radio_release_item_delivery radio_release_item_delivery_release_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_release_item_delivery
    ADD CONSTRAINT radio_release_item_delivery_release_item_id_fkey FOREIGN KEY (release_item_id) REFERENCES public.clock_release_items(id) ON DELETE CASCADE;


--
-- Name: radio_rotation_items radio_rotation_items_rotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_rotation_items
    ADD CONSTRAINT radio_rotation_items_rotation_id_fkey FOREIGN KEY (rotation_id) REFERENCES public.radio_rotations(id) ON DELETE CASCADE;


--
-- Name: radio_rotation_items radio_rotation_items_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_rotation_items
    ADD CONSTRAINT radio_rotation_items_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.radio_tracks(id) ON DELETE CASCADE;


--
-- Name: radio_rotations radio_rotations_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_rotations
    ADD CONSTRAINT radio_rotations_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: radio_timeline_delivery radio_timeline_delivery_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_timeline_delivery
    ADD CONSTRAINT radio_timeline_delivery_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.clock_releases(id) ON DELETE CASCADE;


--
-- Name: radio_timeline_delivery radio_timeline_delivery_timeline_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_timeline_delivery
    ADD CONSTRAINT radio_timeline_delivery_timeline_item_id_fkey FOREIGN KEY (timeline_item_id) REFERENCES public.clock_timeline_items(id) ON DELETE CASCADE;


--
-- Name: radio_tracks radio_tracks_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_tracks
    ADD CONSTRAINT radio_tracks_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: radio_tracks radio_tracks_rights_attested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_tracks
    ADD CONSTRAINT radio_tracks_rights_attested_by_fkey FOREIGN KEY (rights_attested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: radio_tracks radio_tracks_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_tracks
    ADD CONSTRAINT radio_tracks_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: radio_visual_settings radio_visual_settings_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_visual_settings
    ADD CONSTRAINT radio_visual_settings_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: radio_visual_settings radio_visual_settings_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radio_visual_settings
    ADD CONSTRAINT radio_visual_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: schedule_items schedule_items_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_items
    ADD CONSTRAINT schedule_items_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE;


--
-- Name: schedule_items schedule_items_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_items
    ADD CONSTRAINT schedule_items_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE RESTRICT;


--
-- Name: schedules schedules_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: station_fans station_fans_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_fans
    ADD CONSTRAINT station_fans_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: station_fans station_fans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_fans
    ADD CONSTRAINT station_fans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: station_media_allocations station_media_allocations_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_media_allocations
    ADD CONSTRAINT station_media_allocations_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE RESTRICT;


--
-- Name: station_media_allocations station_media_allocations_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_media_allocations
    ADD CONSTRAINT station_media_allocations_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: station_operation_audit station_operation_audit_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_operation_audit
    ADD CONSTRAINT station_operation_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: station_operation_audit station_operation_audit_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_operation_audit
    ADD CONSTRAINT station_operation_audit_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: station_programming_profiles station_programming_profiles_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_programming_profiles
    ADD CONSTRAINT station_programming_profiles_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: station_programming_profiles station_programming_profiles_source_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_programming_profiles
    ADD CONSTRAINT station_programming_profiles_source_profile_id_fkey FOREIGN KEY (source_profile_id) REFERENCES public.station_programming_profiles(id) ON DELETE SET NULL;


--
-- Name: station_programming_profiles station_programming_profiles_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_programming_profiles
    ADD CONSTRAINT station_programming_profiles_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: station_ratings station_ratings_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_ratings
    ADD CONSTRAINT station_ratings_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: station_ratings station_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_ratings
    ADD CONSTRAINT station_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: station_room_access station_room_access_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_access
    ADD CONSTRAINT station_room_access_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: station_room_memberships station_room_memberships_station_id_access_generation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_memberships
    ADD CONSTRAINT station_room_memberships_station_id_access_generation_fkey FOREIGN KEY (station_id, access_generation) REFERENCES public.station_room_access(station_id, generation) ON DELETE CASCADE;


--
-- Name: station_room_memberships station_room_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_memberships
    ADD CONSTRAINT station_room_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: station_room_sessions station_room_sessions_station_id_access_generation_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_room_sessions
    ADD CONSTRAINT station_room_sessions_station_id_access_generation_fkey FOREIGN KEY (station_id, access_generation) REFERENCES public.station_room_access(station_id, generation) ON DELETE CASCADE;


--
-- Name: station_tunes station_tunes_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_tunes
    ADD CONSTRAINT station_tunes_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: station_tunes station_tunes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.station_tunes
    ADD CONSTRAINT station_tunes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: stations stations_active_calendar_profile_release_coherence_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_active_calendar_profile_release_coherence_fk FOREIGN KEY (id, active_programming_profile_id, active_calendar_release_id) REFERENCES public.calendar_releases(station_id, profile_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: stations stations_active_calendar_release_same_station_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_active_calendar_release_same_station_fk FOREIGN KEY (id, active_calendar_release_id) REFERENCES public.calendar_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: stations stations_active_clock_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_active_clock_release_fk FOREIGN KEY (active_clock_release_id) REFERENCES public.clock_releases(id) ON DELETE SET NULL;


--
-- Name: stations stations_active_programming_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_active_programming_profile_fk FOREIGN KEY (id, active_programming_profile_id) REFERENCES public.station_programming_profiles(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: stations stations_active_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_active_schedule_fk FOREIGN KEY (active_schedule_id) REFERENCES public.schedules(id) ON DELETE SET NULL;


--
-- Name: stations stations_explicit_enforced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_explicit_enforced_by_fkey FOREIGN KEY (explicit_enforced_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: stations stations_genre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES public.station_genres(id) ON DELETE RESTRICT;


--
-- Name: stations stations_legal_hold_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_legal_hold_by_fkey FOREIGN KEY (legal_hold_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: stations stations_moderation_restricted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_moderation_restricted_by_fkey FOREIGN KEY (moderation_restricted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: stations stations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: stations stations_paused_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_paused_schedule_fk FOREIGN KEY (paused_schedule_id) REFERENCES public.schedules(id) ON DELETE SET NULL;


--
-- Name: stations stations_pending_calendar_release_same_station_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_pending_calendar_release_same_station_fk FOREIGN KEY (id, pending_calendar_release_id) REFERENCES public.calendar_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: stations stations_pending_schedule_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_pending_schedule_fk FOREIGN KEY (pending_schedule_id) REFERENCES public.schedules(id) ON DELETE SET NULL;


--
-- Name: stations stations_previous_clock_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_previous_clock_release_id_fkey FOREIGN KEY (previous_clock_release_id) REFERENCES public.clock_releases(id) ON DELETE SET NULL;


--
-- Name: studio_asset_clips studio_asset_clips_child_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_asset_clips
    ADD CONSTRAINT studio_asset_clips_child_media_asset_id_fkey FOREIGN KEY (child_media_asset_id) REFERENCES public.media_assets(id) ON DELETE RESTRICT;


--
-- Name: studio_asset_clips studio_asset_clips_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_asset_clips
    ADD CONSTRAINT studio_asset_clips_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: studio_asset_clips studio_asset_clips_parent_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_asset_clips
    ADD CONSTRAINT studio_asset_clips_parent_media_asset_id_fkey FOREIGN KEY (parent_media_asset_id) REFERENCES public.media_assets(id) ON DELETE RESTRICT;


--
-- Name: studio_draft_asset_references studio_draft_asset_references_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_draft_asset_references
    ADD CONSTRAINT studio_draft_asset_references_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE RESTRICT;


--
-- Name: studio_draft_asset_references studio_draft_asset_references_media_asset_id_media_asset_v_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_draft_asset_references
    ADD CONSTRAINT studio_draft_asset_references_media_asset_id_media_asset_v_fkey FOREIGN KEY (media_asset_id, media_asset_variant_id) REFERENCES public.media_asset_variants(media_asset_id, id) ON DELETE RESTRICT;


--
-- Name: studio_draft_asset_references studio_draft_asset_references_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_draft_asset_references
    ADD CONSTRAINT studio_draft_asset_references_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.studio_projects(id) ON DELETE CASCADE;


--
-- Name: studio_project_mutation_receipts studio_project_mutation_receipts_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_mutation_receipts
    ADD CONSTRAINT studio_project_mutation_receipts_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: studio_project_mutation_receipts studio_project_mutation_receipts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_mutation_receipts
    ADD CONSTRAINT studio_project_mutation_receipts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.studio_projects(id) ON DELETE CASCADE;


--
-- Name: studio_project_releases studio_project_releases_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_releases
    ADD CONSTRAINT studio_project_releases_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: studio_project_releases studio_project_releases_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_project_releases
    ADD CONSTRAINT studio_project_releases_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.studio_projects(id) ON DELETE CASCADE;


--
-- Name: studio_projects studio_projects_active_release_same_project_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_projects
    ADD CONSTRAINT studio_projects_active_release_same_project_fk FOREIGN KEY (id, active_release_id) REFERENCES public.studio_project_releases(project_id, id);


--
-- Name: studio_projects studio_projects_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_projects
    ADD CONSTRAINT studio_projects_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: studio_projects studio_projects_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_projects
    ADD CONSTRAINT studio_projects_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: studio_projects studio_projects_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_projects
    ADD CONSTRAINT studio_projects_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: studio_release_asset_references studio_release_asset_referenc_media_asset_id_media_asset_v_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_release_asset_references
    ADD CONSTRAINT studio_release_asset_referenc_media_asset_id_media_asset_v_fkey FOREIGN KEY (media_asset_id, media_asset_variant_id) REFERENCES public.media_asset_variants(media_asset_id, id) ON DELETE RESTRICT;


--
-- Name: studio_release_asset_references studio_release_asset_references_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_release_asset_references
    ADD CONSTRAINT studio_release_asset_references_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE RESTRICT;


--
-- Name: studio_release_asset_references studio_release_asset_references_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_release_asset_references
    ADD CONSTRAINT studio_release_asset_references_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.studio_project_releases(id) ON DELETE CASCADE;


--
-- Name: studio_rundown_cues studio_rundown_cues_rundown_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_cues
    ADD CONSTRAINT studio_rundown_cues_rundown_id_item_id_fkey FOREIGN KEY (rundown_id, item_id) REFERENCES public.studio_rundown_items(rundown_id, id) ON DELETE CASCADE;


--
-- Name: studio_rundown_items studio_rundown_items_rundown_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_items
    ADD CONSTRAINT studio_rundown_items_rundown_id_fkey FOREIGN KEY (rundown_id) REFERENCES public.studio_rundowns(id) ON DELETE CASCADE;


--
-- Name: studio_rundown_mutation_receipts studio_rundown_mutation_receipts_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_mutation_receipts
    ADD CONSTRAINT studio_rundown_mutation_receipts_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: studio_rundown_mutation_receipts studio_rundown_mutation_receipts_rundown_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_mutation_receipts
    ADD CONSTRAINT studio_rundown_mutation_receipts_rundown_id_fkey FOREIGN KEY (rundown_id) REFERENCES public.studio_rundowns(id) ON DELETE CASCADE;


--
-- Name: studio_rundown_mutation_receipts studio_rundown_mutation_receipts_rundown_id_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_mutation_receipts
    ADD CONSTRAINT studio_rundown_mutation_receipts_rundown_id_release_id_fkey FOREIGN KEY (rundown_id, release_id) REFERENCES public.studio_rundown_releases(rundown_id, id) ON DELETE CASCADE;


--
-- Name: studio_rundown_release_cues studio_rundown_release_cues_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_cues
    ADD CONSTRAINT studio_rundown_release_cues_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.studio_rundown_releases(id) ON DELETE CASCADE;


--
-- Name: studio_rundown_release_cues studio_rundown_release_cues_release_id_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_cues
    ADD CONSTRAINT studio_rundown_release_cues_release_id_source_item_id_fkey FOREIGN KEY (release_id, source_item_id) REFERENCES public.studio_rundown_release_items(release_id, source_item_id) ON DELETE CASCADE;


--
-- Name: studio_rundown_release_items studio_rundown_release_items_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_release_items
    ADD CONSTRAINT studio_rundown_release_items_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.studio_rundown_releases(id) ON DELETE CASCADE;


--
-- Name: studio_rundown_releases studio_rundown_releases_published_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_published_by_user_id_fkey FOREIGN KEY (published_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: studio_rundown_releases studio_rundown_releases_rundown_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundown_releases
    ADD CONSTRAINT studio_rundown_releases_rundown_id_fkey FOREIGN KEY (rundown_id) REFERENCES public.studio_rundowns(id) ON DELETE CASCADE;


--
-- Name: studio_rundowns studio_rundowns_active_release_same_rundown_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_active_release_same_rundown_fk FOREIGN KEY (id, active_release_id) REFERENCES public.studio_rundown_releases(rundown_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: studio_rundowns studio_rundowns_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: studio_rundowns studio_rundowns_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: studio_rundowns studio_rundowns_station_id_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_station_id_project_id_fkey FOREIGN KEY (station_id, project_id) REFERENCES public.studio_projects(station_id, id) ON DELETE CASCADE;


--
-- Name: studio_rundowns studio_rundowns_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_rundowns
    ADD CONSTRAINT studio_rundowns_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: studio_station_settings studio_station_settings_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_station_settings
    ADD CONSTRAINT studio_station_settings_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: studio_station_settings studio_station_settings_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_station_settings
    ADD CONSTRAINT studio_station_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tv_channel_delivery_renditions tv_channel_delivery_renditions_descriptor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_renditions
    ADD CONSTRAINT tv_channel_delivery_renditions_descriptor_id_fkey FOREIGN KEY (descriptor_id) REFERENCES public.tv_channel_delivery_descriptors(id) ON DELETE CASCADE;


--
-- Name: tv_channel_delivery_segments tv_channel_delivery_segments_descriptor_id_rendition_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_delivery_segments
    ADD CONSTRAINT tv_channel_delivery_segments_descriptor_id_rendition_fkey FOREIGN KEY (descriptor_id, rendition) REFERENCES public.tv_channel_delivery_renditions(descriptor_id, rendition) ON DELETE CASCADE;


--
-- Name: tv_channel_derivatives tv_channel_derivatives_descriptor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_descriptor_id_fkey FOREIGN KEY (descriptor_id) REFERENCES public.tv_channel_delivery_descriptors(id) ON DELETE RESTRICT;


--
-- Name: tv_channel_derivatives tv_channel_derivatives_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE RESTRICT;


--
-- Name: tv_channel_derivatives tv_channel_derivatives_media_asset_id_media_asset_variant__fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_media_asset_id_media_asset_variant__fkey FOREIGN KEY (media_asset_id, media_asset_variant_id) REFERENCES public.media_asset_variants(media_asset_id, id) ON DELETE RESTRICT;


--
-- Name: tv_channel_derivatives tv_channel_derivatives_media_asset_id_source_media_asset_v_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_derivatives
    ADD CONSTRAINT tv_channel_derivatives_media_asset_id_source_media_asset_v_fkey FOREIGN KEY (media_asset_id, source_media_asset_variant_id) REFERENCES public.media_asset_variants(media_asset_id, id) ON DELETE RESTRICT;


--
-- Name: tv_channel_transition_fillers tv_channel_transition_fillers_descriptor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_transition_fillers
    ADD CONSTRAINT tv_channel_transition_fillers_descriptor_id_fkey FOREIGN KEY (descriptor_id) REFERENCES public.tv_channel_delivery_descriptors(id) ON DELETE RESTRICT;


--
-- Name: tv_channel_transition_fillers tv_channel_transition_fillers_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_channel_transition_fillers
    ADD CONSTRAINT tv_channel_transition_fillers_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: tv_playout_leases tv_playout_leases_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_playout_leases
    ADD CONSTRAINT tv_playout_leases_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: tv_playout_state tv_playout_state_calendar_occurrence_legacy_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_playout_state
    ADD CONSTRAINT tv_playout_state_calendar_occurrence_legacy_fk FOREIGN KEY (station_id, occurrence_id) REFERENCES public.calendar_occurrences(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tv_playout_state tv_playout_state_calendar_occurrence_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_playout_state
    ADD CONSTRAINT tv_playout_state_calendar_occurrence_release_fk FOREIGN KEY (station_id, calendar_release_id, occurrence_id) REFERENCES public.calendar_occurrences(station_id, release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tv_playout_state tv_playout_state_calendar_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_playout_state
    ADD CONSTRAINT tv_playout_state_calendar_release_fk FOREIGN KEY (station_id, calendar_release_id) REFERENCES public.calendar_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tv_playout_state tv_playout_state_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_playout_state
    ADD CONSTRAINT tv_playout_state_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: tv_schedule_item_delivery tv_schedule_item_delivery_derivative_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_schedule_item_delivery
    ADD CONSTRAINT tv_schedule_item_delivery_derivative_id_fkey FOREIGN KEY (derivative_id) REFERENCES public.tv_channel_derivatives(id) ON DELETE RESTRICT;


--
-- Name: tv_schedule_item_delivery tv_schedule_item_delivery_schedule_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_schedule_item_delivery
    ADD CONSTRAINT tv_schedule_item_delivery_schedule_item_id_fkey FOREIGN KEY (schedule_item_id) REFERENCES public.schedule_items(id) ON DELETE CASCADE;


--
-- Name: tv_schedule_item_delivery tv_schedule_item_delivery_transition_filler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_schedule_item_delivery
    ADD CONSTRAINT tv_schedule_item_delivery_transition_filler_id_fkey FOREIGN KEY (transition_filler_id) REFERENCES public.tv_channel_transition_fillers(id) ON DELETE RESTRICT;


--
-- Name: tv_segment_journal tv_segment_journal_automation_derivative_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_automation_derivative_id_fkey FOREIGN KEY (automation_derivative_id) REFERENCES public.tv_channel_derivatives(id) ON DELETE RESTRICT;


--
-- Name: tv_segment_journal tv_segment_journal_automation_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_automation_schedule_id_fkey FOREIGN KEY (automation_schedule_id) REFERENCES public.schedules(id) ON DELETE RESTRICT;


--
-- Name: tv_segment_journal tv_segment_journal_automation_schedule_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_automation_schedule_item_id_fkey FOREIGN KEY (automation_schedule_item_id) REFERENCES public.schedule_items(id) ON DELETE RESTRICT;


--
-- Name: tv_segment_journal tv_segment_journal_automation_transition_filler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_automation_transition_filler_id_fkey FOREIGN KEY (automation_transition_filler_id) REFERENCES public.tv_channel_transition_fillers(id) ON DELETE RESTRICT;


--
-- Name: tv_segment_journal tv_segment_journal_calendar_occurrence_legacy_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_calendar_occurrence_legacy_fk FOREIGN KEY (station_id, occurrence_id) REFERENCES public.calendar_occurrences(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tv_segment_journal tv_segment_journal_calendar_occurrence_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_calendar_occurrence_release_fk FOREIGN KEY (station_id, calendar_release_id, occurrence_id) REFERENCES public.calendar_occurrences(station_id, release_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tv_segment_journal tv_segment_journal_calendar_release_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_calendar_release_fk FOREIGN KEY (station_id, calendar_release_id) REFERENCES public.calendar_releases(station_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: tv_segment_journal tv_segment_journal_descriptor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_descriptor_id_fkey FOREIGN KEY (descriptor_id) REFERENCES public.tv_channel_delivery_descriptors(id) ON DELETE RESTRICT;


--
-- Name: tv_segment_journal tv_segment_journal_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tv_segment_journal
    ADD CONSTRAINT tv_segment_journal_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_guest_id_fkey FOREIGN KEY (blocked_guest_id) REFERENCES public.chat_guests(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_user_id_fkey FOREIGN KEY (blocker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_deletion_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_deletion_requested_by_user_id_fkey FOREIGN KEY (deletion_requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_disabled_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_disabled_by_user_id_fkey FOREIGN KEY (disabled_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: videos videos_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: videos videos_replacement_for_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_replacement_for_id_fkey FOREIGN KEY (replacement_for_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: videos videos_rights_attested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_rights_attested_by_fkey FOREIGN KEY (rights_attested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: videos videos_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: weather_playback_sessions weather_playback_sessions_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_playback_sessions
    ADD CONSTRAINT weather_playback_sessions_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;


--
-- Name: weather_playback_sessions weather_playback_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_playback_sessions
    ADD CONSTRAINT weather_playback_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


INSERT INTO public.station_genres (slug, name) VALUES
    ('news-politics', 'News & Politics'),
    ('music', 'Music'),
    ('movies-film', 'Movies & Film'),
    ('entertainment', 'Entertainment'),
    ('comedy', 'Comedy'),
    ('gaming', 'Gaming'),
    ('technology', 'Technology'),
    ('science', 'Science'),
    ('education', 'Education'),
    ('business-finance', 'Business & Finance'),
    ('lifestyle', 'Lifestyle'),
    ('food-cooking', 'Food & Cooking'),
    ('travel', 'Travel'),
    ('arts-culture', 'Arts & Culture'),
    ('faith-spirituality', 'Faith & Spirituality'),
    ('kids-family', 'Kids & Family'),
    ('health-wellness', 'Health & Wellness'),
    ('documentary', 'Documentary'),
    ('community-local', 'Community & Local'),
    ('weather', 'Weather')
ON CONFLICT (slug) DO NOTHING;


--
-- PostgreSQL database dump complete
--
