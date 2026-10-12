import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconEye,
  IconListDetails,
  IconPencil,
  IconPlus,
} from "@tabler/icons-react";
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
import { useCharacteristicList } from "../hooks/useCharacteristicList";
import { estadoCaracteristicaSemantic } from "../services/estadoSemantic";
import {
  describirReglaCaracteristica,
  etiquetaTipoCaracteristica,
} from "../services/characteristicPresentation";
import {
  scenariosCaracteristicas,
  type CharacteristicListScenario,
} from "../services/characteristicRepository";
import type {
  CharacteristicCatalogConfig,
  CharacteristicListItem,
} from "../types";

const configVacia: CharacteristicCatalogConfig = {
  maxTexto: 0,
  maxValoresLista: 0,
};

export function CharacteristicListPage() {
  const [params] = useSearchParams();
  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";

  return <CharacteristicListContent isRevisionMode={isRevisionMode} />;
}

function CharacteristicListContent({
  isRevisionMode,
}: {
  isRevisionMode: boolean;
}) {
  const navigate = useNavigate();
  const [scenario, setScenario] =
    useState<CharacteristicListScenario>("default");
  const [revision, setRevision] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const { state } = useCharacteristicList(scenario, revision);

  const resultado = state.status === "success" ? state.result : undefined;
  const caracteristicas = useMemo(
    () => resultado?.caracteristicas ?? [],
    [resultado],
  );
  const config = resultado?.config ?? configVacia;
  const termino = busqueda.trim().toLocaleLowerCase("es");

  const filas = useMemo(
    () =>
      caracteristicas.filter(
        (item) =>
          termino === "" ||
          item.nombre.toLocaleLowerCase("es").includes(termino),
      ),
    [caracteristicas, termino],
  );

  const columnas: TableColumn<CharacteristicListItem>[] = [
    {
      key: "nombre",
      header: "Característica",
      render: (item) => (
        <Text size="sm" fw={600}>
          {item.nombre}
        </Text>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      width: 120,
      render: (item) => etiquetaTipoCaracteristica[item.tipo],
    },
    {
      key: "regla",
      header: "Regla",
      render: (item) => describirReglaCaracteristica(item, config),
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
      key: "acciones",
      header: "Acciones",
      width: 170,
      align: "right",
      render: (item) => (
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            aria-label={`Ver detalle de ${item.nombre}`}
            onClick={() => navigate(`/caracteristicas/${item.id}`)}
          >
            <IconEye size={16} stroke={2} aria-hidden="true" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            aria-label={`Editar ${item.nombre}`}
            onClick={() => navigate(`/caracteristicas/${item.id}/editar`)}
          >
            <IconPencil size={16} stroke={2} aria-hidden="true" />
          </ActionIcon>
          {item.tipo === "LISTA" && (
              <ActionIcon
                variant="subtle"
                aria-label={`Administrar valores de ${item.nombre}`}
                onClick={() => navigate(`/caracteristicas/${item.id}/valores`)}
              >
                <IconListDetails size={16} stroke={2} aria-hidden="true" />
              </ActionIcon>
          )}
        </Group>
      ),
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
                onClick={() => {
                  setScenario("default");
                  setRevision((value) => value + 1);
                }}
              >
                Volver a intentar
              </Button>
            ),
          }
        : { status: "success" };

  const vacio =
    caracteristicas.length === 0
      ? {
          title: "Sin características",
          description:
            "Aún no hay características registradas para el catálogo de productos.",
        }
      : {
          title: "Sin resultados",
          description:
            "Ninguna característica coincide con la búsqueda. Ajusta el término e inténtalo de nuevo.",
        };

  return (
    <>
      <PageHeader
        title="Gestión de características"
        description="Administra atributos tipados para los esquemas definidos por tipo de producto."
        breadcrumbs={[{ label: "Taxonomía" }, { label: "Características" }]}
        actions={
          <Button
            leftSection={<IconPlus size={16} stroke={2} aria-hidden="true" />}
            onClick={() => navigate("/caracteristicas/nueva")}
          >
            Crear característica
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Las características mostradas son simuladas. Esta pantalla no consulta
          ni modifica características reales del catálogo.
        </FeedbackAlert>
        {isRevisionMode && (
          <Select
            label="Escenario de revisión del piloto"
            value={scenario}
            data={scenariosCaracteristicas}
            maw={320}
            onChange={(value) => {
              const opcion = scenariosCaracteristicas.find(
                (item) => item.value === value,
              );
              if (opcion) setScenario(opcion.value);
            }}
          />
        )}
        <FilterBar summary={`${filas.length} características visibles`}>
          <Box w={320}>
            <SearchField
              label="Buscar característica"
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Nombre de la característica"
            />
          </Box>
        </FilterBar>
        <EntityTable
          caption="Listado de características"
          columns={columnas}
          rows={filas}
          rowKey={(item) => item.id}
          state={tablaState}
          minWidth={900}
          empty={vacio}
        />
      </Stack>
    </>
  );
}
