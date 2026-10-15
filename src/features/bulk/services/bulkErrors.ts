export type BulkFailureCategory =
  | "configuration"
  | "rejected"
  | "communication"
  | "unknown";

export class BulkRepositoryError extends Error {
  constructor(
    message: string,
    readonly category: BulkFailureCategory,
  ) {
    super(message);
    this.name = "BulkRepositoryError";
  }
}
