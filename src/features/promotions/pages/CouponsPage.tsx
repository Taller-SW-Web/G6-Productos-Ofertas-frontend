import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import {
  EntityTable,
  FeedbackAlert,
  FilterBar,
  PageHeader,
  StatusBadge,
  type TableColumn,
} from "../../../components/shared";
import { useCouponList } from "../hooks/useCoupons";
import {
  couponLimitLabel,
  couponStatusLabel,
  couponUsageLabel,
  readCouponScenario,
  readPositiveInteger,
} from "../services/couponPresentation";
import type { CouponQuery, CouponView } from "../services/couponRepository";

export function CouponsPage() {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const status = params.get("estado");
  const query: CouponQuery = {
    status: status === "active" || status === "inactive" ? status : "all",
    page: readPositiveInteger(params.get("pagina"), 1, Number.MAX_SAFE_INTEGER),
    pageSize: readPositiveInteger(params.get("tamanio"), 10, 100),
  };
  const scenario = readCouponScenario(params);
  const state = useCouponList(query, scenario, revision);
  const update = (status: CouponQuery["status"], page = 1) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (status === "all") next.delete("estado");
      else next.set("estado", status);
      if (page === 1) next.delete("pagina");
      else next.set("pagina", String(page));
      return next;
    });
  const retry = () => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("escenario");
        return next;
      },
      { replace: true },
    );
    setRevision((value) => value + 1);
  };
  const columns: TableColumn<CouponView>[] = [
    {
      key: "code",
      header: "Código",
      width: 180,
      render: (row) => (
        <Text fw={600} size="sm">
          {row.code}
        </Text>
      ),
    },
    {
      key: "promotion",
      header: "Promoción asociada",
      width: 240,
      render: (row) => row.promotion?.name ?? "No disponible",
    },
    {
      key: "status",
      header: "Estado",
      width: 120,
      render: (row) => (
        <StatusBadge>{couponStatusLabel(row.status)}</StatusBadge>
      ),
    },
    {
      key: "uses",
      header: "Uso global",
      width: 140,
      align: "right",
      render: (row) => couponUsageLabel(row.consumedUses),
    },
    {
      key: "limit",
      header: "Límite global",
      width: 140,
      align: "right",
      render: (row) => couponLimitLabel(row.globalLimit),
    },
    {
      key: "actions",
      header: "Acciones",
      width: 180,
      render: (row) => (
        <Group gap="xs">
          <Button
            component={Link}
            to={`/cupones/${row.id}?${params.toString()}`}
            variant="subtle"
            size="sm"
            leftSection={<IconEye size={16} stroke={2} aria-hidden="true" />}
            aria-label={`Ver detalle de ${row.code}`}
          >
            Ver detalle
          </Button>
          <Button
            component={Link}
            to={`/cupones/${row.id}/editar?${params}`}
            variant="subtle"
            size="sm"
            aria-label={`Editar ${row.code}`}
          >
            Editar
          </Button>
        </Group>
      ),
    },
  ];
  const accessBlocked =
    state.status === "error" && state.kind !== "unavailable";
  return (
    <>
      <PageHeader
        actions={
          <Button
            component={Link}
            to={`/cupones/nuevo?${params.toString()}`}
            disabled={accessBlocked}
          >
            Crear cupón
          </Button>
        }
        title="Cupones de descuento"
        description="Consulta la configuración, los límites y el uso global de los cupones."
        breadcrumbs={[
          { label: "Promociones" },
          { label: "Cupones de descuento" },
        ]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Los cupones y sus usos son simulados. Esta consulta no accede a
          información comercial real.
        </FeedbackAlert>
        <FilterBar
          summary={
            state.status === "success"
              ? `${state.result.total} cupones encontrados`
              : "Consulta de cupones"
          }
        >
          <Select
            label="Estado del cupón"
            value={query.status}
            data={[
              { value: "all", label: "Todos" },
              { value: "active", label: "Activo" },
              { value: "inactive", label: "Inactivo" },
            ]}
            onChange={(value) => {
              if (value === "all" || value === "active" || value === "inactive")
                update(value);
            }}
          />
          <Button
            variant="subtle"
            disabled={query.status === "all"}
            onClick={() => update("all")}
          >
            Limpiar filtros
          </Button>
        </FilterBar>
        {accessBlocked ? (
          <FeedbackAlert
            semantic="warning"
            title={
              state.kind === "session"
                ? "Verifica tu sesión"
                : "Acceso no disponible"
            }
          >
            {state.message}
          </FeedbackAlert>
        ) : (
          <EntityTable
            caption="Cupones de descuento"
            columns={columns}
            rows={state.status === "success" ? state.result.items : []}
            rowKey={(row) => row.id}
            state={
              state.status === "error"
                ? {
                    ...state,
                    action: (
                      <Button variant="outline" onClick={retry}>
                        Volver a consultar
                      </Button>
                    ),
                  }
                : { status: state.status }
            }
            empty={{
              title:
                query.status === "all"
                  ? "Todavía no hay cupones"
                  : "Sin coincidencias",
              description:
                query.status === "all"
                  ? "No hay cupones registrados en esta consulta."
                  : "No hay cupones con el estado seleccionado.",
              action:
                query.status !== "all" ? (
                  <Button variant="outline" onClick={() => update("all")}>
                    Restablecer filtros
                  </Button>
                ) : undefined,
            }}
            pagination={
              state.status === "success"
                ? {
                    page: state.result.page,
                    pageSize: query.pageSize,
                    total: state.result.total,
                    onChange: (page) => update(query.status, page),
                  }
                : undefined
            }
          />
        )}
      </Stack>
    </>
  );
}
