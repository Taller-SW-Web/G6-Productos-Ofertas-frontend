export type Int08L1Scenario = {
  id: string;
  requires: string[];
  status: "READY_B" | "BLOCKED_DEPENDENCY";
  blockers: string[];
};

export function preflightInt08L1(
  env?: Record<string, string | undefined>,
): Int08L1Scenario[];
