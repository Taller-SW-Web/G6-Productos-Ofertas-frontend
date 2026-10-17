import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconEye,
  IconPencil,
  IconPlus,
  IconPower,
} from "@tabler/icons-react";
import {
  EntityTable,
  FilterBar,
  PageHeader,
  SearchField,
  StatusBadge,
  type TableColumn,
  type TableState,
} from "../../../components/shared";
import { useCategoryTree } from "../hooks/useCategoryTree";
import { estadoSemantic } from "../services/estadoSemantic";
import type { CategoryNode } from "../types";

const STORAGE_KEY = "taxonomy_tree_colapsados";

// MK-008-S01: listado / árbol de categorías en `/categorias`.
export function CategoryTreePage() {
  const navigate = useNavigate();
  const { state } = useCategoryTree();
  const [busqueda, setBusqueda] = useState<string>("");
  const [colapsados, setColapsados] = useState<string[]>(() => {
    try {
      const guardado = sessionStorage.getItem(STORAGE_KEY);
      return guardado ? (JSON.parse(guardado) as string[]) : [];
    } catch {
      return [];
    }
  });

  const alternar = (id: string) => {
    setColapsados((actual) => {
      const siguiente = actual.includes(id)
        ? actual.filter((item) => item !== id)
        : [...actual, id];
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(siguiente));
      } catch {
        // ignorar fallo de almacenamiento
      }
      return siguiente;
    });
  };

  const arbol = useMemo<CategoryNode[]>(
    () => (state.status === "success" ? state.nodos : []),
    [state],
  );
  const termino = busqueda.trim().toLocaleLowerCase("es");

  const filas = useMemo<CategoryNode[]>(() => {
    const coincide = (nodo: CategoryNode): boolean =>
      termino === "" ||
      nodo.nombre.toLocaleLowerCase("es").includes(termino) ||
      (nodo.hijas?.some(coincide) ?? false);

    const acumulado: CategoryNode[] = [];
    const recorrer = (nodos: CategoryNode[]) => {
      for (const nodo of nodos) {
        if (!coincide(nodo)) continue;
        acumulado.push(nodo);
        const colapsado = termino === "" && colapsados.includes(nodo.id);
        if (!colapsado && nodo.hijas?.length) recorrer(nodo.hijas);
      }
    };
    recorrer(arbol);
    return acumulado;
  }, [arbol, termino, colapsados]);

  const columnas: TableColumn<CategoryNode>[] = [
    {
      key: "nombre",
      header: "Nombre",
      render: (nodo) => (
        <Group gap="xs" wrap="nowrap">
          {nodo.hijas?.length ? (
            <ActionIcon
              variant="subtle"
              aria-label={
                colapsados.includes(nodo.id)
                  ? `Expandir ${nodo.nombre}`
                  : `Contraer ${nodo.nombre}`
              }
              onClick={() => alternar(nodo.id)}
            >
              {colapsados.includes(nodo.id) ? (
                <IconChevronRight size={16} stroke={2} aria-hidden="true" />
              ) : (
                <IconChevronDown size={16} stroke={2} aria-hidden="true" />
              )}
            </ActionIcon>
          ) : (
            <Box w={28} aria-hidden="true" />
          )}
          <Box style={{ paddingLeft: nodo.nivel * 16 }}>
            <UnstyledButton onClick={() => navigate(`/categorias/${nodo.id}`)}>
              <Text size="sm" fw={nodo.nivel === 0 ? 600 : 400}>
                {nodo.nombre}
              </Text>
            </UnstyledButton>
          </Box>
        </Group>
      ),
    },
    {
      key: "nivel",
      header: "Nivel",
      width: 80,
      align: "right",
      render: (nodo) => nodo.nivel,
    },
    {
      key: "estado",
      header: "Estado",
      width: 180,
      render: (nodo) => (
        <StatusBadge semantic={estadoSemantic[nodo.estado]}>
          {nodo.estado}
        </StatusBadge>
      ),
    },
    {
      key: "acciones",
      header: "Acciones",
      width: 160,
      align: "right",
      render: (nodo) => (
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            aria-label={`Ver ${nodo.nombre}`}
            onClick={() => navigate(`/categorias/${nodo.id}`)}
          >
            <IconEye size={16} stroke={2} aria-hidden="true" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            aria-label={`Editar ${nodo.nombre}`}
            onClick={() => navigate(`/categorias/${nodo.id}/editar`)}
          >
            <IconPencil size={16} stroke={2} aria-hidden="true" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            aria-label={`Desactivar ${nodo.nombre}`}
            disabled={nodo.estado !== "Activo"}
            onClick={() => navigate(`/categorias/${nodo.id}/desactivar`)}
          >
            <IconPower size={16} stroke={2} aria-hidden="true" />
          </ActionIcon>
        </Group>
      ),
    },
  ];

  const tablaState: TableState =
    state.status === "loading"
      ? { status: "loading" }
      : state.status === "error"
        ? { status: "error", message: state.message }
        : { status: "success" };

  const vacio =
    arbol.length === 0
      ? {
          title: "Sin categorías",
          description:
            "Aún no hay categorías registradas en la taxonomía de productos.",
        }
      : {
          title: "Sin resultados",
          description:
            "Ninguna categoría coincide con la búsqueda. Ajusta el término e inténtalo de nuevo.",
        };

  return (
    <>
      <PageHeader
        title="Categorías"
        description="Administra el árbol de categorías y subcategorías del catálogo."
        breadcrumbs={[{ label: "Taxonomía" }, { label: "Categorías" }]}
        actions={
          <Button
            leftSection={<IconPlus size={16} stroke={2} aria-hidden="true" />}
            onClick={() => navigate("/categorias/nueva")}
          >
            Crear categoría
          </Button>
        }
      />
      <Stack gap="lg">
        <FilterBar summary={`${filas.length} categorías visibles`}>
          <Box w={320}>
            <SearchField
              label="Buscar categoría"
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Nombre de la categoría"
            />
          </Box>
        </FilterBar>
        <EntityTable
          caption="Árbol de categorías"
          columns={columnas}
          rows={filas}
          rowKey={(nodo) => nodo.id}
          state={tablaState}
          minWidth={900}
          empty={vacio}
        />
      </Stack>
    </>
  );
}
