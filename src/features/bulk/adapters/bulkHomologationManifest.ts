const sha1Pattern = /^[0-9a-f]{40}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/i;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i;
const homologationBrand: unique symbol = Symbol("approved-bulk-release-manifest");

export interface BulkHomologationManifest {
  schemaVersion: 2;
  approvalStatus: "APPROVED";
  releaseId: string;
  openApiVersion: string;
  asyncApiVersion: string;
  docsSha: string;
  backendSha: string;
  reconciliation?: {
    operation: "GET /api/v1/carga-masiva/productos/importaciones/por-correlacion/{correlationId}";
    authenticatedIntegrationEvidenceSha256: string;
  };
  replay?: {
    concurrentIdempotency: true;
    evidenceSha256: string;
  };
  catalogRetry?: {
    catalogConsumerSha: string;
    protocol: "BULK_RETRY_V1";
    domains: ["CATALOGO"];
    v4v2EvidenceSha256: string;
  };
}

export interface VerifiedBulkHomologationManifest extends BulkHomologationManifest {
  readonly [homologationBrand]: true;
}

const baseKeys = ["schemaVersion", "approvalStatus", "releaseId", "openApiVersion", "asyncApiVersion", "docsSha", "backendSha"];
const capabilityKeys = ["reconciliation", "replay", "catalogRetry"];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const keysAre = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");

function decodeManifest(value: unknown): BulkHomologationManifest | undefined {
  if (!isRecord(value) || value.schemaVersion !== 2 || value.approvalStatus !== "APPROVED" ||
      typeof value.releaseId !== "string" || !value.releaseId.trim() ||
      typeof value.openApiVersion !== "string" || !versionPattern.test(value.openApiVersion) ||
      typeof value.asyncApiVersion !== "string" || !versionPattern.test(value.asyncApiVersion) ||
      value.openApiVersion !== "0.7.0-rc.3" || value.asyncApiVersion !== "0.7.0-rc.3" ||
      typeof value.docsSha !== "string" || !sha1Pattern.test(value.docsSha) ||
      typeof value.backendSha !== "string" || !sha1Pattern.test(value.backendSha) ||
      !Object.keys(value).every((key) => [...baseKeys, ...capabilityKeys].includes(key))) return undefined;

  if (value.reconciliation !== undefined) {
    const item = value.reconciliation;
    if (!isRecord(item) || !keysAre(item, ["operation", "authenticatedIntegrationEvidenceSha256"]) ||
        item.operation !== "GET /api/v1/carga-masiva/productos/importaciones/por-correlacion/{correlationId}" ||
        typeof item.authenticatedIntegrationEvidenceSha256 !== "string" || !sha256Pattern.test(item.authenticatedIntegrationEvidenceSha256)) return undefined;
  }
  if (value.replay !== undefined) {
    const item = value.replay;
    if (!isRecord(item) || !keysAre(item, ["concurrentIdempotency", "evidenceSha256"]) || item.concurrentIdempotency !== true ||
        typeof item.evidenceSha256 !== "string" || !sha256Pattern.test(item.evidenceSha256)) return undefined;
  }
  if (value.catalogRetry !== undefined) {
    const item = value.catalogRetry;
    if (!isRecord(item) || !keysAre(item, ["catalogConsumerSha", "protocol", "domains", "v4v2EvidenceSha256"]) ||
        typeof item.catalogConsumerSha !== "string" || !sha1Pattern.test(item.catalogConsumerSha) || item.protocol !== "BULK_RETRY_V1" ||
        JSON.stringify(item.domains) !== JSON.stringify(["CATALOGO"]) || typeof item.v4v2EvidenceSha256 !== "string" || !sha256Pattern.test(item.v4v2EvidenceSha256)) return undefined;
  }
  return value as unknown as BulkHomologationManifest;
}

function canonicalManifest(manifest: BulkHomologationManifest): string {
  return JSON.stringify(Object.fromEntries([...baseKeys, ...capabilityKeys].filter((key) => key in manifest).map((key) => [key, manifest[key as keyof BulkHomologationManifest]])));
}

/** Validates an authorized release manifest; flags and public URLs are never evidence. */
export async function verifyBulkHomologationManifest(input: {
  manifestJson?: string;
  authorizedReleaseId?: string;
  authorizedManifestSha256?: string;
}): Promise<VerifiedBulkHomologationManifest | undefined> {
  if (!input.manifestJson || !input.authorizedReleaseId || !input.authorizedManifestSha256 || !sha256Pattern.test(input.authorizedManifestSha256)) return undefined;
  let decoded: unknown;
  try { decoded = JSON.parse(input.manifestJson) as unknown; } catch { return undefined; }
  const manifest = decodeManifest(decoded);
  if (!manifest || manifest.releaseId !== input.authorizedReleaseId) return undefined;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalManifest(manifest))));
  const actualSha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualSha256 !== input.authorizedManifestSha256.toLowerCase()) return undefined;
  return Object.freeze({ ...manifest, [homologationBrand]: true as const });
}

export function isVerifiedBulkHomologationManifest(value: unknown): value is VerifiedBulkHomologationManifest {
  return Boolean(value && typeof value === "object" && (value as Partial<VerifiedBulkHomologationManifest>)[homologationBrand] === true);
}

export function hasBulkCapabilityEvidence(manifest: VerifiedBulkHomologationManifest | undefined, capability: "reconciliation" | "replay" | "catalogRetry"): boolean {
  if (!manifest || !isVerifiedBulkHomologationManifest(manifest)) return false;
  if (capability === "reconciliation") return Boolean(manifest.reconciliation);
  if (capability === "replay") return Boolean(manifest.reconciliation && manifest.replay);
  return Boolean(manifest.catalogRetry);
}
