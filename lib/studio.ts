import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { HttpError } from "@/lib/http";
import { validateOwnerAssetReferences, type MediaAssetType } from "@/lib/media-assets";
import type { StationKind } from "@/lib/station-kind";
import {
  defaultStudioProjectDocument,
  studioProjectDocumentSchema,
  upgradeTvStudioProjectDocumentV1ToV2,
  type StudioProjectDocument,
} from "@/lib/studio-model";

type StudioAssetReference = { key: string; assetId: string; expectedType: MediaAssetType };

function projectAssetReferences(document: StudioProjectDocument): StudioAssetReference[] {
  const references: StudioAssetReference[] = [];
  for (const track of document.tracks) {
    const expectedType: MediaAssetType = track.kind === "AUDIO" ? "AUDIO" : track.kind === "VIDEO" ? "VIDEO" : "IMAGE";
    for (const clip of track.clips) if (clip.assetId) references.push({ key: `clip:${clip.id}`, assetId: clip.assetId, expectedType });
  }
  if (document.radioBoard) {
    if (document.radioBoard.decks.A.assetId) references.push({ key: "deck:A", assetId: document.radioBoard.decks.A.assetId, expectedType: "AUDIO" });
    if (document.radioBoard.decks.B.assetId) references.push({ key: "deck:B", assetId: document.radioBoard.decks.B.assetId, expectedType: "AUDIO" });
    for (const cart of document.radioBoard.carts) if (cart.assetId) references.push({ key: `cart:${cart.id}`, assetId: cart.assetId, expectedType: "AUDIO" });
  }
  if (document.schemaVersion === 2) {
    for (const source of document.tvBoard.sources) {
      if (source.kind === "MEDIA") references.push({ key: `tv-source:${source.id}`, assetId: source.assetId, expectedType: source.mediaType });
    }
  }
  return references;
}

async function replaceDraftAssetReferences(
  client: PoolClient,
  projectId: string,
  draftVersion: number,
  references: Array<{ key: string; assetId: string; variantId: string }>,
): Promise<void> {
  await client.query("DELETE FROM studio_draft_asset_references WHERE project_id = $1", [projectId]);
  for (const reference of references) {
    await client.query(
      `INSERT INTO studio_draft_asset_references
         (project_id, draft_version, reference_key, media_asset_id, media_asset_variant_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, draftVersion, reference.key, reference.assetId, reference.variantId],
    );
  }
}

type StudioStationRow = {
  id: string;
  name: string;
  station_kind: StationKind;
  broadcast_state: "RUNNING" | "STOPPED";
  enabled: boolean | null;
  readiness: "WORKSPACE" | "PREPARING" | "LIVE_READY" | "ERROR" | null;
  settings_version: number | null;
  access_token_ciphertext: string;
};

type StudioProjectRow = {
  id: string;
  station_id: string;
  name: string;
  description: string;
  draft_document: unknown;
  draft_version: number;
  active_release_id: string | null;
  active_release_number: number | null;
  active_release_source_draft_version: number | null;
  active_release_document_hash: string | null;
  active_release_current: boolean;
  created_at: Date;
  updated_at: Date;
};

type StudioProjectSummaryRow = Pick<StudioProjectRow,
  "id" | "name" | "description" | "draft_version" | "active_release_id" | "active_release_number" |
  "active_release_source_draft_version" | "active_release_document_hash" | "active_release_current" | "created_at" | "updated_at"
>;

export type StudioSettings = {
  enabled: boolean;
  readiness: "WORKSPACE" | "PREPARING" | "LIVE_READY" | "ERROR";
  version: number;
};

export type StudioProjectSummary = {
  id: string;
  name: string;
  description: string;
  draftVersion: number;
  activeReleaseId: string | null;
  activeReleaseNumber: number | null;
  activeReleaseSourceDraftVersion: number | null;
  activeReleaseDocumentHash: string | null;
  activeReleaseCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StudioProject = StudioProjectSummary & {
  stationId: string;
  document: StudioProjectDocument;
};

export type StudioOverview = {
  station: {
    id: string;
    name: string;
    kind: StationKind;
    broadcastState: "RUNNING" | "STOPPED";
    chatToken: string;
  };
  settings: StudioSettings;
  projects: StudioProjectSummary[];
};

function presentSettings(row?: Pick<StudioStationRow, "enabled" | "readiness" | "settings_version">): StudioSettings {
  const enabled = row?.enabled ?? false;
  return {
    enabled,
    readiness: row?.readiness ?? "WORKSPACE",
    version: row?.settings_version ?? 0,
  };
}

function presentProject(row: StudioProjectRow): StudioProject {
  return {
    id: row.id,
    stationId: row.station_id,
    name: row.name,
    description: row.description,
    draftVersion: row.draft_version,
    activeReleaseId: row.active_release_id,
    activeReleaseNumber: row.active_release_number,
    activeReleaseSourceDraftVersion: row.active_release_source_draft_version,
    activeReleaseDocumentHash: row.active_release_document_hash,
    activeReleaseCurrent: row.active_release_current,
    document: studioProjectDocumentSchema.parse(row.draft_document),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function presentProjectSummary(row: StudioProjectSummaryRow): StudioProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    draftVersion: row.draft_version,
    activeReleaseId: row.active_release_id,
    activeReleaseNumber: row.active_release_number,
    activeReleaseSourceDraftVersion: row.active_release_source_draft_version,
    activeReleaseDocumentHash: row.active_release_document_hash,
    activeReleaseCurrent: row.active_release_current,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function lockOwnedStation(client: PoolClient, stationId: string, userId: string, kind: StationKind): Promise<{ id: string; name: string }> {
  const result = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM stations
      WHERE id = $1 AND owner_id = $2 AND station_kind = $3 AND deleted_at IS NULL
      FOR UPDATE`,
    [stationId, userId, kind],
  );
  if (!result.rows[0]) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  return result.rows[0];
}

async function writeAudit(client: PoolClient, stationId: string, userId: string, action: string, metadata: Record<string, unknown>): Promise<void> {
  await client.query(
    `INSERT INTO station_operation_audit (station_id, actor_user_id, action, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [stationId, userId, action, JSON.stringify(metadata)],
  );
}

async function requireStudioEnabled(client: PoolClient, stationId: string): Promise<void> {
  const settings = await client.query<{ enabled: boolean }>(
    "SELECT enabled FROM studio_station_settings WHERE station_id = $1 FOR UPDATE",
    [stationId],
  );
  if (!settings.rows[0]?.enabled) throw new HttpError(409, "Enable Studio before changing a project.", "STUDIO_DISABLED");
}

async function insertProject(client: PoolClient, stationId: string, userId: string, kind: StationKind, name: string, description: string): Promise<StudioProjectRow> {
  const document = defaultStudioProjectDocument(kind);
  const result = await client.query<StudioProjectRow>(
    `INSERT INTO studio_projects
       (station_id, name, description, draft_document, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $5)
     RETURNING id, station_id, name, description, draft_document, draft_version,
                active_release_id, NULL::integer AS active_release_number,
                NULL::integer AS active_release_source_draft_version,
                NULL::text AS active_release_document_hash,
                false AS active_release_current, created_at, updated_at`,
    [stationId, name, description, JSON.stringify(document), userId],
  );
  return result.rows[0];
}

export async function studioKindForStation(stationId: string, userId: string): Promise<StationKind> {
  const result = await query<{ station_kind: StationKind }>(
    "SELECT station_kind FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL",
    [stationId, userId],
  );
  if (!result.rows[0]) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  return result.rows[0].station_kind;
}

export async function studioOverview(stationId: string, userId: string, kind: StationKind): Promise<StudioOverview> {
  const stationResult = await query<StudioStationRow>(
    `SELECT s.id, s.name, s.station_kind, s.broadcast_state, s.access_token_ciphertext,
            settings.enabled, settings.readiness, settings.version AS settings_version
       FROM stations s
       LEFT JOIN studio_station_settings settings ON settings.station_id = s.id
      WHERE s.id = $1 AND s.owner_id = $2 AND s.station_kind = $3 AND s.deleted_at IS NULL`,
    [stationId, userId, kind],
  );
  const station = stationResult.rows[0];
  if (!station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  const projects = await query<StudioProjectSummaryRow>(
    `SELECT project.id, project.name, project.description,
             project.draft_version, project.active_release_id,
             release.release_number AS active_release_number,
             release.source_draft_version AS active_release_source_draft_version,
             release.document_hash AS active_release_document_hash,
             COALESCE(release.source_draft_version = project.draft_version
               AND release.document = project.draft_document, false) AS active_release_current,
             project.created_at, project.updated_at
       FROM studio_projects project
       LEFT JOIN studio_project_releases release ON release.id = project.active_release_id
      WHERE project.station_id = $1
       ORDER BY project.updated_at DESC, project.id
       LIMIT 100`,
    [stationId],
  );
  return {
    station: {
      id: station.id,
      name: station.name,
      kind: station.station_kind,
      broadcastState: station.broadcast_state,
      chatToken: decryptSecret(station.access_token_ciphertext),
    },
    settings: presentSettings(station),
    projects: projects.rows.map(presentProjectSummary),
  };
}

export async function setStudioEnabled(stationId: string, userId: string, kind: StationKind, enabled: boolean, expectedVersion: number): Promise<StudioSettings> {
  return transaction(async (client) => {
    const station = await lockOwnedStation(client, stationId, userId, kind);
    const settingsResult = await client.query<{ enabled: boolean; readiness: StudioSettings["readiness"]; version: number }>(
      "SELECT enabled, readiness, version FROM studio_station_settings WHERE station_id = $1 FOR UPDATE",
      [stationId],
    );
    const current = settingsResult.rows[0];
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== expectedVersion) {
      throw new HttpError(409, "Studio settings changed. Refresh and try again.", "STUDIO_SETTINGS_CONFLICT");
    }
    if (current && current.enabled === enabled) {
      return { enabled: current.enabled, readiness: current.readiness, version: current.version };
    }

    let updated: { enabled: boolean; readiness: StudioSettings["readiness"]; version: number };
    if (!current) {
      const inserted = await client.query<typeof updated>(
        `INSERT INTO studio_station_settings (station_id, enabled, readiness, updated_by_user_id)
         VALUES ($1, $2, 'WORKSPACE', $3)
         RETURNING enabled, readiness, version`,
        [stationId, enabled, userId],
      );
      updated = inserted.rows[0];
    } else {
      const changed = await client.query<typeof updated>(
        `UPDATE studio_station_settings
            SET enabled = $1, version = version + 1, updated_by_user_id = $2, updated_at = now()
          WHERE station_id = $3 AND version = $4
          RETURNING enabled, readiness, version`,
        [enabled, userId, stationId, expectedVersion],
      );
      if (!changed.rows[0]) throw new HttpError(409, "Studio settings changed. Refresh and try again.", "STUDIO_SETTINGS_CONFLICT");
      updated = changed.rows[0];
    }

    if (enabled) {
      const existingProjects = await client.query("SELECT 1 FROM studio_projects WHERE station_id = $1 LIMIT 1", [stationId]);
      if (!existingProjects.rowCount) {
        const defaultProjectName = [...`${station.name} Show`].slice(0, 120).join("");
        await insertProject(client, stationId, userId, kind, defaultProjectName, "");
      }
    }
    await writeAudit(client, stationId, userId, enabled ? "STUDIO_ENABLED" : "STUDIO_DISABLED", { settingsVersion: updated.version });
    return updated;
  });
}

export async function createStudioProject(stationId: string, userId: string, kind: StationKind, name: string, description: string): Promise<StudioProject> {
  const row = await transaction(async (client) => {
    await lockOwnedStation(client, stationId, userId, kind);
    await requireStudioEnabled(client, stationId);
    const project = await insertProject(client, stationId, userId, kind, name, description);
    await writeAudit(client, stationId, userId, "STUDIO_PROJECT_CREATED", { projectId: project.id });
    return project;
  });
  return presentProject(row);
}

export async function studioProject(stationId: string, projectId: string, userId: string, kind: StationKind): Promise<StudioProject> {
  const result = await query<StudioProjectRow>(
    `SELECT project.id, project.station_id, project.name, project.description,
             project.draft_document, project.draft_version, project.active_release_id,
             release.release_number AS active_release_number,
             release.source_draft_version AS active_release_source_draft_version,
             release.document_hash AS active_release_document_hash,
             COALESCE(release.source_draft_version = project.draft_version
               AND release.document = project.draft_document, false) AS active_release_current,
             project.created_at, project.updated_at
       FROM studio_projects project
       JOIN stations station ON station.id = project.station_id
       LEFT JOIN studio_project_releases release ON release.id = project.active_release_id
      WHERE project.id = $1 AND project.station_id = $2 AND station.owner_id = $3
        AND station.station_kind = $4 AND station.deleted_at IS NULL`,
    [projectId, stationId, userId, kind],
  );
  if (!result.rows[0]) throw new HttpError(404, "Studio project not found.", "NOT_FOUND");
  return presentProject(result.rows[0]);
}

export async function updateStudioProject(
  stationId: string,
  projectId: string,
  userId: string,
  kind: StationKind,
  changes: { name?: string; description?: string; document?: StudioProjectDocument; expectedDraftVersion: number; idempotencyKey?: string },
): Promise<StudioProject> {
  const row = await transaction(async (client) => {
    await lockOwnedStation(client, stationId, userId, kind);
    await requireStudioEnabled(client, stationId);
    const currentResult = await client.query<StudioProjectRow>(
      `SELECT project.id, project.station_id, project.name, project.description,
               project.draft_document, project.draft_version, project.active_release_id,
               release.release_number AS active_release_number,
               release.source_draft_version AS active_release_source_draft_version,
               release.document_hash AS active_release_document_hash,
               COALESCE(release.source_draft_version = project.draft_version
                 AND release.document = project.draft_document, false) AS active_release_current,
               project.created_at, project.updated_at
          FROM studio_projects project
          LEFT JOIN studio_project_releases release ON release.id = project.active_release_id
         WHERE project.id = $1 AND project.station_id = $2 FOR UPDATE OF project`,
      [projectId, stationId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new HttpError(404, "Studio project not found.", "NOT_FOUND");
    const requestHash = changes.idempotencyKey ? createHash("sha256").update(JSON.stringify({
      name: changes.name ?? null,
      description: changes.description ?? null,
      document: changes.document ?? null,
      expectedDraftVersion: changes.expectedDraftVersion,
    })).digest("hex") : null;
    if (changes.idempotencyKey && requestHash) {
      const receipt = await client.query<{ request_hash: string }>(
        "SELECT request_hash FROM studio_project_mutation_receipts WHERE project_id = $1 AND idempotency_key = $2",
        [projectId, changes.idempotencyKey],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].request_hash !== requestHash) throw new HttpError(409, "This save ID was already used for different changes.", "STUDIO_MUTATION_CONFLICT");
        return current;
      }
    }
    if (current.draft_version !== changes.expectedDraftVersion) {
      throw new HttpError(409, "The project changed. Refresh and try again.", "STUDIO_PROJECT_CONFLICT");
    }
    if (changes.document) {
      const currentDocument = studioProjectDocumentSchema.parse(current.draft_document);
      if (changes.document.schemaVersion !== currentDocument.schemaVersion) {
        throw new HttpError(409, "Use the dedicated project upgrade operation to change document schemas.", "STUDIO_PROJECT_SCHEMA_TRANSITION_REQUIRED");
      }
    }
    if (changes.document && changes.document.output.kind !== kind) {
      throw new HttpError(409, "The project output must match the station type.", "STUDIO_OUTPUT_MISMATCH");
    }
    const assetReferences = changes.document
      ? await validateOwnerAssetReferences(client, userId, projectAssetReferences(changes.document))
      : null;
    const updated = await client.query<StudioProjectRow>(
      `UPDATE studio_projects
          SET name = COALESCE($1, name), description = COALESCE($2, description),
              draft_document = COALESCE($3::jsonb, draft_document), draft_version = draft_version + 1,
              updated_by_user_id = $4, updated_at = now()
        WHERE id = $5 AND station_id = $6 AND draft_version = $7
        RETURNING id, station_id, name, description, draft_document, draft_version,
                   active_release_id, NULL::integer AS active_release_number,
                   NULL::integer AS active_release_source_draft_version,
                   NULL::text AS active_release_document_hash,
                   false AS active_release_current, created_at, updated_at`,
      [changes.name ?? null, changes.description ?? null, changes.document ? JSON.stringify(changes.document) : null, userId, projectId, stationId, changes.expectedDraftVersion],
    );
    if (!updated.rows[0]) throw new HttpError(409, "The project changed. Refresh and try again.", "STUDIO_PROJECT_CONFLICT");
    if (assetReferences) await replaceDraftAssetReferences(client, projectId, updated.rows[0].draft_version, assetReferences);
    if (changes.idempotencyKey && requestHash) {
      await client.query(
        `INSERT INTO studio_project_mutation_receipts
           (project_id, actor_user_id, idempotency_key, request_hash, expected_draft_version, applied_draft_version)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [projectId, userId, changes.idempotencyKey, requestHash, changes.expectedDraftVersion, updated.rows[0].draft_version],
      );
    }
    await writeAudit(client, stationId, userId, "STUDIO_PROJECT_UPDATED", { projectId, draftVersion: updated.rows[0].draft_version });
    return {
      ...updated.rows[0],
      active_release_number: current.active_release_number,
      active_release_source_draft_version: current.active_release_source_draft_version,
      active_release_document_hash: current.active_release_document_hash,
      active_release_current: false,
    };
  });
  return presentProject(row);
}

export async function upgradeTvStudioProjectToV2(
  stationId: string,
  projectId: string,
  userId: string,
  expectedDraftVersion: number,
  idempotencyKey: string,
): Promise<StudioProject> {
  const requestHash = createHash("sha256")
    .update("studio-tv-project-upgrade-to-v2\0")
    .update(JSON.stringify({ expectedDraftVersion }))
    .digest("hex");
  const row = await transaction(async (client) => {
    await lockOwnedStation(client, stationId, userId, "TV");
    await requireStudioEnabled(client, stationId);
    const currentResult = await client.query<StudioProjectRow>(
      `SELECT project.id, project.station_id, project.name, project.description,
               project.draft_document, project.draft_version, project.active_release_id,
               release.release_number AS active_release_number,
               release.source_draft_version AS active_release_source_draft_version,
               release.document_hash AS active_release_document_hash,
               COALESCE(release.source_draft_version = project.draft_version
                 AND release.document = project.draft_document, false) AS active_release_current,
               project.created_at, project.updated_at
          FROM studio_projects project
          LEFT JOIN studio_project_releases release ON release.id = project.active_release_id
         WHERE project.id = $1 AND project.station_id = $2 FOR UPDATE OF project`,
      [projectId, stationId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new HttpError(404, "Studio project not found.", "NOT_FOUND");

    const receipt = await client.query<{ request_hash: string }>(
      "SELECT request_hash FROM studio_project_mutation_receipts WHERE project_id = $1 AND idempotency_key = $2",
      [projectId, idempotencyKey],
    );
    if (receipt.rows[0]) {
      if (receipt.rows[0].request_hash !== requestHash) {
        throw new HttpError(409, "This save ID was already used for different changes.", "STUDIO_MUTATION_CONFLICT");
      }
      return current;
    }
    if (current.draft_version !== expectedDraftVersion) {
      throw new HttpError(409, "The project changed. Refresh and try again.", "STUDIO_PROJECT_CONFLICT");
    }
    const parsed = studioProjectDocumentSchema.safeParse(current.draft_document);
    if (!parsed.success || parsed.data.schemaVersion !== 1 || parsed.data.output.kind !== "TV") {
      throw new HttpError(409, "Only V1 TV Studio projects can be upgraded to V2.", "STUDIO_TV_PROJECT_UPGRADE_NOT_APPLICABLE");
    }
    const upgradedDocument = upgradeTvStudioProjectDocumentV1ToV2(parsed.data);
    const assetReferences = await validateOwnerAssetReferences(client, userId, projectAssetReferences(upgradedDocument));
    const updated = await client.query<StudioProjectRow>(
      `UPDATE studio_projects
          SET draft_document = $1::jsonb, draft_version = draft_version + 1,
              updated_by_user_id = $2, updated_at = now()
        WHERE id = $3 AND station_id = $4 AND draft_version = $5
        RETURNING id, station_id, name, description, draft_document, draft_version,
                  active_release_id, NULL::integer AS active_release_number,
                  NULL::integer AS active_release_source_draft_version,
                  NULL::text AS active_release_document_hash,
                  false AS active_release_current, created_at, updated_at`,
      [JSON.stringify(upgradedDocument), userId, projectId, stationId, expectedDraftVersion],
    );
    if (!updated.rows[0]) throw new HttpError(409, "The project changed. Refresh and try again.", "STUDIO_PROJECT_CONFLICT");
    await replaceDraftAssetReferences(client, projectId, updated.rows[0].draft_version, assetReferences);
    await client.query(
      `INSERT INTO studio_project_mutation_receipts
         (project_id, actor_user_id, idempotency_key, request_hash, expected_draft_version, applied_draft_version)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, userId, idempotencyKey, requestHash, expectedDraftVersion, updated.rows[0].draft_version],
    );
    await writeAudit(client, stationId, userId, "STUDIO_TV_PROJECT_UPGRADED", {
      projectId,
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      draftVersion: updated.rows[0].draft_version,
    });
    return {
      ...updated.rows[0],
      active_release_number: current.active_release_number,
      active_release_source_draft_version: current.active_release_source_draft_version,
      active_release_document_hash: current.active_release_document_hash,
      active_release_current: false,
    };
  });
  return presentProject(row);
}

export async function publishStudioProject(
  stationId: string,
  projectId: string,
  userId: string,
  kind: StationKind,
  expectedDraftVersion: number,
  idempotencyKey: string = randomUUID(),
): Promise<StudioProject> {
  const row = await transaction(async (client) => {
    await lockOwnedStation(client, stationId, userId, kind);
    await requireStudioEnabled(client, stationId);
    const projectResult = await client.query<StudioProjectRow>(
      `SELECT project.id, project.station_id, project.name, project.description,
               project.draft_document, project.draft_version, project.active_release_id,
               release.release_number AS active_release_number,
               release.source_draft_version AS active_release_source_draft_version,
               release.document_hash AS active_release_document_hash,
               COALESCE(release.source_draft_version = project.draft_version
                 AND release.document = project.draft_document, false) AS active_release_current,
               project.created_at, project.updated_at
          FROM studio_projects project
          LEFT JOIN studio_project_releases release ON release.id = project.active_release_id
         WHERE project.id = $1 AND project.station_id = $2 FOR UPDATE OF project`,
      [projectId, stationId],
    );
    const project = projectResult.rows[0];
    if (!project) throw new HttpError(404, "Studio project not found.", "NOT_FOUND");
    const existingResult = await client.query<{ id: string; source_draft_version: number }>(
       `SELECT id, release_number, source_draft_version
          FROM studio_project_releases
         WHERE project_id = $1 AND idempotency_key = $2`,
      [projectId, idempotencyKey],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.source_draft_version !== expectedDraftVersion) {
        throw new HttpError(409, "The project changed. Refresh and try again.", "STUDIO_PROJECT_CONFLICT");
      }
      return project;
    }
    if (project.draft_version !== expectedDraftVersion) {
      throw new HttpError(409, "The project changed. Refresh and try again.", "STUDIO_PROJECT_CONFLICT");
    }
    const existingDraftResult = await client.query<{ id: string }>(
      `SELECT id FROM studio_project_releases
        WHERE project_id = $1 AND source_draft_version = $2`,
      [projectId, expectedDraftVersion],
    );
    if (existingDraftResult.rows[0]) return project;
    const document = studioProjectDocumentSchema.parse(project.draft_document);
    if (document.output.kind !== kind) throw new HttpError(409, "The project output must match the station type.", "STUDIO_OUTPUT_MISMATCH");
    if (kind === "TV" && document.schemaVersion !== 2) {
      throw new HttpError(409, "Upgrade this TV production project to V2 before publishing it.", "STUDIO_TV_PROJECT_V2_REQUIRED");
    }
    const assetReferences = await validateOwnerAssetReferences(client, userId, projectAssetReferences(document));
    const releaseNumberResult = await client.query<{ next_release_number: number }>(
      "SELECT COALESCE(MAX(release_number), 0) + 1 AS next_release_number FROM studio_project_releases WHERE project_id = $1",
      [projectId],
    );
    const releaseNumber = Number(releaseNumberResult.rows[0].next_release_number);
    const serialized = JSON.stringify(document);
    const hash = createHash("sha256").update(serialized).digest("hex");
    const releaseResult = await client.query<{ id: string; release_number: number }>(
      `INSERT INTO studio_project_releases
         (project_id, release_number, source_draft_version, idempotency_key, document, document_hash, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING id, release_number`,
      [projectId, releaseNumber, project.draft_version, idempotencyKey, serialized, hash, userId],
    );
    for (const reference of assetReferences) {
      await client.query(
        `INSERT INTO studio_release_asset_references
           (release_id, reference_key, media_asset_id, media_asset_variant_id)
         VALUES ($1, $2, $3, $4)`,
        [releaseResult.rows[0].id, reference.key, reference.assetId, reference.variantId],
      );
    }
    const updated = await client.query<StudioProjectRow>(
      `UPDATE studio_projects
          SET active_release_id = $1, updated_by_user_id = $2, updated_at = now()
        WHERE id = $3
        RETURNING id, station_id, name, description, draft_document, draft_version,
                   active_release_id, NULL::integer AS active_release_number,
                   NULL::integer AS active_release_source_draft_version,
                   NULL::text AS active_release_document_hash,
                   false AS active_release_current, created_at, updated_at`,
      [releaseResult.rows[0].id, userId, projectId],
    );
    if (!updated.rows[0]) throw new HttpError(404, "Studio project not found.", "NOT_FOUND");
    await writeAudit(client, stationId, userId, "STUDIO_PROJECT_PUBLISHED", {
      projectId,
      releaseId: releaseResult.rows[0].id,
      releaseNumber,
      documentHash: hash,
    });
    return {
      ...updated.rows[0],
      active_release_number: releaseResult.rows[0].release_number,
      active_release_source_draft_version: project.draft_version,
      active_release_document_hash: hash,
      active_release_current: true,
    };
  });
  return presentProject(row);
}
