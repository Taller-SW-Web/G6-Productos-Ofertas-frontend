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
        <FeedbackAlert semantic="info" title="Datos de demostración">
          El esquema es simulado. Esta pantalla no consulta ni modifica datos
          reales.
        </FeedbackAlert>

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
        {desasociar.state.status === "success" && (
          <FeedbackAlert
            semantic={
              desasociar.state.result.resultado === "rechazada"
                ? "error"
                : "info"
            }
            title={
              desasociar.state.result.resultado === "pendiente"
                ? "Desasociación admitida"
                : desasociar.state.result.resultado === "rechazada"
                  ? "No se pudo completar"
                  : "Desasociación completada"
            }
            actions={
              <Button onClick={desasociar.reiniciar}>Entendido</Button>
            }
          >
            {desasociar.state.result.mensaje}
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
        {desactivar.state.status === "success" && (
          <FeedbackAlert
            semantic={
              desactivar.state.result.resultado === "rechazada"
                ? "error"
                : "info"
            }
            title={
              desactivar.state.result.resultado === "pendiente"
                ? "Solicitud admitida"
                : desactivar.state.result.resultado === "rechazada"
                  ? "No se realizó la desactivación"
                  : "Tipo de producto desactivado"
            }
            actions={
              <Button onClick={desactivar.reiniciar}>Entendido</Button>
            }
          >
            {desactivar.state.result.mensaje}
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
                    color="danger"
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