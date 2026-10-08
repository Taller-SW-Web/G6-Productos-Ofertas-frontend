import { Text } from "@mantine/core";
import {
  EntityTable,
  StatusBadge,
  type TableColumn,
} from "../../../components/shared";
import type { PriceView } from "../services/pricingRepository";
import { priceOriginLabel } from "../services/pricePresentation";

const columns: TableColumn<PriceView>[] = [
  {
    key: "target",
    header: "Objetivo",
    render: (row) => (
      <>
        <Text size="sm" fw={600}>
          {row.name}
        </Text>
        {row.sku && (
          <Text size="sm" c="dimmed">
            {row.sku}
          </Text>
        )}
      </>
    ),
  },
  {
    key: "regular",
    header: "Regular (PEN)",
    width: 120,
    align: "right",
    render: (row) => row.regular,
  },
  {
    key: "offer",
    header: "Oferta (PEN)",
    width: 120,
    align: "right",
    render: (row) => row.offer ?? "Sin oferta",
  },
  {
    key: "origin",
    header: "Origen",
    width: 200,
    render: (row) => <StatusBadge>{priceOriginLabel(row)}</StatusBadge>,
  },
  {
    key: "channel",
    header: "Alcance efectivo",
    width: 140,
    render: (row) => (row.channel === "global" ? "Global" : "Retail"),
  },
  {
    key: "validUntil",
    header: "Vigencia hasta",
    width: 200,
    render: (row) => row.validUntil ?? "Sin fin especificado",
  },
];
export function PriceBreakdown({ rows }: { rows: PriceView[] }) {
  return (
    <EntityTable
      caption="Lecturas de ejemplo por objetivo y herencia de variantes"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      state={{ status: "success" }}
      empty={{
        title: "Sin lecturas",
        description: "No hay lecturas disponibles para este contexto.",
      }}
    />
  );
}
