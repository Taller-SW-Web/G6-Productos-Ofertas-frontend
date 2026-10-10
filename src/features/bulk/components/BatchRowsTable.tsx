import { useState } from "react";
import { Stack, Text } from "@mantine/core";
import { EntityTable, StatusBadge, type TableColumn, type TableState } from "../../../components/shared";
import type { BulkDomain, BulkImportRow, BulkRowStatus } from "../types/bulk";

export interface BatchRowsTableProps {
  rows: BulkImportRow[];
  caption?: string;
  state?: TableState;
}

function renderDomainStep(row: BulkImportRow, domain: BulkDomain) {
  const step = row.steps?.find((s) => s.domain === domain);
  const isApplied = row.applied_domains?.includes(domain);
  const isFailed = row.failed_domain === domain;

  if (isFailed || step?.status === "FAILED") {
    return <StatusBadge semantic="error">Rechazado</StatusBadge>;
  }
  if (isApplied || step?.status === "COMPLETED") {
    return <StatusBadge semantic="success">Aplicado</StatusBadge>;
  }
  if (step?.status === "PROCESSING") {
    return <StatusBadge semantic="warning">En proceso</StatusBadge>;
  }
  if (step?.status === "PENDING") {
    return <StatusBadge semantic="neutral">Pendiente</StatusBadge>;
  }
  return <Text size="xs" c="dimmed">No informado</Text>;
}

function renderRowStatus(status: BulkRowStatus) {
  switch (status) {
    case "COMPLETED":
      return <StatusBadge semantic="success">Completado</StatusBadge>;
    case "FAILED":
      return <StatusBadge semantic="error">Rechazado</StatusBadge>;
    case "PROCESSING":
      return <StatusBadge semantic="warning">En proceso</StatusBadge>;
    case "PENDING":
    default:
      return <StatusBadge semantic="neutral">Pendiente</StatusBadge>;
  }
}

export function BatchRowsTable({
  rows,
  caption = "Detalle de resultados por fila",
  state = { status: "success" },
}: BatchRowsTableProps) {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const columns: TableColumn<BulkImportRow>[] = [
    {
      key: "row_id",
      header: "Fila",
      width: 70,
      render: (row) => (
        <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
          #{row.row_id}
        </Text>
      ),
    },
    {
      key: "sku",
      header: "SKU / Producto",
      width: 240,
      render: (row) => (
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {row.sku ?? "SKU no asignado"}
          </Text>
          {row.nombre && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {row.nombre}
            </Text>
          )}
        </Stack>
      ),
    },
    {
      key: "status",
      header: "Estado",
      width: 130,
      render: (row) => renderRowStatus(row.status),
    },
    {
      key: "catalogo",
      header: "Catálogo",
      width: 110,
      render: (row) => renderDomainStep(row, "CATALOGO"),
    },
    {
      key: "pricing",
      header: "Precios",
      width: 110,
      render: (row) => renderDomainStep(row, "PRICING"),
    },
    {
      key: "inventario",
      header: "Inventario",
      width: 110,
      render: (row) => renderDomainStep(row, "INVENTARIO"),
    },
    {
      key: "reconciliation",
      header: "Reconciliación",
      width: 140,
      render: (row) =>
        row.needs_reconciliation ? (
          <StatusBadge semantic="warning" size="sm">
            Reconciliable
          </StatusBadge>
        ) : (
          <Text size="xs" c="dimmed">
            No requerida
          </Text>
        ),
    },
    {
      key: "detail",
      header: "Detalle / Motivo",
      width: 280,
      render: (row) => (
        <Stack gap={2}>
          {row.code && (
            <Text size="xs" fw={600} c="dimmed">
              Código: {row.code}
            </Text>
          )}
          <Text size="xs">
            {row.detail ?? "Sin observaciones adicionales"}
          </Text>
        </Stack>
      ),
    },
  ];

  const paginatedRows = rows.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  return (
    <EntityTable
      caption={caption}
      columns={columns}
      rows={paginatedRows}
      rowKey={(row) => `row-${row.row_id}`}
      state={state}
      empty={{
        title: "Sin filas de detalle",
        description:
          "El lote no incluye filas individuales en el reporte actual o aún no se ha generado el desglose.",
      }}
      pagination={
        rows.length > pageSize
          ? {
              page,
              pageSize,
              total: rows.length,
              onChange: setPage,
            }
          : undefined
      }
    />
  );
}
