import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Group, Loader, Select, Stack, Text } from "@mantine/core";
import {
  ConfirmDialog,
  FeedbackAlert,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../../components/shared";
import { CampoDato } from "../components/CampoDato";
import { ListaBloqueos } from "../components/ListaBloqueos";
import { useCategoryDetail } from "../hooks/useCategoryDetail";
import { useSolicitarBaja } from "../hooks/useSolicitarBaja";
import {
  scenariosBaja,
  scenariosCatalogo,
} from "../services/categoryRepository";
import { parseBajaScenario, parseCatalogScenario } from "../services/scenarioParams";
import { estadoSemantic } from "../services/estadoSemantic";
import type { CategoryDetail } from "../types";

// MK-008-S04 / S04-P / S04-B: solicitud de baja y resultado de verificación
// en `/categorias/:id/desactivar`.
export function DeactivateCategoryPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Categoría no encontrada">
        La dirección no incluye una categoría para desactivar.
      </FeedbackAlert>
    );
  }
  return <DeactivateCategoryLoader key={id} id={id} />;
}

function DeactivateCategoryLoader({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";
  const catalogScenario = parseCatalogScenario(params.get("escenario"));
  const { state } = useCategoryDetail(id, catalogScenario);

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
      <DeactivateCategoryContent
        detalle={state.detalle}
        isRevisionMode={isRevisionMode}
      />
    );

  return (
    <>
      <PageHeader
        title="Desactivar categoría"
        description="Solicita la baja de una categoría de la taxonomía de productos."
        breadcrumbs={[
          { label: "Categorías", to: "/categorias" },
          { label: "Desactivar" },
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
        {contenido}
      </Stack>
    </>
  );
}

function DeactivateCategoryContent({
  detalle,
  isRevisionMode,
}: {
  detalle: CategoryDetail;
  isRevisionMode: boolean;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const bajaScenario = parseBajaScenario(params.get("baja"));
  const { state, solicitar, reiniciar } = useSolicitarBaja(detalle.id, bajaScenario);
  const [confirmar, setConfirmar] = useState(false);

  const cerrarDialogo = () => {
    setConfirmar(false);
    reiniciar();
  };

  const resultado = state.status === "success" ? state.result : null;

  return (
    <>
      {isRevisionMode && (
        <Select
          label="Escenario de revisión de la baja"
          value={bajaScenario}
          data={scenariosBaja}
          maw={360}
          onChange={(next) => {
            if (!next) return;
            setParams((prev) => {
              const copy = new URLSearchParams(prev);
              copy.set("baja", next);
              return copy;
            });
          }}
        />
      )}
      {resultado === null ? (
        <>
          <FeedbackAlert semantic="warning" title="Confirmación requerida">
            Antes de aplicar la baja, el sistema verifica que la categoría no
            tenga subcategorías ni productos activos.
          </FeedbackAlert>
          <SectionCard
            title="Categoría a desactivar"
            description="Revisa los datos antes de solicitar la baja."
            actions={
              <StatusBadge semantic={estadoSemantic[detalle.estado]}>
                {detalle.estado}
              </StatusBadge>
            }
          >
            <Stack gap="sm">
              <CampoDato etiqueta="Nombre">{detalle.nombre}</CampoDato>
              <CampoDato etiqueta="Slug">{detalle.slug}</CampoDato>
              <CampoDato etiqueta="Nivel">{detalle.nivel}</CampoDato>
              <CampoDato etiqueta="Subcategorías">{detalle.hijas.length}</CampoDato>
            </Stack>
          </SectionCard>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="outline"
              onClick={() => navigate(`/categorias/${detalle.id}`)}
            >
              Cancelar
            </Button>
            <Button
              color="danger"
              disabled={detalle.estado !== "Activo"}
              onClick={() => setConfirmar(true)}
            >
              Solicitar desactivación
            </Button>
          </Group>
        </>
      ) : resultado.resultado === "verificando" ? (
        <FeedbackAlert
          semantic="warning"
          title="Verificando baja"
          actions={
            <Group gap="sm">
              <Button onClick={() => navigate(`/categorias/${detalle.id}`)}>
                Ver categoría
              </Button>
              <Button variant="outline" onClick={() => navigate("/categorias")}>
                Volver al árbol
              </Button>
            </Group>
          }
        >
          <Stack gap="sm">
            <Text size="sm">{resultado.mensaje}</Text>
            <StatusBadge semantic={estadoSemantic[resultado.categoria.estado]}>
              {resultado.categoria.estado}
            </StatusBadge>
          </Stack>
        </FeedbackAlert>
      ) : (
        <FeedbackAlert
          semantic="error"
          title="Baja rechazada"
          actions={
            <Group gap="sm">
              <Button onClick={() => navigate(`/categorias/${detalle.id}`)}>
                Ver categoría
              </Button>
              <Button variant="outline" onClick={() => navigate("/categorias")}>
                Volver al árbol
              </Button>
            </Group>
          }
        >
          <Stack gap="sm">
            <Text size="sm">{resultado.mensaje}</Text>
            <ListaBloqueos bloqueos={resultado.bloqueos} />
          </Stack>
        </FeedbackAlert>
      )}

      <ConfirmDialog
        opened={confirmar && resultado === null}
        title="Confirmar solicitud de baja"
        confirmLabel="Solicitar baja"
        destructive
        submitting={state.status === "enviando"}
        onCancel={cerrarDialogo}
        onConfirm={solicitar}
        error={
          state.status === "error" ? (
            <FeedbackAlert semantic="error" title="No se pudo verificar la baja">
              {state.message}
            </FeedbackAlert>
          ) : undefined
        }
      >
        <Stack gap="md">
          <Text size="sm">
            {`¿Confirmas que deseas solicitar la desactivación de «${detalle.nombre}»?`}
          </Text>
          <Text size="sm" c="dimmed">
            La categoría quedará marcada como «Verificando baja» hasta completar
            la verificación de dependencias.
          </Text>
        </Stack>
      </ConfirmDialog>
    </>
  );
}
