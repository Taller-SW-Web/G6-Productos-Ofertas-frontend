import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  FeedbackAlert,
  PageHeader,
  SectionCard,
} from "../../../components/shared";
import { useCategoryDetail } from "../hooks/useCategoryDetail";
import { useCategoryTree } from "../hooks/useCategoryTree";
import { useUpdateCategory } from "../hooks/useUpdateCategory";
import type { CategoryDetail, CategoryNode } from "../types";

// MK-008-S03: editar categoría en `/categorias/:id/editar`.
export function EditCategoryPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Categoría no encontrada">
        La dirección no incluye una categoría para editar.
      </FeedbackAlert>
    );
  }
  return <EditCategoryLoader key={id} id={id} />;
}

function EditCategoryLoader({ id }: { id: string }) {
  const navigate = useNavigate();
  const { state } = useCategoryDetail(id);

  const contenido =
    state.status === "loading" ? (
      <Group gap="sm" role="status">
        <Loader size="sm" />
        <Text size="sm">Cargando categoría…</Text>
      </Group>
    ) : state.status === "error" ? (
      <FeedbackAlert semantic="error" title="No se pudo cargar la categoría">
        {state.message}
      </FeedbackAlert>
    ) : state.status === "not-found" ? (
      <FeedbackAlert
        semantic="warning"
        title="Categoría no encontrada"
        actions={
          <Button variant="outline" onClick={() => navigate("/categorias")}>
            Volver al árbol de categorías
          </Button>
        }
      >
        La categoría solicitada no existe o ya no está disponible.
      </FeedbackAlert>
    ) : (
      <EditCategoryForm detalle={state.detalle} />
    );

  return (
    <>
      <PageHeader
        title="Editar categoría"
        description="Actualiza los datos de la categoría seleccionada."
        breadcrumbs={[
          { label: "Categorías", to: "/categorias" },
          { label: "Editar" },
        ]}
      />
      <Stack gap="lg">{contenido}</Stack>
    </>
  );
}

function EditCategoryForm({ detalle }: { detalle: CategoryDetail }) {
  const navigate = useNavigate();

  const { state: treeState } = useCategoryTree();
  const {
    phase,
    error,
    resultado,
    writeOutcomeUnknown,
    actualizar,
  } = useUpdateCategory();

  const [nombre, setNombre] = useState(detalle.nombre);
  const [padreId, setPadreId] = useState<string | null>(detalle.padreId ?? null);
  const [descripcion, setDescripcion] = useState(detalle.descripcion ?? "");
  const [orden, setOrden] = useState<number | null>(detalle.orden);
  const [nombreError, setNombreError] = useState<string | null>(null);

  const padres = useMemo(() => {
    if (treeState.status !== "success") return [];
    const opciones: { value: string; label: string }[] = [];
    const recorrer = (nodos: CategoryNode[], profundidad: number) => {
      for (const nodo of nodos) {
        if (nodo.id === detalle.id) continue;
        opciones.push({
          value: nodo.id,
          label: `${"— ".repeat(profundidad)}${nodo.nombre}`,
        });
        if (nodo.hijas?.length) recorrer(nodo.hijas, profundidad + 1);
      }
    };
    recorrer(treeState.nodos, 0);
    return opciones;
  }, [treeState, detalle.id]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      setNombreError("Ingresa el nombre de la categoría.");
      return;
    }
    if (orden === null) { setNombreError("Ingresa un orden porque el servicio no publicó el valor actual."); return; }
    setNombreError(null);
    actualizar({
      id: detalle.id,
      nombre: limpio,
      // Slugs are edited independently in the SEO workflow.
      slug: detalle.slug ?? "",
      padreId: padreId ?? undefined,
      descripcion: descripcion.trim() || undefined,
      orden,
    });
  };

  return (
    <>
      {resultado ? (
        <FeedbackAlert
          semantic="success"
          title="Categoría actualizada"
          actions={
            <Group gap="sm">
              <Button onClick={() => navigate(`/categorias/${resultado.id}`)}>
                Ver categoría
              </Button>
              <Button variant="outline" onClick={() => navigate("/categorias")}>
                Volver al árbol
              </Button>
            </Group>
          }
        >
          {`Se actualizaron los datos de «${resultado.nombre}». El slug se administra por separado en SEO.`}
        </FeedbackAlert>
      ) : (
        <>
          <SectionCard
            title="Datos de la categoría"
            description="Actualiza nombre, categoría padre, descripción y orden. El slug se administra por separado en SEO."
          >
            {error && <FeedbackAlert semantic="error" title="No se pudo guardar">{error}</FeedbackAlert>}
            <form onSubmit={handleSubmit} noValidate>
              <Stack gap="md">
                <TextInput
                  label="Nombre"
                  withAsterisk
                  value={nombre}
                  error={nombreError}
                  onChange={(event) => setNombre(event.currentTarget.value)}
                />
                <Select
                  label="Categoría padre (opcional)"
                  placeholder="Categoría raíz"
                  data={padres}
                  value={padreId}
                  clearable
                  searchable
                  nothingFoundMessage="Sin categorías disponibles"
                  onChange={(value) => setPadreId(value)}
                />
                <NumberInput
                  label="Orden"
                  min={1}
                  allowDecimal={false}
                  value={orden ?? ""}
                  onChange={(value) =>
                    setOrden(typeof value === "number" ? value : null)
                  }
                />
                <Textarea
                  label="Descripción (opcional)"
                  value={descripcion}
                  autosize
                  minRows={3}
                  onChange={(event) => setDescripcion(event.currentTarget.value)}
                />
                <Group justify="flex-end" gap="sm">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/categorias/${detalle.id}`)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" loading={phase === "guardando"} disabled={writeOutcomeUnknown}>
                    Guardar cambios
                  </Button>
                </Group>
              </Stack>
            </form>
          </SectionCard>
        </>
      )}

    </>
  );
}
