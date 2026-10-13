import { auditEntries } from "../mocks/entries";
import {
  AuditFailure,
  type AuditEntry,
  type AuditFilters,
  type AuditJob,
  type AuditRepository,
} from "../services/auditRepository";

export function matches(entry: AuditEntry, filters: AuditFilters) {
  return (
    (!filters.sku || entry.sku === filters.sku) &&
    (!filters.usuarioId || entry.actorId === filters.usuarioId) &&
    (!filters.canal || entry.origin === filters.canal) &&
    (!filters.batchId || entry.batchId === filters.batchId) &&
    (!filters.desde || Date.parse(entry.at) >= Date.parse(filters.desde)) &&
    (!filters.hasta || Date.parse(entry.at) <= Date.parse(filters.hasta))
  );
}
export function createMockAuditRepository(): AuditRepository {
  const entries = structuredClone(auditEntries).sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  const jobs = new Map<string, AuditJob>();
  let sequence = 0;
  return {
    async list(query, signal) {
      signal.throwIfAborted();
      const selected = entries.filter((entry) => matches(entry, query));
      const pages = Math.ceil(selected.length / query.size);
      const page = Math.min(query.page, pages || 1);
      return {
        items: structuredClone(
          selected.slice((page - 1) * query.size, page * query.size),
        ),
        page,
        size: query.size,
        total: selected.length,
        pages,
      };
    },
    async detail(id, signal) {
      signal.throwIfAborted();
      return structuredClone(entries.find((entry) => entry.id === id) ?? null);
    },
    async requestExport(input, signal) {
      signal.throwIfAborted();
      const count = entries.filter((entry) =>
        matches(entry, input.filters),
      ).length;
      if (count > (input.format === "CSV" ? 100000 : 500))
        throw new AuditFailure(
          "limit",
          "El resultado supera el límite del formato solicitado. Reduce los filtros.",
        );
      const job: AuditJob = {
        id: `exp-014-${input.format.toLowerCase()}-${++sequence}`,
        format: input.format,
        status: "QUEUED",
        createdAt: "2026-10-02T12:00:00Z",
        completedAt: null,
        fileAvailable: false,
      };
      jobs.set(job.id, job);
      return structuredClone(job);
    },
    async getExport(id, signal) {
      signal.throwIfAborted();
      const job = jobs.get(id);
      if (!job) return null;
      if (job.status === "QUEUED") job.status = "PROCESSING";
      else if (job.status === "PROCESSING") {
        job.status = "COMPLETED";
        job.completedAt = "2026-10-02T12:00:15Z";
        job.fileAvailable = true;
      }
      return structuredClone(job);
    },
    async download(id, signal) {
      const job = jobs.get(id);
      if (!job || job.status !== "COMPLETED" || !job.fileAvailable)
        throw new AuditFailure(
          "unavailable",
          "El archivo todavía no está disponible.",
        );
      // Prepared local samples. No backend file or PDF is generated in the browser.
      const source =
        job.format === "CSV"
          ? new URL("../mocks/files/audit-demo.csv", import.meta.url)
          : new URL("../mocks/files/audit-demo.pdf", import.meta.url);
      const response = await fetch(source, { signal });
      if (!response.ok)
        throw new AuditFailure(
          "unavailable",
          "No se pudo descargar el archivo de muestra.",
        );
      return {
        data: await response.blob(),
        filename: `muestra-auditoria.${job.format.toLowerCase()}`,
      };
    },
  };
}
