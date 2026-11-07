import { test } from "@playwright/test";

// Evidence always belongs to this run; versioned captures require manual review.
export function evidencePath(file: string) {
  return test.info().outputPath(file);
}
