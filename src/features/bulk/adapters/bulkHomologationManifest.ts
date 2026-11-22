const sha1Pattern = /^[0-9a-f]{40}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/i;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i;
const homologationBrand: unique symbol = Symbol("approved-bulk-release-manifest");

export interface BulkHomologationManifest {
  schemaVersion: 1;
  approvalStatus: "APPROVED";
  releaseId: string;
  openApiVersion: string;
  asyncApiVersion: string;
  docsSha: string;
  backendSha: string;
  catalogConsumerSha: string;
  reconciliationOperation: "GET /api/v1/carga-masiva/productos/importaciones/por-correlacion/{correlationId}";
  retryProtocol: "BULK_RETRY_V1";
  retryDomains: ["CATALOGO"];
  concurrentReplayIdempotency: true;
  authenticatedIntegrationEvidenceSha256: string;
  concurrentReplayEvidenceSha256: string;
  resumeProtocolEvidenceSha256: string;
}

export interface VerifiedBulkHomologationManifest extends BulkHomologationManifest {
  readonly [homologationBrand]: true;
}

const manifestKeys = [
  "schemaVersion",
  "approvalStatus",
  "releaseId",
  "openApiVersion",
  "asyncApiVersion",
  "docsSha",
  "backendSha",
  "catalogConsumerSha",
  "reconciliationOperation",
  "retryProtocol",
  "retryDomains",
  "concurrentReplayIdempotency",
  "authenticatedIntegrationEvidenceSha256",
  "concurrentReplayEvidenceSha256",
  "resumeProtocolEvidenceSha256",
] as const;

function decodeManifest(value: unknown): BulkHomologationManifest | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join("\n") !== [...manifestKeys].sort().join("\n")) return undefined;
  if (item.schemaVersion !== 1 || item.approvalStatus !== "APPROVED") return undefined;
  if (typeof item.releaseId !== "string" || !item.releaseId.trim()) return undefined;
  if (typeof item.openApiVersion !== "string" || !versionPattern.test(item.openApiVersion)) return undefined;
  if (typeof item.asyncApiVersion !== "string" || !versionPattern.test(item.asyncApiVersion)) return undefined;
  if (item.openApiVersion.toLowerCase() === "0.7.0-rc.2" || item.asyncApiVersion.toLowerCase() === "0.7.0-rc.2") return undefined;
  if (typeof item.docsSha !== "string" || !sha1Pattern.test(item.docsSha)) return undefined;
  if (typeof item.backendSha !== "string" || !sha1Pattern.test(item.backendSha)) return undefined;
  if (typeof item.catalogConsumerSha !== "string" || !sha1Pattern.test(item.catalogConsumerSha)) return undefined;
  if (item.reconciliationOperation !== "GET /api/v1/carga-masiva/productos/importaciones/por-correlacion/{correlationId}" ||
      item.retryProtocol !== "BULK_RETRY_V1" || JSON.stringify(item.retryDomains) !== JSON.stringify(["CATALOGO"]) ||
      item.concurrentReplayIdempotency !== true) return undefined;
  if (typeof item.authenticatedIntegrationEvidenceSha256 !== "string" || !sha256Pattern.test(item.authenticatedIntegrationEvidenceSha256)) return undefined;
  if (typeof item.concurrentReplayEvidenceSha256 !== "string" || !sha256Pattern.test(item.concurrentReplayEvidenceSha256)) return undefined;
  if (typeof item.resumeProtocolEvidenceSha256 !== "string" || !sha256Pattern.test(item.resumeProtocolEvidenceSha256)) return undefined;
  return item as unknown as BulkHomologationManifest;
}

function canonicalManifest(manifest: BulkHomologationManifest): string {
  return JSON.stringify(Object.fromEntries(manifestKeys.map((key) => [key, manifest[key]])));
}

/**
 * Verifies a release-pipeline manifest against its separately authorized release id
 * and digest. A feature flag, URL, well-formed SHA, or untrusted JSON cannot enable
 * a Bulk capability by itself.
 */
export async function verifyBulkHomologationManifest(input: {
  manifestJson?: string;
  authorizedReleaseId?: string;
  authorizedManifestSha256?: string;
}): Promise<VerifiedBulkHomologationManifest | undefined> {
  if (!input.manifestJson || !input.authorizedReleaseId || !input.authorizedManifestSha256 || !sha256Pattern.test(input.authorizedManifestSha256)) return undefined;
  let decoded: unknown;
  try { decoded = JSON.parse(input.manifestJson) as unknown; }
  catch { return undefined; }
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
