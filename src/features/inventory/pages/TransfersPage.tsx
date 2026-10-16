import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconChecklist,
} from "@tabler/icons-react";
import {
  EntityTable,
  FeedbackAlert,
  FilterBar,
  PageHeader,
  StatusBadge,
  type TableColumn,
} from "../../../components/shared";
import { ReceiveTransferModal } from "../components/ReceiveTransferModal";
import { DevScenarioSelector } from "../dev/DevScenarioSelector";
import { useTransfers } from "../hooks/useTransfers";
import { useInventoryFilterOptions } from "../hooks/useInventoryFilterOptions";
import {
  isTerminalTransferStatus,
  type ReceiveTransferPayload,
  type TransferFiltersQuery,
  type TransferItem,
} from "../services/inventoryTypes";

export function TransfersPage() {
  const [params, setParams] = useSearchParams();

  const filters: TransferFiltersQuery = useMemo(
    () => ({
      targetLocationId: params.get("targetLocationId") ?? "all",
      status: params.get("status") ?? "all",
    }),
    [params],
  );

  const {
    transfers,
    loading,
    submitting,
    error,
    submitError,
    successMessage,
    receive,
    clearFeedback,
  } = useTransfers(filters);

  const { locations, loading: catalogLoading } = useInventoryFilterOptions();
  const [activeTransfer, setActiveTransfer] = useState<TransferItem | null>(null);

  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";

  const handleFilterChange = (key: keyof TransferFiltersQuery, val: string | null) => {
    setParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (val && val !== "all") nextParams.set(key, val);
      else nextParams.delete(key);
      return nextParams;
    });
  };

  const handleConfirmReception = async (payload: ReceiveTransferPayload) => {
    await receive(payload);
  };

  const locationOptions = [
    { value: "all", label: "Todos los almacenes destino" },
    ...locations.map((l) => ({ value: l.id, label: l.name })),
  ];

  const columns: TableColumn<TransferItem>[] = [
    {
      key: "transferCode",
      header: "Código de traslado",
      width: 140,
      render: (row) => (
        <Text size="sm" fw={700}>
          {row.transferCode}
        </Text>
      ),
    },
    {
      key: "product",
      header: "Artículo / SKU",
      width: 240,
      render: (row) => (
        <div>
          <Text size="sm" fw={600}>
            {row.productName}
          </Text>
          <Text size="xs" c="dimmed">
            SKU: {row.sku}
          </Text>
        </div>
      ),
    },
    {
      key: "route",
      header: "Ruta de traslado",
      width: 240,
      render: (row) => (
        <div>
          <Text size="xs" c="dimmed">
            Origen: <Text span fw={500} c="dark">{row.sourceLocationName}</Text>
          </Text>
          <Text size="xs" c="dimmed">
            Destino: <Text span fw={500} c="dark">{row.targetLocationName}</Text>
          </Text>
        </div>
      ),
    },
    {
      key: "shipped",
      header: "Despachado",
      width: 100,
      align: "right",
      render: (row) => (
        <Text size="sm" fw={600}>
          {row.quantityShipped}
        </Text>
      ),
    },
    {
      key: "received",
      header: "Recibido",
      width: 100,
      align: "right",
      render: (row) => (
        <Text size="sm" fw={600}>
          {row.quantityReceived}
        </Text>
      ),
    },
    {
      key: "pending",
      header: "Pendiente",
      width: 100,
      align: "right",
      render: (row) => (
        <Text size="sm" c={row.quantityPending > 0 ? undefined : "dimmed"} fw={700}>
          {row.quantityPending}
        </Text>
      ),
    },
    {
      key: "status",
      header: "Estado",
      width: 190,
      render: (row) => {
        const semantic =
          row.status === "COMPLETADO"
            ? "success"
            : row.status === "RECIBIDO_PARCIAL"
              ? "warning"
              : row.status === "EN_TRANSITO"
                ? "info"
                : "error";

        const label =
          row.status === "EN_TRANSITO"
            ? "En tránsito"
            : row.status === "RECIBIDO_PARCIAL"
              ? "Recibido parcial"
              : row.status === "COMPLETADO"
                ? "Completado"
                : "Con discrepancia";

        return (
          <StatusBadge semantic={semantic} size="sm">
            {label}
          </StatusBadge>
        );
      },
    },
    {
      key: "actions",
      header: "Acción",
      width: 140,
      align: "right",
      render: (row) => {
        const receivable = !isTerminalTransferStatus(row.status);
        return (
          <Button
            size="xs"
            variant={receivable ? "filled" : "light"}
            disabled={!receivable}
            leftSection={<IconChecklist size={14} />}
            onClick={() => setActiveTransfer(row)}
          >
            {receivable ? "Recepcionar" : "Cerrado"}
          </Button>
        );
      },
    },
  ];

  const tableState = loading
    ? { status: "loading" as const }
    : error
      ? {
          status: "error" as const,
          message: error,
          action: (
            <Button
              size="xs"
              variant="outline"
              onClick={() => setParams(new URLSearchParams())}
            >
              Reintentar
            </Button>
          ),
        }
      : { status: "success" as const };

  return (
    <>
      <PageHeader
        title="Traslados y recepciones de inventario"
        description="Gestión de transferencias entre almacenes y confirmación de recepciones."
        breadcrumbs={[
          { label: "Inventario" },
          { label: "Control de stock", to: "/inventario" },
          { label: "Traslados" },
        ]}
        actions={
          <Button
            component={Link}
            to="/inventario"
            variant="outline"
            leftSection={<IconArrowLeft size={16} />}
          >
            Volver a Control de stock
          </Button>
        }
      />

      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Recepción física y disposición contable">
          Al recibir un traslado, las unidades se acreditan al saldo físico de destino según su disposición
          (reingreso a disponible o reingreso bloqueado). Las mermas no acreditan stock vendible.
        </FeedbackAlert>

        {successMessage && (
          <FeedbackAlert
            semantic="success"
            title="Operación completada"
            actions={
              <Button size="xs" variant="subtle" onClick={clearFeedback}>
                Cerrar
              </Button>
            }
          >
            {successMessage}
          </FeedbackAlert>
        )}

        {isRevisionMode && <DevScenarioSelector />}

        <FilterBar>
          <Select
            placeholder="Destino"
            value={filters.targetLocationId ?? "all"}
            data={locationOptions}
            disabled={catalogLoading}
            onChange={(val) => handleFilterChange("targetLocationId", val)}
            style={{ minWidth: 240 }}
            aria-label="Filtrar por destino"
          />
          <Select
            placeholder="Estado de traslado"
            value={filters.status ?? "all"}
            data={[
              { value: "all", label: "Todos los estados" },
              { value: "EN_TRANSITO", label: "En tránsito" },
              { value: "RECIBIDO_PARCIAL", label: "Recibido parcial" },
              { value: "COMPLETADO", label: "Completado" },
              {
                value: "COMPLETADO_CON_DISCREPANCIA",
                label: "Con discrepancia",
              },
            ]}
            onChange={(val) => handleFilterChange("status", val)}
            style={{ minWidth: 200 }}
            aria-label="Filtrar por estado de traslado"
          />
        </FilterBar>

        <EntityTable
          caption="Bandeja de traslados interprovinciales e inter-tienda"
          columns={columns}
          rows={transfers}
          rowKey={(row) => row.id}
          state={tableState}
          empty={{
            title: "No hay traslados pendientes",
            description:
              "No se encontraron transferencias con los criterios seleccionados.",
            action: (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setParams(new URLSearchParams())}
              >
                Limpiar filtros
              </Button>
            ),
          }}
        />
      </Stack>

      <ReceiveTransferModal
        transfer={activeTransfer}
        opened={Boolean(activeTransfer)}
        submitting={submitting}
        submitError={submitError}
        onClose={() => setActiveTransfer(null)}
        onConfirm={handleConfirmReception}
      />
    </>
  );
}
