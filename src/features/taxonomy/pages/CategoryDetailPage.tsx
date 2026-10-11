import type { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Anchor,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconPencil, IconPower } from "@tabler/icons-react";
import {
  EntityTable,
  FeedbackAlert,
  PageHeader,
  SectionCard,
  StatusBadge,
  type TableColumn,
} from "../../../components/shared";
import { useCategoryDetail } from "../hooks/useCategoryDetail";
import {
  scenariosCatalogo,
  type CategoryCatalogScenario,
} from "../services/categoryRepository";
import { estadoSemantic } from "../services/estadoSemantic";
import type { CategoryNode } from "../types";

function parseCatalogScenario(raw: string | null): CategoryCatalogScenario {
  return scenariosCatalogo.some((item) => item.value === raw)
    ? (raw as CategoryCatalogScenario)
    : "default";
}

function CampoDato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <Group gap="xs" align="flex-start" wrap="wrap">
      <Text size="sm" fw={600} w={140}>
        {etiqueta}
      </Text>
      <Group gap="xs" align="center" wrap="wrap">
        {children}
      </Group>
    </Group>
  );
}

const columnasHijas: TableColumn<CategoryNode>[] = [
  {
    key: "nombre",
    header: "Nombre",
    render: (nodo) => (
      <Anchor component={Link} to={`/MK008/S05/${nodo.id}`} size="sm">
        {nodo.nombre}
      </Anchor>
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
];

export function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Categoría no encontrada">
        La dirección no incluye una categoría para consultar.
      </FeedbackAlert>
    );
  }
  return <CategoryDetailLoader key={id} id={id} />;
}

function CategoryDetailLoader({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";
  const catalogScenario = parseCatalogScenario(params.get("escenario"));
  const { state } = useCategoryDetail(id, catalogScenario);

  const titulo =
    state.status === "success" ? state.detalle.nombre : "Detalle de categoría";

  return (
    <>
      <PageHeader
        title={titulo}
        description="Consulta los datos de la categoría y sus subcategorías."
        breadcrumbs={[
          { label: "Categorías", to: "/MK008/S01" },
          {
            label: state.status === "success" ? state.detalle.nombre : "Detalle",
          },
        ]}
      />
      <Stack gap="lg">
        {isRevisionMode && (
          <Select
            label="Escenario de revisión de carga"
            value={catalogScenario}
            data={scenariosCatalogo}
            maw={320}
            onChange={(next) => {
              if (!next) return;
              setParams((prev) => {
                const copy = new URLSearchParams(prev);
                copy.set("escenario", next);
                return copy;
              });
            }}
          />
        )}
        {state.status === "loading" && (
          <Group gap="sm" role="status">
            <Loader size="sm" />
            <Text size="sm">Cargando categoría…</Text>
          </Group>
        )}
        {state.status === "error" && (
          <FeedbackAlert semantic="error" title="No se pudo cargar la categoría">
            {state.message}
          </FeedbackAlert>
        )}
        {state.status === "not-found" && (
          <FeedbackAlert
            semantic="warning"
            title="Categoría no encontrada"
            actions={
              <Button variant="outline" onClick={() => navigate("/MK008/S01")}>
                Volver al árbol de categorías
              </Button>
            }
          >
            La categoría solicitada no existe o ya no está disponible.
          </FeedbackAlert>
        )}
        {state.status === "success" && (
          <>
            <FeedbackAlert semantic="info" title="Datos de demostración">
              El detalle es simulado. Esta pantalla no consulta categorías reales
              del catálogo.
            </FeedbackAlert>
            <SectionCard
              title="Información general"
              description="Datos de la categoría en la taxonomía."
              actions={
                <Group gap="sm">
                  <Button
                    leftSection={
                      <IconPencil size={16} stroke={2} aria-hidden="true" />
                    }
                    onClick={() => navigate(`/MK008/S03/${state.detalle.id}`)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    disabled
                    leftSection={
                      <IconPower size={16} stroke={2} aria-hidden="true" />
                    }
                  >
                    Desactivar
                  </Button>
                </Group>
              }
            >
              <Stack gap="sm">
                <CampoDato etiqueta="Nombre">{state.detalle.nombre}</CampoDato>
                <CampoDato etiqueta="Slug">{state.detalle.slug}</CampoDato>
                <CampoDato etiqueta="Nivel">{state.detalle.nivel}</CampoDato>
                <CampoDato etiqueta="Orden">{state.detalle.orden}</CampoDato>
                <CampoDato etiqueta="Estado">
                  <StatusBadge semantic={estadoSemantic[state.detalle.estado]}>
                    {state.detalle.estado}
                  </StatusBadge>
                </CampoDato>
                <CampoDato etiqueta="Categoría padre">
                  {state.detalle.padreId && state.detalle.padreNombre ? (
                    <Anchor
                      component={Link}
                      to={`/MK008/S05/${state.detalle.padreId}`}
                      size="sm"
                    >
                      {state.detalle.padreNombre}
                    </Anchor>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Categoría raíz
                    </Text>
                  )}
                </CampoDato>
                <CampoDato etiqueta="Descripción">
                  {state.detalle.descripcion ? (
                    state.detalle.descripcion
                  ) : (
                    <Text size="sm" c="dimmed">
                      Sin descripción
                    </Text>
                  )}
                </CampoDato>
              </Stack>
            </SectionCard>
            <SectionCard
              title="Subcategorías"
              description="Categorías hijas directas de esta categoría."
            >
              <EntityTable
                caption="Subcategorías"
                columns={columnasHijas}
                rows={state.detalle.hijas}
                rowKey={(nodo) => nodo.id}
                state={{ status: "success" }}
                minWidth={520}
                empty={{
                  title: "Sin subcategorías",
                  description:
                    "Esta categoría no tiene subcategorías registradas.",
                }}
              />
            </SectionCard>
          </>
        )}
      </Stack>
    </>
  );
}
