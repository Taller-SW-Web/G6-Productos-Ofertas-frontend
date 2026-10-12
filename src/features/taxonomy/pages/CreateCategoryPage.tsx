import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Group,
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
import { useCategoryTree } from "../hooks/useCategoryTree";
import { useCreateCategory } from "../hooks/useCreateCategory";
import type { CategoryFormScenario } from "../services/categoryRepository";

const scenarios: { value: CategoryFormScenario; label: string }[] = [
  { value: "default", label: "Por defecto" },
  { value: "slug-sin-colision", label: "Slug sin colisión" },
  { value: "slug-con-colision", label: "Slug con colisión" },
  { value: "slug-carrera-409", label: "Colisión al guardar (409)" },
];

// MK-008-S02: crear categoría en `/categorias/nueva`.
// MK-008-S02-C: confirmación de slug SEO (mismo flujo; ruta `/categorias/confirmar-slug`).
export function CreateCategoryPage() {
  const navigate = useNavigate();
  const { state: treeState } = useCategoryTree();
  const [params, setParams] = useSearchParams();
  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";
  const rawScenario = params.get("escenario");
  const scenario: CategoryFormScenario = scenarios.some(
    (item) => item.value === rawScenario,
  )
    ? (rawScenario as CategoryFormScenario)
    : "default";

  const { phase, slugCheck, slug, error, creado, setSlug, comprobar, confirmar, cerrar } =
    useCreateCategory(scenario);

  const [nombre, setNombre] = useState("");
  const [padreId, setPadreId] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [nombreError, setNombreError] = useState<string | null>(null);

  const padres = useMemo(
    () =>
      treeState.status === "success"
        ? treeState.nodos.map((nodo) => ({
            value: nodo.id,
            label: nodo.nombre,
          }))
        : [],
    [treeState],
  );

  const modalAbierto =
    phase === "comprobando" || phase === "confirmando" || phase === "guardando";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) {
      setNombreError("Ingresa el nombre de la categoría.");
      return;
    }
    setNombreError(null);
    comprobar(limpio);
  };

  const handleConfirmar = () => {
    if (!slugCheck || phase === "comprobando") return;
    confirmar({
      nombre: nombre.trim(),
      slug: slug.trim(),
      padreId: padreId ?? undefined,
      descripcion: descripcion.trim() || undefined,
    });
  };

  const reiniciar = () => {
    setNombre("");
    setPadreId(null);
    setDescripcion("");
    setNombreError(null);
    cerrar();
  };

  return (
    <>
      <PageHeader
        title="Crear categoría"
        description="Registra una nueva categoría o subcategoría en la taxonomía de productos."
        breadcrumbs={[
          { label: "Categorías", to: "/categorias" },
          { label: "Crear" },
        ]}
      />
      <Stack gap="lg">
        {isRevisionMode && (
          <Select
            label="Escenario de revisión del piloto"
            value={scenario}
            data={scenarios}
            maw={320}
            onChange={(value) => {
              const option = scenarios.find((item) => item.value === value);
              if (!option) return;
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("escenario", option.value);
                return next;
              });
            }}
          />
        )}
        {creado ? (
          <FeedbackAlert
            semantic="success"
            title="Categoría creada"
            actions={
              <Group gap="sm">
                <Button onClick={() => navigate("/categorias")}>
                  Volver al árbol de categorías
                </Button>
                <Button variant="outline" onClick={reiniciar}>
                  Crear otra categoría
                </Button>
              </Group>
            }
          >
            {`Se creó «${creado.nombre}» con el slug «${creado.slug}». La creación es simulada y no se guarda en un backend.`}
          </FeedbackAlert>
        ) : (
          <>
            <FeedbackAlert semantic="info" title="Datos de demostración">
              El formulario es simulado. No crea categorías reales ni envía
              datos a un backend.
            </FeedbackAlert>
            <SectionCard
              title="Datos de la categoría"
              description="El slug de la URL se propone a partir del nombre y se confirma en el siguiente paso."
            >
              <form onSubmit={handleSubmit} noValidate>
                <Stack gap="md">
                  <TextInput
                    label="Nombre"
                    withAsterisk
                    value={nombre}
                    error={nombreError}
                    placeholder="Ej. Calzado urbano"
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
                      onClick={() => navigate("/categorias")}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" loading={phase === "comprobando"}>
                      Crear categoría
                    </Button>
                  </Group>
                </Stack>
              </form>
            </SectionCard>
          </>
        )}
      </Stack>

      <ConfirmDialog
        opened={modalAbierto}
        title="Confirmar slug SEO"
        confirmLabel="Crear categoría"
        submitting={phase === "guardando"}
        onCancel={cerrar}
        onConfirm={handleConfirmar}
        error={
          error ? (
            <FeedbackAlert semantic="error" title="No se pudo crear la categoría">
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
                de crear.
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
                          if (slugCheck.alternativo) setSlug(slugCheck.alternativo);
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
                onChange={(event) => setSlug(event.currentTarget.value)}
              />
            </>
          )}
        </Stack>
      </ConfirmDialog>
    </>
  );
}
