import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Stack, Text } from "@mantine/core";
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
import { useProductTypeList } from "../hooks/useProductTypeList";
import { estadoCaracteristicaSemantic } from "../services/estadoSemantic";
import type { ProductTypeListItem } from "../types";

export function ProductTypeListPage() {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const { state } = useProductTypeList(revision);

  const resultado = state.status === "success" ? state.result : undefined;
  const tipos = useMemo(() => resultado?.items ?? [], [resultado]);
  const termino = busqueda.trim().toLocaleLowerCase("es");

  const filas = useMemo(
    () =>
      tipos.filter(
        (item) =>
          termino === "" ||
          item.nombre.toLocaleLowerCase("es").includes(termino),
      ),
    [tipos, termino],
  );

  const columnas: TableColumn<ProductTypeListItem>[] = [
    {
      key: "nombre",
      header: "Tipo de producto",
      render: (item) => (
        <Text
          size="sm"
          fw={600}
          style={{ cursor: "pointer", textDecoration: "underline" }}
          onClick={() => navigate(`/tipos-producto/${item.tipoProductoId}`)}
        >
          {item.nombre}
        </Text>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      width: 140,
      render: (item) => (
        <StatusBadge semantic={estadoCaracteristicaSemantic[item.estado]}>
          {item.estado}
        </StatusBadge>
      ),
    },
    {
      key: "contador",
      header: "Características",
      width: 160,
      render: (item) => (
        <Text size="sm">
          {item.caracteristicasAsignadas} de {item.limiteCaracteristicas}
        </Text>
      ),
    },
    {
      key: "schemaVersion",
      header: "Schema version",
      width: 140,
      align: "right",
      render: (item) => <Text size="sm">{item.schemaVersion}</Text>,
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
                onClick={() => setRevision((value) => value + 1)}
              >
                Volver a intentar
              </Button>
            ),
          }
        : { status: "success" };

  const vacio =
    tipos.length === 0
      ? {
          title: "Sin tipos de producto",
          description:
            "Aún no hay tipos de producto registrados para definir esquemas de atributos.",
        }
      : {
          title: "Sin resultados",
          description:
            "Ningún tipo de producto coincide con la búsqueda. Ajusta el término e inténtalo de nuevo.",
        };

  return (
    <>
      <PageHeader
        title="Tipos de producto"
        description="Define el esquema de atributos de cada tipo de producto."
        breadcrumbs={[{ label: "Catálogo" }, { label: "Tipos de producto" }]}
        actions={
          <Button
            leftSection={<IconPlus size={16} stroke={2} aria-hidden="true" />}
            onClick={() => navigate("/tipos-producto/nuevo")}
          >
            Nuevo tipo de producto
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Los tipos de producto mostrados son simulados. Esta pantalla no
          consulta ni modifica tipos reales del catálogo.
        </FeedbackAlert>
        <FilterBar summary={`${filas.length} tipos de producto visibles`}>
          <Box w={320}>
            <SearchField
              label="Buscar tipo de producto"
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Nombre del tipo de producto"
            />
          </Box>
        </FilterBar>
        <EntityTable
          caption="Listado de tipos de producto"
          columns={columnas}
          rows={filas}
          rowKey={(item) => item.tipoProductoId}
          state={tablaState}
          minWidth={700}
          empty={vacio}
        />
      </Stack>
    </>
  );
}