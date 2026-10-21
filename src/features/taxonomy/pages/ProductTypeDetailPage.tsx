import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Group, Loader, Stack, Text } from "@mantine/core";
import { IconPlus, IconPower } from "@tabler/icons-react";
import {
  ConfirmDialog,
  EntityTable,
  FeedbackAlert,
  PageHeader,
  SectionCard,
  StatusBadge,
  type TableColumn,
  type TableState,
} from "../../../components/shared";
import { CampoDato } from "../components/CampoDato";
import { useDesactivarTipoProducto } from "../hooks/useDesactivarTipoProducto";
import { useDesasociarCaracteristica } from "../hooks/useDesasociarCaracteristica";
import { useProductTypeDetail } from "../hooks/useProductTypeDetail";
import { estadoCaracteristicaSemantic } from "../services/estadoSemantic";
import type { ProductTypeAssociation } from "../types";

export function ProductTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Tipo de producto no encontrado">
        La dirección no incluye un tipo de producto para consultar.
      </FeedbackAlert>
    );
  }
  return <ProductTypeDetailContent key={id} id={id} />;
}

function ProductTypeDetailContent({ id }: { id: string }) {
  const navigate = useNavigate();
  const { state, reload } = useProductTypeDetail(id);
  const desasociar = useDesasociarCaracteristica(id, (result) => {
    if (result.resultado === "exito") reload();
  });
  const desactivar = useDesactivarTipoProducto(id, (result) => {
    if (result.resultado === "exito") reload();
  });
  const [confirmDesactivar, setConfirmDesactivar] = useState(false);
  const [confirmDesasociar, setConfirmDesasociar] = useState<string | null>(
    null,
  );

  const confirmarDesasociar = () => {
    if (!confirmDesasociar) return;
    desasociar.enviar(confirmDesasociar);
    setConfirmDesasociar(null);
  };

  const confirmarDesactivar = () => {
    setConfirmDesactivar(false);
    desactivar.enviar();
  };

  const columnasAsociaciones: TableColumn<ProductTypeAssociation>[] = [
    {
      key: "nombre",
      header: "Característica",
      render: (asoc) => (
        <Text size="sm" fw={600}>
          {asoc.caracteristica.nombre}
        </Text>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      width: 100,
      render: (asoc) => asoc.caracteristica.tipo,
    },
    {
      key: "regla",
      header: "Regla",
      render: (asoc) => {
        if (asoc.caracteristica.tipo === "LISTA") {
          return `${asoc.caracteristica.valoresActivos} valores activos`;
        }
        if (asoc.caracteristica.tipo === "NUMERO") {
          return asoc.caracteristica.unidad ?? "sin definir";
        }
        return "Texto";
      },
    },
    {
      key: "estado",
      header: "Estado",
      width: 120,
      render: (asoc) => (
        <StatusBadge semantic={estadoCaracteristicaSemantic[asoc.caracteristica.estado]}>
          {asoc.caracteristica.estado}
        </StatusBadge>
      ),
    },
    {
      key: "obligatoria",
      header: "Condición",
      width: 140,
      render: (asoc) => (asoc.obligatoria ? "Obligatoria" : "Opcional"),
    },
    {
      key: "acciones",
      header: "Acciones",
      width: 120,
      align: "right",
      render: (asoc) => (
        <Button
          variant="outline"
          size="xs"
          onClick={() => setConfirmDesasociar(asoc.caracteristicaId)}
        >
          Desasociar
        </Button>
      ),
    },
  ];

  const detalle = state.status === "success" ? state.detalle : undefined;
  const filas = detalle?.asociadas ?? [];
  const tablaState: TableState = { status: "success" };
  const desasociarPendiente =
    desasociar.state.status === "success" &&
    desasociar.state.result.resultado === "pendiente"
      ? desasociar.state.result.operacionId
      : undefined;
  const desactivarPendiente =
    desactivar.state.status === "success" &&
    desactivar.state.result.resultado === "pendiente"
      ? desactivar.state.result.operacionId
      : undefined;

  // La alerta de «solicitud admitida» (estado success + resultado pendiente) solo
  // se muestra mientras el seguimiento no ha resuelto un estado. Cuando la
  // desasociación/desactivación se confirma, rechaza o sigue en verificación, esa
  // alerta se oculta para no convivir con avisos contradictorios ni duplicados.
  return (
    <>
      <PageHeader
        title={detalle?.nombre ?? "Detalle de tipo de producto"}
        description="Esquema del tipo de producto y características asociadas."
        breadcrumbs={[
          { label: "Catálogo", to: "/tipos-producto" },
          { label: "Tipos de producto", to: "/tipos-producto" },
          { label: detalle?.nombre ?? "Detalle" },
        ]}
      />
      <Stack gap="lg">
        {desasociar.state.status === "enviando" && (
          <FeedbackAlert
            semantic="warning"
            title="Verificando desasociación"
            actions={
              <Button variant="outline" onClick={desasociar.reiniciar}>
                Cancelar comprobación
              </Button>
            }
          >
            Estamos comprobando si la característica puede retirarse sin dejar
            productos o variantes activos en un estado incompatible.
          </FeedbackAlert>
        )}
        {desasociar.state.status === "success" &&
          desasociar.seguimiento.status !== "success" && (
            <FeedbackAlert
              semantic={
                desasociar.state.result.resultado === "exito"
                  ? "success"
                  : desasociar.state.result.resultado === "rechazada"
                    ? "error"
                    : "warning"
              }
              title={
                desasociar.state.result.resultado === "pendiente"
                  ? "Desasociación admitida"
                  : desasociar.state.result.resultado === "rechazada"
                    ? "No se pudo completar"
                    : "Desasociación completada"
              }
              actions={
                <Group gap="sm">
                  {desasociarPendiente && (
                    <Button
                      loading={desasociar.seguimiento.status === "consultando"}
                      onClick={() =>
                        desasociar.consultarEstado(desasociarPendiente, (result) => {
                          if (result.estado === "confirmada") reload();
                        })
                      }
                    >
                      Consultar estado
                    </Button>
                  )}
                  <Button onClick={desasociar.reiniciar}>Entendido</Button>
                </Group>
              }
            >
              {desasociar.state.result.mensaje}
            </FeedbackAlert>
          )}
        {desasociar.seguimiento.status === "success" &&
          desasociar.seguimiento.result.estado === "confirmada" && (
            <FeedbackAlert
              semantic="success"
              title="Desasociación confirmada"
              actions={<Button onClick={desasociar.reiniciar}>Entendido</Button>}
            >
              {desasociar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desasociar.seguimiento.status === "success" &&
          desasociar.seguimiento.result.estado === "pendiente" && (
            <FeedbackAlert
              semantic="warning"
              title="Desasociación aún en verificación"
              actions={
                <Group gap="sm">
                  {desasociarPendiente && (
                    <Button
                      onClick={() =>
                        desasociar.consultarEstado(desasociarPendiente, (result) => {
                          if (result.estado === "confirmada") reload();
                        })
                      }
                    >
                      Consultar estado
                    </Button>
                  )}
                  <Button onClick={desasociar.reiniciar}>Entendido</Button>
                </Group>
              }
            >
              {desasociar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desasociar.seguimiento.status === "success" &&
          desasociar.seguimiento.result.estado === "rechazada" && (
            <FeedbackAlert
              semantic="error"
              title="Desasociación rechazada"
              actions={<Button onClick={desasociar.reiniciar}>Entendido</Button>}
            >
              {desasociar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desasociar.seguimiento.status === "success" &&
          desasociar.seguimiento.result.estado === "no-concluyente" && (
            <FeedbackAlert
              semantic="warning"
              title="Verificación no concluyente"
              actions={<Button onClick={desasociar.reiniciar}>Entendido</Button>}
            >
              {desasociar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desasociar.seguimiento.status === "error" && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo consultar la desasociación"
          >
            {desasociar.seguimiento.message}
          </FeedbackAlert>
        )}
        {desasociar.state.status === "error" && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo desasociar"
            actions={
              <Button variant="outline" onClick={desasociar.reiniciar}>
                Cerrar
              </Button>
            }
          >
            {desasociar.state.message}
          </FeedbackAlert>
        )}

        {desactivar.state.status === "enviando" && (
          <FeedbackAlert
            semantic="warning"
            title="Verificando uso en catálogo"
            actions={
              <Button variant="outline" onClick={desactivar.reiniciar}>
                Cancelar comprobación
              </Button>
            }
          >
            Estamos comprobando si el cambio puede realizarse de forma segura.
            No se ha modificado el esquema todavía.
          </FeedbackAlert>
        )}
        {desactivar.state.status === "success" &&
          desactivar.seguimiento.status !== "success" && (
            <FeedbackAlert
              semantic={
                desactivar.state.result.resultado === "exito"
                  ? "success"
                  : desactivar.state.result.resultado === "rechazada"
                    ? "error"
                    : "warning"
              }
              title={
                desactivar.state.result.resultado === "pendiente"
                  ? "Solicitud de desactivación admitida"
                  : desactivar.state.result.resultado === "rechazada"
                    ? "No se realizó la desactivación"
                    : "Tipo de producto desactivado"
              }
              actions={
                <Group gap="sm">
                  {desactivarPendiente && (
                    <Button
                      loading={desactivar.seguimiento.status === "consultando"}
                      onClick={() =>
                        desactivar.consultarEstado(desactivarPendiente, (result) => {
                          if (result.estado === "confirmada") reload();
                        })
                      }
                    >
                      Consultar estado
                    </Button>
                  )}
                  <Button onClick={desactivar.reiniciar}>Entendido</Button>
                </Group>
              }
            >
              {desactivar.state.result.mensaje}
            </FeedbackAlert>
          )}
        {desactivar.seguimiento.status === "success" &&
          desactivar.seguimiento.result.estado === "confirmada" && (
            <FeedbackAlert
              semantic="success"
              title="Tipo de producto desactivado"
              actions={<Button onClick={desactivar.reiniciar}>Entendido</Button>}
            >
              {desactivar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desactivar.seguimiento.status === "success" &&
          desactivar.seguimiento.result.estado === "pendiente" && (
            <FeedbackAlert
              semantic="warning"
              title="Desactivación aún en verificación"
              actions={
                <Group gap="sm">
                  {desactivarPendiente && (
                    <Button
                      onClick={() =>
                        desactivar.consultarEstado(desactivarPendiente, (result) => {
                          if (result.estado === "confirmada") reload();
                        })
                      }
                    >
                      Consultar estado
                    </Button>
                  )}
                  <Button onClick={desactivar.reiniciar}>Entendido</Button>
                </Group>
              }
            >
              {desactivar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desactivar.seguimiento.status === "success" &&
          desactivar.seguimiento.result.estado === "rechazada" && (
            <FeedbackAlert
              semantic="error"
              title="Desactivación rechazada"
              actions={<Button onClick={desactivar.reiniciar}>Entendido</Button>}
            >
              {desactivar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desactivar.seguimiento.status === "success" &&
          desactivar.seguimiento.result.estado === "no-concluyente" && (
            <FeedbackAlert
              semantic="warning"
              title="Verificación no concluyente"
              actions={<Button onClick={desactivar.reiniciar}>Entendido</Button>}
            >
              {desactivar.seguimiento.result.mensaje}
            </FeedbackAlert>
          )}
        {desactivar.seguimiento.status === "error" && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo consultar la desactivación"
          >
            {desactivar.seguimiento.message}
          </FeedbackAlert>
        )}
        {desactivar.state.status === "error" && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo desactivar el tipo"
            actions={
              <Button variant="outline" onClick={desactivar.reiniciar}>
                Cerrar
              </Button>
            }
          >
            {desactivar.state.message}
          </FeedbackAlert>
        )}

        {state.status === "loading" && (
          <Group gap="sm" role="status">
            <Loader size="sm" />
            <Text size="sm">Cargando tipo de producto…</Text>
          </Group>
        )}
        {state.status === "error" && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo cargar el tipo de producto"
            actions={
              <Button variant="outline" onClick={() => navigate("/tipos-producto")}>
                Volver al listado
              </Button>
            }
          >
            {state.message}
          </FeedbackAlert>
        )}
        {state.status === "not-found" && (
          <FeedbackAlert
            semantic="warning"
            title="Tipo de producto no encontrado"
            actions={
              <Button variant="outline" onClick={() => navigate("/tipos-producto")}>
                Volver al listado
              </Button>
            }
          >
            El tipo de producto solicitado no existe o no está disponible.
          </FeedbackAlert>
        )}

        {detalle && (
          <SectionCard
            title="Ficha del tipo de producto"
            actions={
              <Group gap="sm">
                <Button
                  variant="outline"
                  leftSection={<IconPlus size={16} stroke={2} aria-hidden="true" />}
                  onClick={() =>
                    navigate(`/tipos-producto/${detalle.tipoProductoId}/asociar`)
                  }
                  disabled={
                    detalle.caracteristicasAsignadas >=
                    detalle.limiteCaracteristicas
                  }
                >
                  Asociar característica
                </Button>
                {detalle.estado === "Activo" && (
                  <Button
                    variant="outline"
                    leftSection={<IconPower size={16} stroke={2} aria-hidden="true" />}
                    onClick={() => setConfirmDesactivar(true)}
                  >
                    Desactivar tipo
                  </Button>
                )}
              </Group>
            }
          >
            <Stack gap="sm">
              <CampoDato etiqueta="Nombre">{detalle.nombre}</CampoDato>
              <CampoDato etiqueta="Estado">
                <StatusBadge semantic="neutral">{detalle.estado}</StatusBadge>
              </CampoDato>
              <CampoDato etiqueta="Schema version">
                {detalle.schemaVersion}
              </CampoDato>
              <CampoDato etiqueta="Características asignadas">
                {detalle.caracteristicasAsignadas} de{" "}
                {detalle.limiteCaracteristicas}
              </CampoDato>
            </Stack>
          </SectionCard>
        )}

        {detalle && (
          <SectionCard title="Características asociadas">
            <EntityTable
              caption="Características asociadas al tipo de producto"
              columns={columnasAsociaciones}
              rows={filas}
              rowKey={(asoc) => asoc.caracteristicaId}
              state={tablaState}
              minWidth={700}
              empty={{
                title: "Sin características",
                description: "No hay características vinculadas a este tipo.",
              }}
            />
          </SectionCard>
        )}

        <ConfirmDialog
          opened={confirmDesasociar !== null}
          title="Desasociar característica"
          confirmLabel="Continuar"
          destructive
          onCancel={() => setConfirmDesasociar(null)}
          onConfirm={confirmarDesasociar}
        >
          <Stack gap="sm">
            <Text size="sm">
              Antes de retirar esta característica debemos comprobar que el
              cambio no deje productos o variantes activos en un estado
              incompatible. Las asociaciones obligatorias requieren verificación
              con Catálogo antes de confirmarse.
            </Text>
          </Stack>
        </ConfirmDialog>

        <ConfirmDialog
          opened={confirmDesactivar}
          title="Desactivar tipo de producto"
          confirmLabel="Continuar"
          destructive
          onCancel={() => setConfirmDesactivar(false)}
          onConfirm={confirmarDesactivar}
        >
          <Stack gap="sm">
            <Text size="sm">
              Antes de desactivar este tipo debemos comprobar que no tenga
              productos activos que dependan de él. La solicitud puede quedar en
              verificación con Catálogo.
            </Text>
          </Stack>
        </ConfirmDialog>
      </Stack>
    </>
  );
}