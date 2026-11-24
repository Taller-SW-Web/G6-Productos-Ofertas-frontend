export type Perf06CacheMode = "cold" | "warm";
export type Perf06SubjectRole = "baseline" | "candidate" | "reference";
export type Perf06RunConfig = {
  sessions: number;
  durationSeconds: number;
  repetition: number;
  cacheMode: Perf06CacheMode;
  subjectRole: Perf06SubjectRole;
};

export function parsePerf06Run(env: Record<string, string | undefined>): Perf06RunConfig;
export function percentile(values: number[], fraction: number): number | null;
export function evaluatePerf06Run(run: {
  cacheMode: Perf06CacheMode;
  cacheHits: number;
  serviceWorkerHits: number;
  coldOracleVerified: boolean;
  requestCount: number;
  unexpectedErrors: number;
  unexpectedOrigins: number;
  startSkewMs: number | null;
  minimumActiveSessionMs?: number;
  requiredDurationMs?: number;
  configuredSessions: number;
  sessionsStarted: number;
  maxSessionsActive: number;
  failedJourneys: number;
  completedJourneys: number;
}): {
  status: "MEASURED" | "FAIL" | "INCONCLUSIVE";
  cacheValid: boolean;
  startSynchronized: boolean;
  durationValid: boolean;
  sessionConcurrencyValid: boolean;
  journeyOutcomeValid: boolean;
  errorRate: number;
};
