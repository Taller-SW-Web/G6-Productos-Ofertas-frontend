import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Box, Button, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import {
  EntityTable,
  FeedbackAlert,
  FilterBar,
  PageHeader,
  SearchField,
  StatusBadge,
  type TableColumn,
  type TableState,
} from "../../../components/shared";
import { useBrandList } from "../hooks/useBrandList";
import type { BrandListItem } from "../types";

export function BrandListPage() {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const { state } = useBrandList(revision);

  const resultado = state.status === "success" ? state.result : undefined;
  const marcas = useMemo(() => resultado?.items ?? [], [resultado]);
  const termino = busqueda.trim().toLocaleLowerCase("es");

  const filas = useMemo(
    () => marcas.filter((item) => termino === "" || item.nombre.toLocaleLowerCase("es").includes(termino)),
    [marcas, termino],
  );

  const columnas: TableColumn<BrandListItem>[] = [
    {
      key: "logo",
      header: "Logo",
      width: 80,
      render: (item) => (
        <Avatar src={item.logoUrl ?? undefined} alt={`Logo de ${item.nombre}`} size={40} color="gray">
          {item.nombre.slice(0, 2)}
        </Avatar>
      ),
    },
    {
      key: "nombre",
      header: "Marca",
      render: (item) => (
        <Text size="sm" fw={600} style={{ cursor: "pointer" }} onClick={() => navigate(`/marcas/${item.marcaId}`)}>
          {item.nombre}
        </Text>
      ),
    },
    {
      key: "pais",
      header: "País de origen",
      width: 140,
      render: (item) => <Text size="sm">{item.paisOrigenIso ?? "—"}</Text>,
    },
    {
      key: "estado",
      header: "Estado",
      width: 120,
      render: (item) => <StatusBadge semantic="neutral">{item.estado}</StatusBadge>,
    },
  ];

  const tablaState: TableState =
    state.status === "loading"
      ? { status: "loading" }
      : state.status === "error"
        ? {
            status: "error",
            message: state.message,
            action: (
              <Button
                variant="outline"
                onClick={() => setRevision((v) => v + 1)}
              >
                Volver a intentar
              </Button>
            ),
          }
        : { status: "success" };

  const vacio =
    marcas.length === 0
      ? { title: "Sin marcas", description: "Aún no hay marcas registradas." }
      : { title: "Sin resultados", description: "Ninguna marca coincide con la búsqueda." };

  return (
    <>
      <PageHeader
        title="Marcas"
        description="Administra las marcas del catálogo."
        breadcrumbs={[{ label: "Taxonomía" }, { label: "Marcas" }]}
        actions={
          <Button leftSection={<IconPlus size={16} stroke={2} aria-hidden="true" />} onClick={() => navigate("/marcas/nueva")}>
            Nueva marca
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Las marcas mostradas son simuladas. Esta pantalla no consulta ni modifica marcas reales.
        </FeedbackAlert>
        <FilterBar summary={`${filas.length} marcas visibles`}>
          <Box w={320}>
            <SearchField label="Buscar marca" value={busqueda} onChange={setBusqueda} placeholder="Nombre de la marca" />
          </Box>
        </FilterBar>
        <EntityTable
          caption="Listado de marcas"
          columns={columnas}
          rows={filas}
          rowKey={(item) => item.marcaId}
          state={tablaState}
          minWidth={700}
          empty={vacio}
        />
      </Stack>
    </>
  );
}