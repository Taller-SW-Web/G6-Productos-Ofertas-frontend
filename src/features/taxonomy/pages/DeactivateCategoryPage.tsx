import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Group, Loader, Stack, Text } from "@mantine/core";
import {
  ConfirmDialog,
  FeedbackAlert,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../../components/shared";
import { CampoDato } from "../components/CampoDato";
import { ListaBloqueos } from "../components/ListaBloqueos";
import { SeguimientoBaja } from "../components/SeguimientoBaja";
import { useSeguimientoBaja } from "../hooks/useSeguimientoBaja";
import { useCategoryDetail } from "../hooks/useCategoryDetail";
import { useSolicitarBaja } from "../hooks/useSolicitarBaja";
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
  const { state, reload } = useCategoryDetail(id);
  const tracking = useSeguimientoBaja("categoria", id);
  useEffect(() => { if (tracking.estado === "confirmada") reload(); }, [tracking.estado, reload]);

  const contenido =
    state.status === "loading" ? (
      <Group gap="sm" role="status">
        <Loader size="sm" />
        <Text size="sm">Cargando categoría…</Text>
      </Group>
    ) : state.status === "error" ? (
      <FeedbackAlert semantic="error" title="No se pudo cargar la categoría" actions={tracking.estado === "confirmada" ? <Button onClick={reload}>Consultar detalle nuevamente</Button> : undefined}>
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
    ) : tracking.estado === "confirmada" && state.detalle.estado === "Activo" ? (
      <FeedbackAlert semantic="warning" title="Detalle aún no actualizado">La baja está confirmada; consulta nuevamente el detalle antes de modificar la categoría.</FeedbackAlert>
    ) : (
      <DeactivateCategoryContent detalle={state.detalle} tracking={tracking} />
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
      <Stack gap="lg"><SeguimientoBaja seguimiento={tracking} />{contenido}</Stack>
    </>
  );
}

function DeactivateCategoryContent({ detalle, tracking }: { detalle: CategoryDetail; tracking: ReturnType<typeof useSeguimientoBaja> }) {
  const navigate = useNavigate();
  const { state, solicitar, reiniciar } =
    useSolicitarBaja(detalle.id, tracking.registrar);
  const [confirmar, setConfirmar] = useState(false);

  const cerrarDialogo = () => {
    setConfirmar(false);
    reiniciar();
  };

  const resultado = state.status === "success" ? state.result : null;

  return (
    <>
      {resultado === null || (resultado.resultado === "verificando" && tracking.estado === "rechazada") ? (
        <>
          {tracking.estado !== "rechazada" && (
          <FeedbackAlert semantic="warning" title="Confirmación requerida">
            Antes de aplicar la baja, el sistema verifica que la categoría no
            tenga subcategorías ni productos activos.
          </FeedbackAlert>
          )}
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
              variant="outline"
              disabled={detalle.estado !== "Activo" || tracking.estado === "recuperando" || tracking.estado === "pendiente" || tracking.estado === "error" || tracking.estado === "confirmada"}
              onClick={() => { reiniciar(); setConfirmar(true); }}
            >
              Solicitar desactivación
            </Button>
          </Group>
        </>
      ) : resultado.resultado === "verificando" ? null : (
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
