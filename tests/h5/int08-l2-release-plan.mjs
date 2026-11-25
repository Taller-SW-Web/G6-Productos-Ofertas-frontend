export const INT08_L2_RELEASE_PLAN = Object.freeze({
  schemaVersion: 1,
  caseId: 'INT08-L2-G7-APIM',
  status: 'WAIT_C_G7_APIM',
  evidenceLevel: 'L2',
  execution: 'explicit opt-in only; never discovered by the ordinary Playwright configuration',
  steps: Object.freeze([
    Object.freeze({ scenarioId: 'INT08-L2-G7-LOGIN', oracle: 'authorized release identity completes G7 login and session validation; JWT, cookies, and credentials are never captured' }),
    Object.freeze({ scenarioId: 'INT08-L2-APIM-CATALOG-READ', oracle: 'real browser calls the approved APIM Catalog route; HTTP result and correlation are checked against the release contract' }),
    Object.freeze({ scenarioId: 'INT08-L2-APIM-202-NONTERMINAL', oracle: 'an admitted 202 remains nonterminal until the normative status read returns HTTP 200 and terminal domain states' }),
  ]),
  requiredEvidenceFields: Object.freeze([
    'scenario_id', 'status', 'hostname_alias', 'hostname_sha256', 'release_sha', 'gateway_sha', 'service_sha',
    'correlation_id', 'identity_alias', 'http_status', 'authorization_category', 'evidence_level',
  ]),
});

const requiredActivation = Object.freeze([
  'G6_H5_INT08_L2_RELEASE_APPROVED',
  'G6_H5_INT08_L2_IDENTITY_HARNESS',
  'G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256',
  'G6_H5_INT08_L2_RELEASE_SHA',
  'G6_H5_INT08_L2_GATEWAY_SHA',
  'G6_H5_INT08_L2_SERVICE_SHA',
]);

export function preflightInt08L2Release(env = process.env) {
  const missing = requiredActivation.filter(name => !env[name]);
  if (env.G6_H5_INT08_L2_RELEASE_APPROVED !== '1') missing.push('RELEASE_APPROVAL_REQUIRED');
  if (env.G6_H5_INT08_L2_IDENTITY_HARNESS !== '1') missing.push('OWNER_AUTHORIZED_IDENTITY_HARNESS_REQUIRED');
  return {
    status: 'WAIT_C_G7_APIM',
    reason: 'REAL_RELEASE_LOGIN_AND_APIM_ARE_CERTIFICATION_ONLY',
    serviceCalls: 0,
    missing: [...new Set(missing)],
    requiredEvidenceFields: [...INT08_L2_RELEASE_PLAN.requiredEvidenceFields],
  };
}
