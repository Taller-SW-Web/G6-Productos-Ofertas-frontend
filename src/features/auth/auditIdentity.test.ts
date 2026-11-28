import { expect, it, vi } from "vitest";
import { createHttpAuditRepository } from "../price-audit/adapters/httpAuditRepository";

it("PA-01 resuelve una vez por producto sin fabricar SKU, actor, canal ni moneda", async () => {
  const entry = { id_auditoria: "audit-1", target_type: "PRODUCTO", product_id: "product-1", sku: null,
    tipo_precio: "REGULAR", tipo_operacion: "CREACION", precio_anterior: null, precio_nuevo: 25,
    variacion_porcentual: null, canal_origen: null, motivo_cambio: "ALTA_PRODUCTO",
    usuario_id: null, usuario_email: null, timestamp: "2026-11-28T12:00:00Z" };
  const resolve = vi.fn(async () => "Producto comercial");
  const repository = createHttpAuditRepository({ request: async () => Response.json({
    items: [entry, { ...entry, id_auditoria: "audit-2" }],
    meta: { pagina: 1, tamanio: 20, total: 2, totalPaginas: 1 },
  }) }, resolve);
  const query = { page: 1, size: 20, sku: "", desde: "", hasta: "", usuarioId: "", canal: "", batchId: "" };
  const page = await repository.list(query, new AbortController().signal);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(page.items).toHaveLength(2);
  for (const item of page.items) expect(item).toMatchObject({ productName: "Producto comercial", productId: "product-1", sku: null, actorId: null, origin: null });
  await repository.list(query, new AbortController().signal);
  expect(resolve).toHaveBeenCalledTimes(1);
});
