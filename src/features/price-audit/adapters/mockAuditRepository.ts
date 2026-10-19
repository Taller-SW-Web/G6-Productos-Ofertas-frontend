import { auditEntries } from "../mocks/entries";
import type { StoredAuditJob } from "../mocks/pricingChanges";
import { displayAuditId } from "../services/auditPresentation";
import {
  AuditFailure,
  type AuditEntry,
  type AuditFilters,
  type AuditFormat,
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

function escapeCsvValue(val: string | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateAuditCsv(items: AuditEntry[]): Blob {
  const header =
    "id_auditoria,sku,product_id,tipo_precio,precio_anterior,precio_nuevo,variacion_porcentual,tipo_operacion,canal_origen,motivo_cambio,batch_id,usuario_id,usuario_email,ip_origen,timestamp";
  const rows = items.map((entry) => {
    const seatId = displayAuditId(entry.id);
    const userId =
      entry.actorId === "demo-pricing" ? "" : (entry.actorId ?? "");
    return [
      escapeCsvValue(seatId),
      escapeCsvValue(entry.sku),
      escapeCsvValue(entry.productId),
      escapeCsvValue(entry.priceType),
      escapeCsvValue(entry.before),
      escapeCsvValue(entry.after),
      escapeCsvValue(entry.variation),
      escapeCsvValue(entry.operation),
      escapeCsvValue(entry.origin),
      escapeCsvValue(entry.reason),
      escapeCsvValue(entry.batchId),
      escapeCsvValue(userId),
      escapeCsvValue(entry.email),
      escapeCsvValue(entry.ip),
      escapeCsvValue(entry.at),
    ].join(",");
  });
  const csvText = [header, ...rows].join("\n") + "\n";
  return new Blob([csvText], { type: "text/csv;charset=utf-8" });
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function generateAuditPdf(items: AuditEntry[], filters: AuditFilters): Blob {
  const ITEMS_PER_PAGE = 30;
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));

  const filterDesc: string[] = [];
  if (filters.sku) filterDesc.push(`SKU: ${filters.sku}`);
  if (filters.desde) filterDesc.push(`Desde: ${filters.desde}`);
  if (filters.hasta) filterDesc.push(`Hasta: ${filters.hasta}`);
  if (filters.canal) filterDesc.push(`Canal: ${filters.canal}`);
  if (filters.usuarioId && filters.usuarioId !== "demo-pricing") filterDesc.push(`Usuario: ${filters.usuarioId}`);
  if (filters.batchId) filterDesc.push(`Lote: ${filters.batchId}`);

  const pagesLines: string[][] = [];

  for (let p = 0; p < totalPages; p++) {
    const pageLines: string[] = [];
    if (p === 0) {
      pageLines.push("AUDITORIA DE PRECIOS");
      pageLines.push(`Generado: ${new Date().toISOString()}`);
      pageLines.push(`Total de registros: ${items.length}`);
      if (filterDesc.length > 0) {
        pageLines.push(`Filtros: ${filterDesc.join(" | ")}`);
      }
      pageLines.push("--------------------------------------------------------------------------------");
    } else {
      pageLines.push(`AUDITORIA DE PRECIOS — Página ${p + 1} de ${totalPages}`);
      pageLines.push("--------------------------------------------------------------------------------");
    }

    const chunk = items.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE);
    if (chunk.length === 0 && p === 0) {
      pageLines.push("No se encontraron registros.");
    } else {
      for (const item of chunk) {
        const seat = displayAuditId(item.id);
        const user = item.actorId === "demo-pricing" ? "No informado" : (item.actorId ?? "Sin usuario");
        const diff = item.before !== null && item.after !== null ? `${item.before} -> ${item.after}` : (item.after ?? "Retiro");
        pageLines.push(`Asiento: ${seat} | SKU: ${item.sku} | ${item.priceType} | ${diff} | ${item.at} | ${user}`);
      }
    }
    pagesLines.push(pageLines);
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  offsets.push(pdf.length);
  pdf += "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";

  const kids: string[] = [];
  for (let p = 0; p < totalPages; p++) {
    kids.push(`${4 + 2 * p} 0 R`);
  }

  offsets.push(pdf.length);
  pdf += `2 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${totalPages} >>\nendobj\n`;

  offsets.push(pdf.length);
  pdf += "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  for (let p = 0; p < totalPages; p++) {
    const pageObjId = 4 + 2 * p;
    const contentObjId = 5 + 2 * p;
    const lines = pagesLines[p] ?? [];

    let streamContent = "BT\n/F1 9 Tf\n14 TL\n40 760 Td\n";
    lines.forEach((line, i) => {
      const escaped = escapePdfText(line);
      if (p === 0 && i === 0) {
        streamContent += `/F1 14 Tf (${escaped}) Tj\n/F1 9 Tf\nT*\n`;
      } else if (p > 0 && i === 0) {
        streamContent += `/F1 12 Tf (${escaped}) Tj\n/F1 9 Tf\nT*\n`;
      } else {
        streamContent += `(${escaped}) Tj\nT*\n`;
      }
    });
    streamContent += "ET\n";

    const streamBytes = new TextEncoder().encode(streamContent);
    const streamLength = streamBytes.length;

    offsets.push(pdf.length);
    pdf += `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`;

    offsets.push(pdf.length);
    pdf += `${contentObjId} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`;
  }

  const totalObjs = 4 + 2 * totalPages;
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([pdf], { type: "application/pdf" });
}

export interface MockAuditJobsStore {
  getJob: (id: string) => StoredAuditJob | null;
  saveJob: (job: StoredAuditJob) => boolean;
  nextJobId: (format: AuditFormat) => string;
}

export function createMockAuditRepository(
  changes: () => AuditEntry[] = () => [],
  jobsStore?: MockAuditJobsStore,
): AuditRepository {
  const entries = () => [...changes(), ...structuredClone(auditEntries)].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  const fallbackJobs = new Map<string, StoredAuditJob>();
  let fallbackSequence = 0;

  const getJob = (id: string): StoredAuditJob | null => {
    if (jobsStore) return jobsStore.getJob(id);
    return fallbackJobs.get(id) ?? null;
  };
  const saveJob = (job: StoredAuditJob): boolean => {
    if (jobsStore) return jobsStore.saveJob(job);
    fallbackJobs.set(job.id, job);
    return true;
  };
  const nextJobId = (format: AuditFormat): string => {
    if (jobsStore) return jobsStore.nextJobId(format);
    return `exp-014-${format.toLowerCase()}-${++fallbackSequence}`;
  };

  return {
    async list(query, signal) {
      signal.throwIfAborted();
      const selected = entries().filter((entry) => matches(entry, query));
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
      return structuredClone(entries().find((entry) => entry.id === id) ?? null);
    },
    async requestExport(input, signal) {
      signal.throwIfAborted();
      const count = entries().filter((entry) =>
        matches(entry, input.filters),
      ).length;
      if (count > (input.format === "CSV" ? 100000 : 500))
        throw new AuditFailure(
          "limit",
          "El resultado supera el límite del formato solicitado. Reduce los filtros.",
        );
      const jobId = nextJobId(input.format);
      const job: StoredAuditJob = {
        id: jobId,
        format: input.format,
        status: "QUEUED",
        createdAt: "2026-10-02T12:00:00Z",
        completedAt: null,
        fileAvailable: false,
        filters: structuredClone(input.filters),
      };
      const ok = saveJob(job);
      if (!ok) {
        throw new AuditFailure(
          "unavailable",
          "No se pudo guardar la solicitud de exportación en el almacenamiento.",
        );
      }
      return structuredClone(job);
    },
    async getExport(id, signal) {
      signal.throwIfAborted();
      const job = getJob(id);
      if (!job) return null;
      const prevStatus = job.status;
      const prevCompletedAt = job.completedAt;
      const prevFileAvailable = job.fileAvailable;
      let changed = false;
      if (job.status === "QUEUED") {
        job.status = "PROCESSING";
        changed = true;
      } else if (job.status === "PROCESSING") {
        job.status = "COMPLETED";
        job.completedAt = "2026-10-02T12:00:15Z";
        job.fileAvailable = true;
        changed = true;
      }
      if (changed) {
        const ok = saveJob(job);
        if (!ok) {
          job.status = prevStatus;
          job.completedAt = prevCompletedAt;
          job.fileAvailable = prevFileAvailable;
          throw new AuditFailure(
            "unavailable",
            "No se pudo actualizar el estado de la exportación en el almacenamiento.",
          );
        }
      }
      return structuredClone(job);
    },
    async download(id, signal) {
      signal.throwIfAborted();
      const job = getJob(id);
      if (!job || job.status !== "COMPLETED" || !job.fileAvailable)
        throw new AuditFailure(
          "unavailable",
          "El archivo todavía no está disponible.",
        );
      const matchingEntries = entries().filter((entry) =>
        matches(entry, job.filters),
      );
      const data =
        job.format === "CSV"
          ? generateAuditCsv(matchingEntries)
          : generateAuditPdf(matchingEntries, job.filters);
      return {
        data,
        filename: `reporte_auditoria_${job.id.toLowerCase()}.${job.format.toLowerCase()}`,
      };
    },
  };
}
