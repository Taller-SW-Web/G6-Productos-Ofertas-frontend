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
import type { ProductTypeAssociation, ProductTypeDetail } from "../types";

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
    render: () => (
      <Button variant="outline" size="xs">
        Desasociar
      </Button>
    ),
  },
];

const MOCK_DETALLE: Record<string, ProductTypeDetail> = {
  calzado: {
    tipoProductoId: "calzado",
    nombre: "Calzado deportivo",
    estado: "Activo",
    schemaVersion: 4,
    limiteCaracteristicas: 20,
    caracteristicasAsignadas: 3,
    asociadas: [
      {
        caracteristicaId: "talla",
        obligatoria: true,
        estado: "Activo",
        schemaVersion: 4,
        caracteristica: {
          id: "talla",
          nombre: "Talla",
          tipo: "LISTA",
          estado: "Activo",
          valoresActivos: 2,
        },
      },
      {
        caracteristicaId: "color",
        obligatoria: true,
        estado: "Activo",
        schemaVersion: 4,
        caracteristica: {
          id: "color",
          nombre: "Color",
          tipo: "LISTA",
          estado: "Activo",
          valoresActivos: 6,
        },
      },
      {
        caracteristicaId: "material",
        obligatoria: false,
        estado: "Activo",
        schemaVersion: 4,
        caracteristica: {
          id: "material",
          nombre: "Material",
          tipo: "TEXTO",
          estado: "Activo",
          valoresActivos: 0,
        },
      },
    ],
  },
  ropa: {
    tipoProductoId: "ropa",
    nombre: "Ropa de entrenamiento",
    estado: "Activo",
    schemaVersion: 3,
    limiteCaracteristicas: 20,
    caracteristicasAsignadas: 2,
    asociadas: [
      {
        caracteristicaId: "talla",
        obligatoria: true,
        estado: "Activo",
        schemaVersion: 3,
        caracteristica: {
          id: "talla",
          nombre: "Talla",
          tipo: "LISTA",
          estado: "Activo",
          valoresActivos: 2,
        },
      },
      {
        caracteristicaId: "color",
        obligatoria: true,
        estado: "Activo",
        schemaVersion: 3,
        caracteristica: {
          id: "color",
          nombre: "Color",
          tipo: "LISTA",
          estado: "Activo",
          valoresActivos: 6,
        },
      },
    ],
  },
  accesorios: {
    tipoProductoId: "accesorios",
    nombre: "Accesorios genéricos",
    estado: "Activo",
    schemaVersion: 1,
    limiteCaracteristicas: 20,
    caracteristicasAsignadas: 0,
    asociadas: [],
  },
};

export function ProductTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [confirmDesactivar, setConfirmDesactivar] = useState(false);
  const [operacion, setOperacion] = useState<"idle" | "verificando" | "rechazada">("idle");
  const [mensajeRechazo, setMensajeRechazo] = useState<string | null>(null);

  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Tipo de producto no encontrado">
        La dirección no incluye un tipo de producto para consultar.
      </FeedbackAlert>
    );
  }

  const detalle = MOCK_DETALLE[id];
  if (!detalle) {
    return (
      <FeedbackAlert
        semantic="warning"
        title="Tipo de producto no encontrado"
        actions={
          <Button variant="outline" onClick={() => navigate("/tipos-producto")}>
            Volver al listado
          </Button>
        }
      >
        El tipo de producto solicitado no existe o no está disponible en el mock.
      </FeedbackAlert>
    );
  }

  const confirmarDesactivacion = () => {
    setConfirmDesactivar(false);
    setOperacion("verificando");
    setTimeout(() => {
      if (detalle.tipoProductoId === "calzado") {
        setOperacion("rechazada");
        setMensajeRechazo(
          "Este tipo todavía tiene productos activos asociados. No se realizó la desactivación.",
        );
      } else {
        setOperacion("idle");
      }
    }, 800);
  };

  const filas = detalle.asociadas;

  const tablaState: TableState = { status: "success" };

  return (
    <>
      <PageHeader
        title={detalle.nombre}
        description="Esquema del tipo de producto y características asociadas."
        breadcrumbs={[
          { label: "Catálogo", to: "/tipos-producto" },
          { label: "Tipos de producto", to: "/tipos-producto" },
          { label: detalle.nombre },
        ]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          El esquema es simulado. Esta pantalla no consulta ni modifica datos
          reales.
        </FeedbackAlert>

        {operacion === "verificando" && (
          <FeedbackAlert
            semantic="warning"
            title="Verificando uso en catálogo"
            actions={
              <Button variant="outline" onClick={() => setOperacion("idle")}>
                Entendido
              </Button>
            }
          >
            Estamos comprobando si el cambio puede realizarse de forma segura. No
            se ha modificado el esquema todavía.
          </FeedbackAlert>
        )}

        {operacion === "rechazada" && mensajeRechazo && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo completar"
            actions={
              <Button variant="outline" onClick={() => setOperacion("idle")}>
                Cerrar
              </Button>
            }
          >
            {mensajeRechazo}
          </FeedbackAlert>
        )}

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
                  detalle.caracteristicasAsignadas >= detalle.limiteCaracteristicas
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
              {detalle.caracteristicasAsignadas} de {detalle.limiteCaracteristicas}
            </CampoDato>
          </Stack>
        </SectionCard>

        <SectionCard title="Características asociadas">
          {filas.length === 0 ? (
            <Stack gap="sm" align="center">
              <Loader color="gray" size="sm" />
              <Text size="sm" c="dimmed">
                Sin características asociadas
              </Text>
              <Button
                leftSection={<IconPlus size={16} stroke={2} aria-hidden="true" />}
                onClick={() =>
                  navigate(`/tipos-producto/${detalle.tipoProductoId}/asociar`)
                }
              >
                Asociar característica
              </Button>
            </Stack>
          ) : (
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
          )}
        </SectionCard>
      </Stack>

      <ConfirmDialog
        opened={false}
        title="Desasociar característica"
        confirmLabel="Continuar"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      >
        <Stack gap="sm">
          <Text size="sm">
            Antes de retirar esta característica debemos comprobar que el cambio
            no deje productos o variantes activos en un estado incompatible.
          </Text>
        </Stack>
      </ConfirmDialog>

      <ConfirmDialog
        opened={confirmDesactivar}
        title="Desactivar tipo de producto"
        confirmLabel="Continuar"
        onCancel={() => setConfirmDesactivar(false)}
        onConfirm={confirmarDesactivacion}
      >
        <Stack gap="sm">
          <Text size="sm">
            Antes de desactivar este tipo debemos comprobar que no tenga
            productos activos que dependan de él.
          </Text>
        </Stack>
      </ConfirmDialog>
    </>
  );
}
