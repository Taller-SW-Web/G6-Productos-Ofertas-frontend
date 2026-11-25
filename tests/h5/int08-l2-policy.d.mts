export type Int08L2HostManifest = { preview: string[]; g7: string[]; apim: string[] };
export type Int08L2ResourceIndex = { schemaVersion: 1; resources: Array<Record<string, unknown>> };
export type Int08L2Preflight = {
  status: 'READY_C' | 'BLOCKED_DEPENDENCY';
  missing: string[];
  metadata: { approvedHostsSha256: string | null; resourceIndexSha256: string | null; releaseSha: string | null; gatewaySha: string | null; serviceSha: string | null };
  hosts: Int08L2HostManifest | null;
  resourceIndex: Int08L2ResourceIndex | null;
};
export function preflightInt08L2(env?: Record<string, string | undefined>): Promise<Int08L2Preflight>;
