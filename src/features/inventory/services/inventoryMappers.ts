import type {
  DispositionType,
  ReceiveTransferPayload,
  StockStatus,
  TransferItem,
  TransferStatus,
} from "./inventoryTypes";

// Mappers centralizados DTO (OpenAPI) <-> modelo de presentación del feature.
// No declaran integración HTTP: los usará ApiInventoryAdapter cuando el contrato
// se integre. Hoy sirven como forma estable y única de traducción.

export interface RecepcionTrasladoInventarioRequestDto {
  operation_id: string;
  received_quantity: number;
  disposition: DispositionType;
  final_receipt: boolean;
  received_at: string;
  note?: string;
}

export interface TrasladoInventarioDto {
  traslado_id: string;
  source_incident_id?: string | null;
  sku: string;
  quantity_shipped: number;
  quantity_received: number;
  missing_quantity: number;
  source_location_id: string;
  target_location_id: string;
  estado: TransferStatus;
  created_at: string;
  updated_at: string;
}

export function toRecepcionTrasladoRequestDto(
  payload: ReceiveTransferPayload,
): RecepcionTrasladoInventarioRequestDto {
  return {
    operation_id: payload.operationId,
    received_quantity: payload.quantityReceived,
    disposition: payload.disposition,
    final_receipt: payload.finalReceipt,
    received_at: payload.receivedAt,
    ...(payload.note ? { note: payload.note } : {}),
  };
}

export function toStockStatus(available: number, threshold: number): StockStatus {
  if (available <= 0) return "AGOTADO";
  if (available <= threshold) return "STOCK_BAJO";
  return "DISPONIBLE";
}

export function toTransferItem(
  dto: TrasladoInventarioDto,
  presentation: Pick<
    TransferItem,
    "transferCode" | "productName" | "sourceLocationName" | "targetLocationName"
  >,
): TransferItem {
  return {
    id: dto.traslado_id,
    transferCode: presentation.transferCode,
    sku: dto.sku,
    productName: presentation.productName,
    sourceLocationId: dto.source_location_id,
    sourceLocationName: presentation.sourceLocationName,
    targetLocationId: dto.target_location_id,
    targetLocationName: presentation.targetLocationName,
    quantityShipped: dto.quantity_shipped,
    quantityReceived: dto.quantity_received,
    quantityPending: Math.max(dto.quantity_shipped - dto.quantity_received, 0),
    status: dto.estado,
    shippedAt: dto.created_at,
  };
}
