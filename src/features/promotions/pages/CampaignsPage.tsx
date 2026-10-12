import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Group, Select, Stack } from "@mantine/core";
import {
  EntityTable,
  FeedbackAlert,
  FilterBar,
  PageHeader,
  StatusBadge,
  type TableColumn,
} from "../../../components/shared";
import { useAdministrationRead } from "../hooks/useAdministrationRead";
import { administrationScenario } from "../services/administration";
import { campaignService } from "../services/campaignService";
import type { CampaignView } from "../services/campaignRepository";
import {
  couponStatusLabel,
  readPositiveInteger,
} from "../services/couponPresentation";
export function CampaignsPage() {
  const [params, setParams] = useSearchParams();
  const status =
    params.get("estado") === "active"
      ? "active"
      : params.get("estado") === "inactive"
        ? "inactive"
        : "all";
  const kind =
    params.get("modalidad") === "automatic"
      ? "automatic"
      : params.get("modalidad") === "coupon"
        ? "coupon"
        : "all";
  const page = readPositiveInteger(
      params.get("pagina"),
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    pageSize = readPositiveInteger(params.get("tamanio"), 10, 100),
    scenario = administrationScenario(params);
  const read = useCallback(
    (signal: AbortSignal) =>
      campaignService.list({ status, kind, page, pageSize }, scenario, signal),
    [status, kind, page, pageSize, scenario],
  );
  const state = useAdministrationRead(
    JSON.stringify([status, kind, page, pageSize, scenario]),
    read,
  );
  const update = (key: string, value: string, reset = true) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "all" || value === "1") next.delete(key);
      else next.set(key, value);
      if (reset) next.delete("pagina");
      return next;
    });
  const clear = () =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("estado");
      next.delete("modalidad");
      next.delete("pagina");
      return next;
    });
  const columns: TableColumn<CampaignView>[] = [
    { key: "name", header: "Nombre", width: 210, render: (row) => row.name },
    {
      key: "mode",
      header: "Modalidad",
      width: 120,
      render: (row) =>
        row.configuration.mode === "coupon" ? "Con cupón" : "Automática",
    },
    {
      key: "benefit",
      header: "Beneficio",
      width: 130,
      render: (row) =>
        `${row.configuration.benefit}${row.configuration.discountType === "percentage" ? " %" : " · Monto fijo"}`,
    },
    {
      key: "period",
      header: "Vigencia (Lima)",
      width: 200,
      render: (row) =>
        `${row.configuration.validFrom.replace("T", " ")} al ${row.configuration.validUntil.replace("T", " ")}`,
    },
    {
      key: "status",
      header: "Estado",
      width: 110,
      render: (row) => (
        <StatusBadge>{couponStatusLabel(row.status)}</StatusBadge>
      ),
    },
    {
      key: "priority",
      header: "Prioridad",
      width: 85,
      align: "right",
      render: (row) => row.configuration.priority,
    },
    {
      key: "actions",
      header: "Acciones",
      width: 130,
      render: (row) => (
        <Group gap="xs">
          <Button
            variant="subtle"
            size="sm"
            component={Link}
            to={`/promociones/${row.id}?${params}`}
            aria-label={`Ver detalle de ${row.name}`}
          >
            Ver detalle
          </Button>
          <Button
            variant="subtle"
            size="sm"
            component={Link}
            to={`/promociones/${row.id}/editar?${params}`}
            aria-label={`Editar ${row.name}`}
          >
            Editar
          </Button>
        </Group>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Ofertas y promociones"
        description="Configura beneficios, vigencia, canales y alcance comercial."
        actions={
          <Button
            component={Link}
            to={`/promociones/nueva?${params}`}
            disabled={state.status === "error" && state.access}
          >
            Crear promoción
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Los registros y cambios son simulados y se reinician al recargar.
        </FeedbackAlert>
        <FilterBar
          summary={
            state.status === "success"
              ? `${state.result.total} promociones encontradas`
              : "Consulta de promociones"
          }
        >
          <Select
            label="Estado de promoción"
            value={status}
            data={[
              { value: "all", label: "Todos" },
              { value: "active", label: "Activo" },
              { value: "inactive", label: "Inactivo" },
            ]}
            onChange={(value) => update("estado", value ?? "all")}
          />
          <Select
            label="Modalidad"
            value={kind}
            data={[
              { value: "all", label: "Todas" },
              { value: "automatic", label: "Automática" },
              { value: "coupon", label: "Con cupón" },
            ]}
            onChange={(value) => update("modalidad", value ?? "all")}
          />
          <Button
            variant="subtle"
            onClick={clear}
            disabled={status === "all" && kind === "all"}
          >
            Limpiar filtros
          </Button>
        </FilterBar>
        <EntityTable
          caption="Promociones administrativas"
          rows={state.status === "success" ? state.result.items : []}
          columns={columns}
          rowKey={(row) => row.id}
          state={
            state.status === "error"
              ? {
                  status: "error",
                  message: state.message,
                  action: state.access ? undefined : (
                    <Button
                      variant="outline"
                      onClick={() => update("escenario", "default", false)}
                    >
                      Volver a consultar
                    </Button>
                  ),
                }
              : { status: state.status }
          }
          empty={{
            title:
              status === "all" && kind === "all"
                ? "Todavía no hay promociones"
                : "Sin coincidencias",
            description: "No hay promociones en esta consulta.",
            action: (
              <Button variant="outline" onClick={clear}>
                Restablecer filtros
              </Button>
            ),
          }}
          pagination={
            state.status === "success"
              ? {
                  page: state.result.page,
                  pageSize,
                  total: state.result.total,
                  onChange: (value) => update("pagina", String(value), false),
                }
              : undefined
          }
        />
      </Stack>
    </>
  );
}
