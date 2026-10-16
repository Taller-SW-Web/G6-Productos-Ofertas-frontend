import type { InventoryRepository } from "../services/inventoryRepository";
import { InventoryError } from "../services/inventoryErrors";
import {
  isTerminalTransferStatus,
  type DashboardFiltersQuery,
  type InventoryAlert,
  type InventoryBrandOption,
  type InventoryCategoryOption,
  type InventoryKpiSummary,
  type InventoryLocationOption,
  type LocationDistribution,
  type ReceiveTransferPayload,
  type StockFiltersQuery,
  type StockItem,
  type ThresholdConfig,
  type TransferFiltersQuery,
  type TransferItem,
} from "../services/inventoryTypes";
import {
  initialAlerts,
  initialStockItems,
  initialThresholds,
  initialTransfers,
} from "../mocks/inventoryFixtures";

export class MockInventoryAdapter implements InventoryRepository {
  private stockItems: StockItem[] = JSON.parse(JSON.stringify(initialStockItems));
  private thresholds: ThresholdConfig = JSON.parse(JSON.stringify(initialThresholds));
  private transfers: TransferItem[] = JSON.parse(JSON.stringify(initialTransfers));
  private alerts: InventoryAlert[] = JSON.parse(JSON.stringify(initialAlerts));
  private processedOperations = new Map<string, TransferItem>();
  private processedOperationKeys = new Map<string, string>();

  private recalculateStockStatus(item: StockItem): void {
    const effectiveThreshold =
      this.thresholds.skuOverrides[item.sku] ?? this.thresholds.globalThreshold;
    item.threshold = effectiveThreshold;
    item.available = Math.max(item.onHand - item.reserved - item.blocked, 0);

    if (item.available === 0) {
      item.status = "AGOTADO";
    } else if (item.available <= effectiveThreshold) {
      item.status = "STOCK_BAJO";
    } else {
      item.status = "DISPONIBLE";
    }
  }

  private computeOperationIntent(payload: ReceiveTransferPayload): string {
    // Nota: la nota NO es parte de la intención, ya que puede cambiar en reintentos.
    // La intención se define por: transferId, quantityReceived, disposition, finalReceipt.
    return `${payload.transferId}|${payload.quantityReceived}|${payload.disposition}|${payload.finalReceipt}`;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private normalizeKey(val: string): string {
    return val.toUpperCase().replace(/[\s-]+/g, "_").trim();
  }

  private getOrCreateDestinationStockItem(transfer: TransferItem): StockItem {
    const existing = this.stockItems.find(
      (s) => s.sku === transfer.sku && s.locationId === transfer.targetLocationId,
    );
    if (existing) return existing;

    const reference = this.stockItems.find((s) => s.sku === transfer.sku);
    const created: StockItem = {
      sku: transfer.sku,
      productName: transfer.productName,
      categoryName: reference?.categoryName ?? "Sin categoría",
      brandName: reference?.brandName ?? "Sin marca",
      locationId: transfer.targetLocationId,
      locationName: transfer.targetLocationName,
      onHand: 0,
      reserved: 0,
      blocked: 0,
      available: 0,
      threshold:
        this.thresholds.skuOverrides[transfer.sku] ?? this.thresholds.globalThreshold,
      status: "AGOTADO",
      stockVersion: 0,
      updatedAt: transfer.shippedAt,
    };
    this.stockItems.push(created);
    return created;
  }

  private queryStockItems(filters?: StockFiltersQuery): StockItem[] {
    this.stockItems.forEach((item) => this.recalculateStockStatus(item));

    let result = [...this.stockItems];

    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.sku.toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q),
      );
    }

    if (filters?.category && filters.category !== "all") {
      const target = this.normalizeKey(filters.category);
      result = result.filter(
        (item) =>
          item.categoryName === filters.category ||
          this.normalizeKey(item.categoryName) === target,
      );
    }

    if (filters?.brand && filters.brand !== "all") {
      const target = this.normalizeKey(filters.brand);
      result = result.filter(
        (item) =>
          item.brandName === filters.brand ||
          this.normalizeKey(item.brandName) === target,
      );
    }

    if (filters?.locationId && filters.locationId !== "all") {
      result = result.filter((item) => item.locationId === filters.locationId);
    }

    if (filters?.status && filters.status !== "all") {
      result = result.filter((item) => item.status === filters.status);
    }

    return result;
  }

  async getStockItems(filters?: StockFiltersQuery): Promise<StockItem[]> {
    return this.queryStockItems(filters);
  }

  async getStockDetail(
    sku: string,
    locationId: string,
  ): Promise<StockItem | null> {
    const item = this.stockItems.find(
      (s) => s.sku === sku && s.locationId === locationId,
    );
    if (!item) return null;
    this.recalculateStockStatus(item);
    return { ...item };
  }

  async getThresholds(): Promise<ThresholdConfig> {
    return JSON.parse(JSON.stringify(this.thresholds));
  }

  async updateGlobalThreshold(threshold: number): Promise<ThresholdConfig> {
    if (threshold < 0 || !Number.isInteger(threshold)) {
      throw new InventoryError(
        "VALIDACION",
        "El umbral global debe ser un entero positivo o cero.",
      );
    }
    this.thresholds.globalThreshold = threshold;
    this.stockItems.forEach((item) => this.recalculateStockStatus(item));
    return JSON.parse(JSON.stringify(this.thresholds));
  }

  async updateSkuThreshold(
    sku: string,
    threshold: number,
  ): Promise<ThresholdConfig> {
    if (threshold < 0 || !Number.isInteger(threshold)) {
      throw new InventoryError(
        "VALIDACION",
        "El umbral por SKU debe ser un entero positivo o cero.",
      );
    }
    this.thresholds.skuOverrides[sku] = threshold;
    this.stockItems.forEach((item) => this.recalculateStockStatus(item));
    return JSON.parse(JSON.stringify(this.thresholds));
  }

  async getTransfers(filters?: TransferFiltersQuery): Promise<TransferItem[]> {
    let result = [...this.transfers];

    if (filters?.targetLocationId && filters.targetLocationId !== "all") {
      result = result.filter(
        (t) => t.targetLocationId === filters.targetLocationId,
      );
    }

    if (filters?.status && filters.status !== "all") {
      result = result.filter((t) => t.status === filters.status);
    }

    return result;
  }

  async receiveTransfer(payload: ReceiveTransferPayload): Promise<TransferItem> {
    // 1. Validación de formato de operation_id (UUID según OpenAPI)
    if (!payload.operationId || !this.isUuid(payload.operationId)) {
      throw new InventoryError(
        "VALIDACION",
        "El identificador de operación (operation_id) debe ser un UUID válido.",
      );
    }

    // 2. Validación de longitud de nota (máximo 500 caracteres según OpenAPI)
    if (payload.note && payload.note.length > 500) {
      throw new InventoryError(
        "VALIDACION",
        "La nota de recepción (note) no puede superar los 500 caracteres.",
      );
    }

    // 3. Validación de disposición permitida
    const validDispositions: ReceiveTransferPayload["disposition"][] = [
      "REINGRESAR_DISPONIBLE",
      "REINGRESAR_BLOQUEADO",
      "CONFIRMAR_MERMA",
    ];
    if (!validDispositions.includes(payload.disposition)) {
      throw new InventoryError(
        "DISPOSICION_RECEPCION_INVALIDA",
        "La disposición de recepción no es válida para la operación.",
      );
    }

    // 4. Verificación de Idempotencia
    const intent = this.computeOperationIntent(payload);
    const previousIntent = this.processedOperationKeys.get(payload.operationId);
    const alreadyProcessed = this.processedOperations.get(payload.operationId);

    // Si ya fue procesada con la misma identidad e intención: retornar sin modificar stock
    if (alreadyProcessed && previousIntent && previousIntent === intent) {
      return { ...alreadyProcessed };
    }

    // Si la misma identidad se reutiliza con intención diferente: conflicto de idempotencia
    if (alreadyProcessed && previousIntent && previousIntent !== intent) {
      throw new InventoryError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotencia conflictiva: la misma operation_id fue reutilizada para otra intención.",
      );
    }

    // 5. Validación de existencia y estado del traslado
    const transfer = this.transfers.find((t) => t.id === payload.transferId);
    if (!transfer) {
      throw new InventoryError(
        "TRASLADO_NO_ENCONTRADO",
        `Traslado con ID ${payload.transferId} no encontrado.`,
      );
    }

    if (isTerminalTransferStatus(transfer.status)) {
      throw new InventoryError(
        "TRASLADO_NO_RECIBIBLE",
        "El traslado ya está cerrado o no admite nuevas recepciones.",
      );
    }

    // 6. Validación de cantidades
    if (
      !Number.isInteger(payload.quantityReceived) ||
      payload.quantityReceived <= 0
    ) {
      throw new InventoryError(
        "CANTIDAD_INVALIDA",
        "La cantidad recibida debe ser un número entero mayor que cero.",
      );
    }

    if (payload.quantityReceived > transfer.quantityPending) {
      throw new InventoryError(
        "CANTIDAD_RECIBIDA_EXCEDE_TRASLADO",
        `La cantidad recibida (${payload.quantityReceived}) supera la cantidad pendiente (${transfer.quantityPending}).`,
      );
    }

    // 7. Aplicación de la recepción
    transfer.quantityReceived += payload.quantityReceived;
    transfer.quantityPending = Math.max(
      transfer.quantityShipped - transfer.quantityReceived,
      0,
    );

    if (transfer.quantityPending === 0) {
      transfer.status = "COMPLETADO";
    } else if (payload.finalReceipt) {
      transfer.status = "COMPLETADO_CON_DISCREPANCIA";
      this.alerts.unshift({
        id: `alt-${Date.now()}`,
        severity: "error",
        title: `Discrepancia en recepción de traslado ${transfer.transferCode}`,
        message: `Traslado ${transfer.transferCode} cerrado con ${transfer.quantityPending} unidades faltantes no recibidas para SKU ${transfer.sku}.`,
        actionLabel: "Ver traslados",
        targetRoute: "/inventario/traslados",
        transferId: transfer.id,
      });
    } else {
      transfer.status = "RECIBIDO_PARCIAL";
    }

    if (payload.note) {
      transfer.notes = payload.note;
    }

    // Solo las disposiciones de reingreso acreditan saldo físico; la merma no.
    if (payload.disposition !== "CONFIRMAR_MERMA") {
      const stockItem = this.getOrCreateDestinationStockItem(transfer);
      stockItem.onHand += payload.quantityReceived;
      if (payload.disposition === "REINGRESAR_BLOQUEADO") {
        stockItem.blocked += payload.quantityReceived;
      }
      stockItem.stockVersion += 1;
      stockItem.updatedAt = payload.receivedAt;
      this.recalculateStockStatus(stockItem);
    }

    const result: TransferItem = { ...transfer };
    this.processedOperations.set(payload.operationId, result);
    this.processedOperationKeys.set(payload.operationId, intent);
    return result;
  }

  async getDashboardKpis(
    filters?: DashboardFiltersQuery,
  ): Promise<InventoryKpiSummary> {
    const items = this.queryStockItems({
      search: filters?.search,
      category: filters?.category,
      brand: filters?.brand,
      locationId: filters?.locationId,
      status: filters?.status,
    });

    const availableUnits = items.reduce((acc, i) => acc + i.available, 0);
    const blockedUnits = items.reduce((acc, i) => acc + i.blocked, 0);
    const totalPhysicalUnits = items.reduce((acc, i) => acc + i.onHand, 0);
    const reservedUnits = items.reduce((acc, i) => acc + i.reserved, 0);

    // KPIs por SKU: consolidar por SKU para no contar el mismo artículo en varias ubicaciones.
    const bySku = new Map<string, { available: number; threshold: number }>();
    for (const item of items) {
      const current = bySku.get(item.sku) ?? {
        available: 0,
        threshold: item.threshold,
      };
      current.available += item.available;
      current.threshold = Math.max(current.threshold, item.threshold);
      bySku.set(item.sku, current);
    }
    const skuAggregates = Array.from(bySku.values());
    const skusAvailable = skuAggregates.filter(
      (s) => s.available > s.threshold,
    ).length;
    const skusLowStock = skuAggregates.filter(
      (s) => s.available > 0 && s.available <= s.threshold,
    ).length;
    const skusOutOfStock = skuAggregates.filter((s) => s.available === 0).length;

    const allowedSkus = new Set(bySku.keys());
    let relatedTransfers = this.transfers.filter((t) => allowedSkus.has(t.sku));
    if (filters?.locationId && filters.locationId !== "all") {
      relatedTransfers = relatedTransfers.filter(
        (t) => t.targetLocationId === filters.locationId,
      );
    }

    const inTransit = relatedTransfers.filter(
      (t) => t.status === "EN_TRANSITO",
    ).length;
    const partial = relatedTransfers.filter(
      (t) => t.status === "RECIBIDO_PARCIAL",
    ).length;
    const discrepancies = relatedTransfers.filter(
      (t) => t.status === "COMPLETADO_CON_DISCREPANCIA",
    ).length;

    return {
      availableUnits,
      blockedUnits,
      totalPhysicalUnits,
      totalVendibleSkus: bySku.size,
      skusAvailable,
      skusLowStock,
      skusOutOfStock,
      reservedUnits,
      totalPendingTransfers: inTransit + partial,
      transfersInTransit: inTransit,
      transfersPartiallyReceived: partial,
      transfersWithDiscrepancy: discrepancies,
    };
  }

  async getDashboardAlerts(
    filters?: DashboardFiltersQuery,
  ): Promise<InventoryAlert[]> {
    const items = this.queryStockItems({
      search: filters?.search,
      category: filters?.category,
      brand: filters?.brand,
      locationId: filters?.locationId,
      status: filters?.status,
    });

    const alerts: InventoryAlert[] = [];

    // 1. Alertas dinámicas de stock bajo y agotado
    for (const item of items) {
      const effectiveThreshold =
        this.thresholds.skuOverrides[item.sku] ?? this.thresholds.globalThreshold;
      const isLowStock = item.available > 0 && item.available <= effectiveThreshold;
      const isOutOfStock = item.available === 0;

      if (isOutOfStock) {
        alerts.push({
          id: `out-${item.sku}-${item.locationId}`,
          severity: "error",
          title: `Quiebre de stock: ${item.productName}`,
          message: `${item.productName} (${item.sku}) en ${item.locationName} no tiene unidades disponibles.`,
          actionLabel: "Ver detalle",
          targetRoute: `/inventario?search=${item.sku}`,
          sku: item.sku,
          locationId: item.locationId,
        });
      } else if (isLowStock) {
        alerts.push({
          id: `low-${item.sku}-${item.locationId}`,
          severity: "warning",
          title: `Stock bajo: ${item.productName}`,
          message: `${item.productName} (${item.sku}) en ${item.locationName} tiene ${item.available} unidades, debajo del umbral de ${effectiveThreshold}.`,
          actionLabel: "Ver detalle",
          targetRoute: `/inventario?search=${item.sku}`,
          sku: item.sku,
          locationId: item.locationId,
        });
      }
    }

    // 2. Alertas de discrepancias en traslados cerrados
    const itemsWithAlertSkus = new Set(items.map((i) => i.sku));
    for (const transfer of this.transfers) {
      if (
        transfer.status === "COMPLETADO_CON_DISCREPANCIA" &&
        itemsWithAlertSkus.has(transfer.sku)
      ) {
        if (
          filters?.locationId &&
          filters.locationId !== "all" &&
          transfer.targetLocationId !== filters.locationId
        ) {
          continue;
        }
        // Evitar duplicados
        const existingAlert = alerts.find(
          (a) => a.transferId === transfer.id && a.severity === "error"
        );
        if (!existingAlert) {
          alerts.push({
            id: `disc-${transfer.id}`,
            severity: "error",
            title: `Discrepancia en recepción de traslado ${transfer.transferCode}`,
            message: `Traslado ${transfer.transferCode} cerrado con ${transfer.quantityPending} unidades faltantes no recibidas para SKU ${transfer.sku}.`,
            actionLabel: "Ver traslados",
            targetRoute: "/inventario/traslados",
            transferId: transfer.id,
          });
        }
      }
    }

    // Deduplicar usando identidad correcta: SKU+ubicación para stock, transferId para discrepancias
    const seen = new Set<string>();
    return alerts.filter((alt) => {
      const key = alt.transferId
        ? `transfer:${alt.transferId}`
        : alt.sku && alt.locationId
          ? `stock:${alt.sku}:${alt.locationId}`
          : alt.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async getLocationDistribution(
    filters?: DashboardFiltersQuery,
  ): Promise<LocationDistribution[]> {
    const map = new Map<string, LocationDistribution>();

    for (const item of this.queryStockItems({
      search: filters?.search,
      category: filters?.category,
      brand: filters?.brand,
      locationId: filters?.locationId,
      status: filters?.status,
    })) {
      let dist = map.get(item.locationId);
      if (!dist) {
        dist = {
          locationId: item.locationId,
          locationName: item.locationName,
          onHandTotal: 0,
          reservedTotal: 0,
          blockedTotal: 0,
          availableTotal: 0,
          skusAvailableCount: 0,
          skusLowStockCount: 0,
          skusOutOfStockCount: 0,
        };
        map.set(item.locationId, dist);
      }
      dist.onHandTotal += item.onHand;
      dist.reservedTotal += item.reserved;
      dist.blockedTotal += item.blocked;
      dist.availableTotal += item.available;
      if (item.status === "DISPONIBLE") dist.skusAvailableCount++;
      else if (item.status === "STOCK_BAJO") dist.skusLowStockCount++;
      else if (item.status === "AGOTADO") dist.skusOutOfStockCount++;
    }

return Array.from(map.values());
  }

  async getCategories(): Promise<InventoryCategoryOption[]> {
    const categories = new Map<string, InventoryCategoryOption>();
    for (const item of this.stockItems) {
      if (!categories.has(item.categoryName)) {
        const id = item.categoryName
          .toUpperCase()
          .replace(/[\s-]+/g, "_")
          .trim();
        categories.set(item.categoryName, {
          id,
          name: item.categoryName,
          active: true,
        });
      }
    }
    return Array.from(categories.values());
  }

  async getBrands(): Promise<InventoryBrandOption[]> {
    const brands = new Map<string, InventoryBrandOption>();
    for (const item of this.stockItems) {
      if (!brands.has(item.brandName)) {
        const id = item.brandName
          .toUpperCase()
          .replace(/[\s-]+/g, "_")
          .trim();
        brands.set(item.brandName, {
          id,
          name: item.brandName,
          active: true,
        });
      }
    }
    return Array.from(brands.values());
  }

  async getLocations(): Promise<InventoryLocationOption[]> {
    const locations = new Map<string, InventoryLocationOption>();
    for (const item of this.stockItems) {
      if (!locations.has(item.locationName)) {
        locations.set(item.locationName, {
          id: item.locationId,
          name: item.locationName,
          active: true,
        });
      }
    }
    return Array.from(locations.values());
  }
}
