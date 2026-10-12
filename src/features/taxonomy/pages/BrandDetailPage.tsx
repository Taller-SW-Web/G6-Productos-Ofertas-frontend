import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, Button, Group, Loader, Stack, Text } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { FeedbackAlert, PageHeader, SectionCard, StatusBadge } from "../../../components/shared";
import { CampoDato } from "../components/CampoDato";
import { brandService } from "../services/brandService";
import type { BrandDetail } from "../types";

export function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<BrandDetail | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void brandService.obtener(id, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res) setDetalle(res);
      else setError("La marca no existe o no está disponible.");
      setCargando(false);
    });
    return () => controller.abort();
  }, [id]);

  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Marca no encontrada">
        La dirección no incluye una marca para consultar.
      </FeedbackAlert>
    );
  }

  return (
    <>
      <PageHeader
        title={detalle?.nombre ?? "Detalle de marca"}
        description="Consulta la información de la marca."
        breadcrumbs={[
          { label: "Taxonomía", to: "/marcas" },
          { label: "Marcas", to: "/marcas" },
          { label: detalle?.nombre ?? "Detalle" },
        ]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          El detalle es simulado. No consulta datos reales.
        </FeedbackAlert>
        {cargando && (
          <Group gap="sm">
            <Loader size="sm" />
            <Text size="sm">Cargando marca…</Text>
          </Group>
        )}
        {error && (
          <FeedbackAlert semantic="warning" title="Marca no encontrada" actions={<Button variant="outline" onClick={() => navigate("/marcas")}>Volver al listado</Button>}>
            {error}
          </FeedbackAlert>
        )}
        {detalle && !cargando && (
          <SectionCard
            title="Información general"
            actions={
              <Button leftSection={<IconPencil size={16} stroke={2} aria-hidden="true" />} onClick={() => navigate(`/marcas/${detalle.marcaId}/editar`)}>
                Editar
              </Button>
            }
          >
            <Stack gap="sm">
              <Group gap="md" align="center">
                <Avatar src={detalle.logoUrl ?? undefined} alt={`Logo de ${detalle.nombre}`} size={60} color="gray">
                  {detalle.nombre.slice(0, 2)}
                </Avatar>
                <Stack gap={0}>
                  <Text size="md" fw={600}>{detalle.nombre}</Text>
                  <Text size="sm" c="dimmed">ID: {detalle.marcaId}</Text>
                </Stack>
              </Group>
              <CampoDato etiqueta="Estado">
                <StatusBadge semantic="neutral">{detalle.estado}</StatusBadge>
              </CampoDato>
              <CampoDato etiqueta="País de origen (ISO 3166-1)">{detalle.paisOrigenIso ?? "—"}</CampoDato>
              <CampoDato etiqueta="Descripción">{detalle.descripcion ?? "—"}</CampoDato>
              <CampoDato etiqueta="Versión">{detalle.version}</CampoDato>
              <CampoDato etiqueta="Logo URL">{detalle.logoUrl ?? "—"}</CampoDato>
            </Stack>
          </SectionCard>
        )}
      </Stack>
    </>
  );
}
