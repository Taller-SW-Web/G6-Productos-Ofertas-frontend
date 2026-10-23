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
  ConfirmDialog,
  FeedbackAlert,
  PageHeader,
  SectionCard,
} from "../../../components/shared";
import { SufijoResaltado } from "../components/SufijoResaltado";
import { useCategoryDetail } from "../hooks/useCategoryDetail";
import { useCategoryTree } from "../hooks/useCategoryTree";
import { useUpdateCategory } from "../hooks/useUpdateCategory";
import type { CategoryDetail } from "../types";

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
    slugCheck,
    slug,
    setSlug,
    comprobar,
    cerrar,
    actualizar,
  } = useUpdateCategory();

  const [nombre, setNombre] = useState(detalle.nombre);
  const [padreId, setPadreId] = useState<string | null>(detalle.padreId ?? null);
  const [descripcion, setDescripcion] = useState(detalle.descripcion ?? "");
  const [orden, setOrden] = useState<number>(detalle.orden);
  const [imagenUrl, setImagenUrl] = useState<string>(detalle.imagen ?? "");
  const [nombreError, setNombreError] = useState<string | null>(null);

  const tieneSubcategorias = detalle.hijas.length > 0;
  const modalAbierto =
    phase === "comprobando" || phase === "confirmando" || phase === "guardando";

  // SPEC-008 / MK-008: máximo dos niveles. Solo las categorías raíz pueden ser
  // padre. Si la categoría que se edita ya tiene subcategorías, no puede moverse
  // bajo otra categoría porque sus hijas pasarían a un tercer nivel.
  const padres = useMemo(() => {
    if (treeState.status !== "success" || tieneSubcategorias) return [];
    return treeState.nodos
      .filter((raiz) => raiz.estado === "Activo")
      .flatMap((raiz) => [
        {
          value: raiz.id,
          label:
            raiz.id === detalle.id
              ? `${raiz.nombre} (no puede ser su propio padre)`
              : raiz.nombre,
          disabled: raiz.id === detalle.id,
        },
        ...(raiz.hijas ?? []).map((hija) => ({
          value: hija.id,
          label: `${raiz.nombre} / ${hija.nombre} (no puede ser padre: máximo dos niveles)`,
          disabled: true,
        })),
      ]);
  }, [treeState, detalle.id, tieneSubcategorias]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      setNombreError("Ingresa el nombre de la categoría.");
      return;
    }
    setNombreError(null);
    if (limpio !== detalle.nombre) {
      comprobar(limpio);
      return;
    }
    actualizar({
      id: detalle.id,
      nombre: limpio,
      // Category administration does not edit SEO slugs; MK-012 owns that task.
      slug: detalle.slug,
      padreId: padreId ?? undefined,
      descripcion: descripcion.trim() || undefined,
      orden,
      imagen: imagenUrl.trim() || undefined,
    });
  };

  const handleConfirmar = () => {
    if (!slugCheck || phase !== "confirmando" || slug.trim() !== slugCheck.slug)
      return;
    actualizar({
      id: detalle.id,
      nombre: nombre.trim(),
      slug: slug.trim(),
      padreId: padreId ?? undefined,
      descripcion: descripcion.trim() || undefined,
      orden,
      imagen: imagenUrl.trim() || undefined,
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
          {`Se actualizó «${resultado.nombre}» con el slug «${resultado.slug}».`}
        </FeedbackAlert>
      ) : (
        <>
          {error && (
            <FeedbackAlert semantic="error" title="No se pudieron guardar los cambios">
              {error}
            </FeedbackAlert>
          )}
          <SectionCard
            title="Datos de la categoría"
            description="Cambiar el nombre o la ubicación no modifica el slug ni los metadatos SEO."
          >
            <form onSubmit={handleSubmit} noValidate>
              <Stack gap="md">
                <TextInput
                  label="Nombre"
                  withAsterisk
                  value={nombre}
                  error={nombreError}
                  disabled={phase === "guardando"}
                  onChange={(event) => setNombre(event.currentTarget.value)}
                />
                <Select
                  label="Categoría padre (opcional)"
                  description={
                    tieneSubcategorias
                      ? "Esta categoría tiene subcategorías: no puede moverse bajo otra categoría."
                      : "Solo dos niveles: el padre debe ser una categoría raíz."
                  }
                  placeholder="Categoría raíz"
                  data={padres}
                  value={padreId}
                  clearable
                  searchable
                  disabled={tieneSubcategorias || phase === "guardando"}
                  nothingFoundMessage="Sin categorías disponibles"
                  onChange={(value) => setPadreId(value)}
                />
                <NumberInput
                  label="Orden"
                  min={0}
                  allowDecimal={false}
                  value={orden}
                  disabled={phase === "guardando"}
                  onChange={(value) =>
                    setOrden(typeof value === "number" ? value : 0)
                  }
                />
                <TextInput
                  label="Imagen (URL)"
                  placeholder="https://ejemplo.com/imagen.png"
                  value={imagenUrl}
                  disabled={phase === "guardando"}
                  onChange={(e) => setImagenUrl(e.currentTarget.value)}
                />
                <Textarea
                  label="Descripción (opcional)"
                  value={descripcion}
                  disabled={phase === "guardando"}
                  autosize
                  minRows={3}
                  onChange={(event) => setDescripcion(event.currentTarget.value)}
                />
                <Group justify="flex-end" gap="sm">
                  <Button
                    variant="outline"
                    disabled={phase === "guardando"}
                    onClick={() => navigate(`/categorias/${detalle.id}`)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" loading={phase === "guardando"}>
                    Guardar cambios
                  </Button>
                </Group>
              </Stack>
            </form>
          </SectionCard>
        </>
      )}
      <ConfirmDialog
        opened={modalAbierto}
        title="Confirmar slug SEO"
        confirmLabel="Guardar cambios"
        submitting={phase === "guardando"}
        confirmDisabled={phase !== "confirmando" || !slugCheck}
        onCancel={cerrar}
        onConfirm={handleConfirmar}
        error={
          error ? (
            <FeedbackAlert semantic="error" title="No se pudo guardar">
              {error}
            </FeedbackAlert>
          ) : undefined
        }
      >
        <Stack gap="md">
          {phase === "comprobando" ? (
            <Text size="sm" role="status">
              Verificando disponibilidad del slug…
            </Text>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                El slug define la URL pública de la categoría. Confírmalo antes
                de guardar.
              </Text>
              {slugCheck && !slugCheck.disponible && (
                <FeedbackAlert
                  semantic="warning"
                  title="El slug ya está en uso"
                  actions={
                    slugCheck.alternativo ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (slugCheck.alternativo) {
                            setSlug(slugCheck.alternativo);
                          }
                        }}
                      >
                        Usar alternativa
                      </Button>
                    ) : undefined
                  }
                >
                  <Text size="sm" component="span">
                    Sugerencia:{" "}
                  </Text>
                  {slugCheck.alternativo ? (
                    <SufijoResaltado
                      base={slugCheck.slug}
                      completo={slugCheck.alternativo}
                    />
                  ) : null}
                </FeedbackAlert>
              )}
              <TextInput
                label="Slug (URL)"
                value={slug}
                disabled={phase === "guardando"}
                onChange={(event) => setSlug(event.currentTarget.value)}
              />
            </>
          )}
        </Stack>
      </ConfirmDialog>
    </>
  );
}
