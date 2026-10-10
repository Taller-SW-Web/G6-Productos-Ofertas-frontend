import type {
  BulkExportJob,
  BulkImportBatch,
  BulkImportRow,
} from "../types/bulk";

export const sampleCompletedRows: BulkImportRow[] = [
  {
    row_id: 1,
    sku: "NK-RN-001-42",
    nombre: "Zapatilla Running Air Sprint - Talla 42",
    status: "COMPLETED",
    applied_domains: ["CATALOGO", "PRICING", "INVENTARIO"],
    failed_domain: null,
    needs_reconciliation: false,
    detail: "Producto, precio base y SKU inicializados correctamente",
    steps: [
      { domain: "CATALOGO", status: "COMPLETED", detail: "Borrador creado" },
      { domain: "PRICING", status: "COMPLETED", detail: "Precio regular S/ 299.00 registrado" },
      { domain: "INVENTARIO", status: "COMPLETED", detail: "SKU inicializado y stock 50 u. aplicado" },
    ],
  },
  {
    row_id: 2,
    sku: "NK-RN-001-43",
    nombre: "Zapatilla Running Air Sprint - Talla 43",
    status: "COMPLETED",
    applied_domains: ["CATALOGO", "PRICING", "INVENTARIO"],
    failed_domain: null,
    needs_reconciliation: false,
    detail: "Producto, precio base y SKU inicializados correctamente",
    steps: [
      { domain: "CATALOGO", status: "COMPLETED", detail: "Borrador creado" },
      { domain: "PRICING", status: "COMPLETED", detail: "Precio regular S/ 299.00 registrado" },
      { domain: "INVENTARIO", status: "COMPLETED", detail: "SKU inicializado y stock 30 u. aplicado" },
    ],
  },
  {
    row_id: 3,
    sku: "AD-TR-002-M",
    nombre: "Camiseta Entrenamiento DryFit - Talla M",
    status: "COMPLETED",
    applied_domains: ["CATALOGO", "PRICING", "INVENTARIO"],
    failed_domain: null,
    needs_reconciliation: false,
    detail: "Producto, precio base y SKU inicializados correctamente",
    steps: [
      { domain: "CATALOGO", status: "COMPLETED", detail: "Borrador creado" },
      { domain: "PRICING", status: "COMPLETED", detail: "Precio regular S/ 89.00 registrado" },
      { domain: "INVENTARIO", status: "COMPLETED", detail: "SKU inicializado sin ubicación por defecto" },
    ],
  },
];

export const samplePartialRows: BulkImportRow[] = [
  ...sampleCompletedRows,
  {
    row_id: 4,
    sku: "PUM-FT-004-L",
    nombre: "Short Futbol Pro - Talla L",
    status: "FAILED",
    applied_domains: ["CATALOGO", "PRICING"],
    failed_domain: "INVENTARIO",
    needs_reconciliation: true,
    code: "INV_LOC_NOT_FOUND",
    detail: "Ubicación de inventario no encontrada para ajuste de stock inicial (default_location_id no configurado)",
    steps: [
      { domain: "CATALOGO", status: "COMPLETED", detail: "Borrador creado" },
      { domain: "PRICING", status: "COMPLETED", detail: "Precio regular S/ 79.00 registrado" },
      { domain: "INVENTARIO", status: "FAILED", code: "INV_LOC_NOT_FOUND", detail: "Rechazado por ajuste de stock sin ubicación" },
    ],
  },
  {
    row_id: 5,
    sku: "UND-CP-005-S",
    nombre: "Gorra Competición Vent - Talla S",
    status: "FAILED",
    applied_domains: ["CATALOGO", "INVENTARIO"],
    failed_domain: "PRICING",
    needs_reconciliation: true,
    code: "PRC_CURRENCY_INVALID",
    detail: "Moneda USD no habilitada para lista de precios local en canal seleccionado",
    steps: [
      { domain: "CATALOGO", status: "COMPLETED", detail: "Borrador creado" },
      { domain: "PRICING", status: "FAILED", code: "PRC_CURRENCY_INVALID", detail: "Rechazado por validación de moneda" },
      { domain: "INVENTARIO", status: "COMPLETED", detail: "SKU inicializado" },
    ],
  },
  {
    row_id: 6,
    sku: "AS-GL-006-U",
    nombre: "Guantes Training Grip - Talla Única",
    status: "FAILED",
    applied_domains: [],
    failed_domain: "CATALOGO",
    needs_reconciliation: false,
    code: "CAT_SKU_DUPLICATE",
    detail: "SKU duplicado en catálogo maestro existente",
    steps: [
      { domain: "CATALOGO", status: "FAILED", code: "CAT_SKU_DUPLICATE", detail: "Rechazo de creación de borrador" },
      { domain: "PRICING", status: "PENDING", detail: "No iniciado debido a fallo en Catálogo" },
      { domain: "INVENTARIO", status: "PENDING", detail: "No iniciado debido a fallo en Catálogo" },
    ],
  },
];

export const sampleInventoryFailedRows: BulkImportRow[] = [
  {
    row_id: 1,
    sku: "NK-RN-001-42",
    nombre: "Zapatilla Running Air Sprint - Talla 42",
    status: "COMPLETED",
    applied_domains: ["CATALOGO", "PRICING", "INVENTARIO"],
    failed_domain: null,
    needs_reconciliation: false,
    steps: [
      { domain: "CATALOGO", status: "COMPLETED" },
      { domain: "PRICING", status: "COMPLETED" },
      { domain: "INVENTARIO", status: "COMPLETED" },
    ],
  },
  {
    row_id: 2,
    sku: "NK-RN-002-44",
    nombre: "Zapatilla Trail Max - Talla 44",
    status: "FAILED",
    applied_domains: ["CATALOGO", "PRICING"],
    failed_domain: "INVENTARIO",
    needs_reconciliation: true,
    code: "INV_UNAVAILABLE",
    detail: "Inventario rechazó la inicialización de SKU por indisponibilidad temporal",
    steps: [
      { domain: "CATALOGO", status: "COMPLETED", detail: "Borrador persistido" },
      { domain: "PRICING", status: "COMPLETED", detail: "Precio base S/ 349.00 registrado" },
      { domain: "INVENTARIO", status: "FAILED", code: "INV_UNAVAILABLE", detail: "Fallo de conexión en nodo de almacén" },
    ],
  },
];

export const samplePricingFailedRows: BulkImportRow[] = [
  {
    row_id: 1,
    sku: "NK-RN-003-40",
    nombre: "Zapatilla Marathon Elite - Talla 40",
    status: "FAILED",
    applied_domains: ["CATALOGO", "INVENTARIO"],
    failed_domain: "PRICING",
    needs_reconciliation: true,
    code: "PRC_RANGE_INVALID",
    detail: "Precio base fuera de rango permitido por política comercial",
    steps: [
      { domain: "CATALOGO", status: "COMPLETED", detail: "Borrador creado" },
      { domain: "PRICING", status: "FAILED", code: "PRC_RANGE_INVALID", detail: "Regla de precio base rechazada" },
      { domain: "INVENTARIO", status: "COMPLETED", detail: "SKU registrado sin saldo" },
    ],
  },
];

export const sampleCatalogFailedRows: BulkImportRow[] = [
  {
    row_id: 1,
    sku: "NK-RN-INVALID",
    nombre: "Producto con taxonomía corrupta",
    status: "FAILED",
    applied_domains: [],
    failed_domain: "CATALOGO",
    needs_reconciliation: false,
    code: "CAT_CATEGORY_NOT_FOUND",
    detail: "La categoría especificada no existe en la jerarquía de catálogo",
    steps: [
      { domain: "CATALOGO", status: "FAILED", code: "CAT_CATEGORY_NOT_FOUND", detail: "Categoría inexistente" },
      { domain: "PRICING", status: "PENDING", detail: "No ejecutado" },
      { domain: "INVENTARIO", status: "PENDING", detail: "No ejecutado" },
    ],
  },
];

export const mockBatches: Record<string, BulkImportBatch> = {
  "batch-queued": {
    batch_id: "batch-queued",
    status: "QUEUED",
    total_rows: 120,
    completed_rows: 0,
    failed_rows: 0,
    needs_reconciliation: false,
    created_at: "2026-10-10T12:00:00Z",
    updated_at: "2026-10-10T12:00:00Z",
    file_name: "catalogo_primavera_2026.csv",
    file_size: 48290,
  },
  "batch-processing": {
    batch_id: "batch-processing",
    status: "PROCESSING",
    total_rows: 120,
    completed_rows: 82,
    failed_rows: 4,
    needs_reconciliation: true,
    created_at: "2026-10-10T12:00:00Z",
    updated_at: "2026-10-10T12:02:30Z",
    file_name: "catalogo_primavera_2026.csv",
    file_size: 48290,
  },
  "batch-completed": {
    batch_id: "batch-completed",
    status: "COMPLETED",
    total_rows: 120,
    completed_rows: 120,
    failed_rows: 0,
    needs_reconciliation: false,
    created_at: "2026-10-10T11:45:00Z",
    updated_at: "2026-10-10T11:48:15Z",
    file_name: "lote_completo_120.csv",
    file_size: 45100,
    rows: sampleCompletedRows,
  },
  "batch-partial": {
    batch_id: "batch-partial",
    status: "COMPLETED",
    total_rows: 120,
    completed_rows: 114,
    failed_rows: 6,
    needs_reconciliation: true,
    created_at: "2026-10-10T11:30:00Z",
    updated_at: "2026-10-10T11:33:40Z",
    file_name: "lote_parcial_120.csv",
    file_size: 46200,
    rows: samplePartialRows,
  },
  "batch-catalog-failed": {
    batch_id: "batch-catalog-failed",
    status: "COMPLETED",
    total_rows: 10,
    completed_rows: 0,
    failed_rows: 10,
    needs_reconciliation: false,
    created_at: "2026-10-10T11:15:00Z",
    updated_at: "2026-10-10T11:16:00Z",
    file_name: "lote_cat_error.csv",
    file_size: 5120,
    rows: sampleCatalogFailedRows,
  },
  "batch-pricing-failed": {
    batch_id: "batch-pricing-failed",
    status: "COMPLETED",
    total_rows: 25,
    completed_rows: 20,
    failed_rows: 5,
    needs_reconciliation: true,
    created_at: "2026-10-10T11:00:00Z",
    updated_at: "2026-10-10T11:02:10Z",
    file_name: "lote_pricing_error.csv",
    file_size: 10240,
    rows: samplePricingFailedRows,
  },
  "batch-inventory-failed": {
    batch_id: "batch-inventory-failed",
    status: "COMPLETED",
    total_rows: 50,
    completed_rows: 45,
    failed_rows: 5,
    needs_reconciliation: true,
    created_at: "2026-10-10T10:45:00Z",
    updated_at: "2026-10-10T10:47:30Z",
    file_name: "lote_inv_error.csv",
    file_size: 18400,
    rows: sampleInventoryFailedRows,
  },
  "batch-failed-general": {
    batch_id: "batch-failed-general",
    status: "FAILED_GENERAL",
    total_rows: 80,
    completed_rows: 0,
    failed_rows: 80,
    needs_reconciliation: false,
    created_at: "2026-10-10T10:30:00Z",
    updated_at: "2026-10-10T10:31:05Z",
    file_name: "lote_corrupto.csv",
    file_size: 25000,
    rows: [],
  },
  "batch-resume-accepted": {
    batch_id: "batch-resume-accepted",
    status: "QUEUED",
    total_rows: 120,
    completed_rows: 114,
    failed_rows: 6,
    needs_reconciliation: true,
    created_at: "2026-10-10T11:30:00Z",
    updated_at: "2026-10-10T12:05:00Z",
    file_name: "lote_parcial_120.csv",
    file_size: 46200,
  },
};

export const mockExports: Record<string, BulkExportJob> = {
  "export-queued": {
    export_id: "export-queued",
    status: "QUEUED",
    format: "CSV",
    created_at: "2026-10-10T12:10:00Z",
    updated_at: "2026-10-10T12:10:00Z",
  },
  "export-processing": {
    export_id: "export-processing",
    status: "PROCESSING",
    format: "XLSX",
    created_at: "2026-10-10T12:08:00Z",
    updated_at: "2026-10-10T12:09:15Z",
  },
  "export-completed": {
    export_id: "export-completed",
    status: "COMPLETED",
    format: "CSV",
    created_at: "2026-10-10T12:00:00Z",
    updated_at: "2026-10-10T12:01:45Z",
    file_name: "catalogo_completo_20261010.csv",
    file_size: 154200,
    download_url: "mock://download/export-completed.csv",
  },
  "export-failed": {
    export_id: "export-failed",
    status: "FAILED_GENERAL",
    format: "CSV",
    created_at: "2026-10-10T11:50:00Z",
    updated_at: "2026-10-10T11:51:10Z",
    error_message: "Error interno al consolidar snapshot de inventario para exportación",
  },
};

export const MOCK_CSV_TEMPLATE = `sku,nombre,descripcion,categoria,marca,precio_regular,moneda,stock_inicial,ubicacion
NK-RN-001-42,Zapatilla Running Air Sprint - Talla 42,Zapatilla deportiva para running,Calzado,Nike,299.00,PEN,50,ALM-CENTRAL
AD-TR-002-M,Camiseta Entrenamiento DryFit - Talla M,Camiseta transpirable,Ropa,Adidas,89.00,PEN,30,ALM-CENTRAL
PUM-FT-004-L,Short Futbol Pro - Talla L,Short de competición,Ropa,Puma,79.00,PEN,20,ALM-CENTRAL
`;

export const MOCK_EXPORT_CSV_DATA = `sku,nombre,categoria,marca,precio_regular,precio_oferta,moneda,stock_disponible,estado
NK-RN-001-42,Zapatilla Running Air Sprint - Talla 42,Calzado,Nike,299.00,249.00,PEN,50,ACTIVO
NK-RN-001-43,Zapatilla Running Air Sprint - Talla 43,Calzado,Nike,299.00,null,PEN,30,ACTIVO
AD-TR-002-M,Camiseta Entrenamiento DryFit - Talla M,Ropa,Adidas,89.00,null,PEN,30,ACTIVO
`;

export const MOCK_FAILED_ROWS_REPORT_CSV = `row_id,sku,nombre,estado,dominio_fallido,codigo_error,detalle_error,necesita_reconciliacion
4,PUM-FT-004-L,Short Futbol Pro - Talla L,FAILED,INVENTARIO,INV_LOC_NOT_FOUND,Ubicacion de inventario no encontrada para ajuste de stock inicial,true
5,UND-CP-005-S,Gorra Competicion Vent - Talla S,FAILED,PRICING,PRC_CURRENCY_INVALID,Moneda USD no habilitada para lista de precios local,true
6,AS-GL-006-U,Guantes Training Grip - Talla Unica,FAILED,CATALOGO,CAT_SKU_DUPLICATE,SKU duplicado en catalogo maestro existente,false
`;
