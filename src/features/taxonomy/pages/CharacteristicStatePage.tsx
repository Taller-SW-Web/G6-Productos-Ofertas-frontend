import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Group, Loader, Stack, Text } from "@mantine/core";
import {
  FeedbackAlert,
  PageHeader,
  SectionCard,
} from "../../../components/shared";
import { useCharacteristicDetail } from "../hooks/useCharacteristicDetail";
import {
  scenariosCatalogoCaracteristica,
  type CharacteristicCatalogScenario,
} from "../services/characteristicRepository";
import { characteristicService } from "../services/characteristicService";

function parseScenario(raw: string | null): CharacteristicCatalogScenario {
  return scenariosCatalogoCaracteristica.some((item) => item.value === raw)
    ? (raw as CharacteristicCatalogScenario)
    : "default";
}

export function CharacteristicStatePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Característica no encontrada">
        La dirección no incluye una característica para cambiar su estado.
      </FeedbackAlert>
    );
  }
  return <CharacteristicStateLoader key={id} id={id} />;
}

function CharacteristicStateLoader({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scenario = parseScenario(params.get("escenario"));
  const { state } = useCharacteristicDetail(id, scenario);

  if (state.status === "loading") {
    return (
      <Group gap="sm" role="status">
        <Loader size="sm" />
        <Text size="sm">Cargando característica…</Text>
      </Group>
    );
  }
  if (state.status === "error") {
    return (
      <FeedbackAlert
        semantic="error"
        title="No se pudo cargar la característica"
        actions={
          <Button variant="outline" onClick={() => navigate("/caracteristicas")}>
            Volver al listado
          </Button>
        }
      >
        {state.message}
      </FeedbackAlert>
    );
  }
  if (state.status === "not-found") {
    return (
      <FeedbackAlert
        semantic="error"
        title="Característica no encontrada"
        actions={
          <Button variant="outline" onClick={() => navigate("/caracteristicas")}>
            Volver al listado
          </Button>
        }
      >
        No existe una característica con ese identificador.
      </FeedbackAlert>
    );
  }

  return <CharacteristicStateContent detalle={state.detalle} />;
}

function CharacteristicStateContent({
  detalle,
}: {
  detalle: import("../types").CharacteristicDetail;
}) {
  const navigate = useNavigate();
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const destino = detalle.estado === "Activo" ? "Inactivo" : "Activo";
  const semanticaDestino = destino === "Activo" ? "success" : "warning";

  const handleCambiarEstado = () => {
    const controller = new AbortController();
    setProcesando(true);
    setError(null);
    setResultado(null);
    characteristicService
      .cambiarEstado(detalle.id, destino, controller.signal)
      .then((res) => {
        if (res) {
          setResultado(
            `La característica «${res.nombre}» quedó como ${res.estado}.`,
          );
        } else {
          setResultado(
            `La característica «${detalle.nombre}» quedó como ${destino}.`,
          );
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cambiar el estado de la característica.",
        );
      })
      .finally(() => {
        setProcesando(false);
      });
  };

  return (
    <>
      <PageHeader
        title={`Estado de: ${detalle.nombre}`}
        description="Activa o desactiva la característica conservando su identificador."
        breadcrumbs={[
          { label: "Taxonomía" },
          { label: "Características", to: "/caracteristicas" },
          { label: "Detalle", to: `/caracteristicas/${detalle.id}` },
          { label: "Estado" },
        ]}
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(`/caracteristicas/${detalle.id}`)}
          >
            Volver al detalle
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Esta operación es simulada. No cambia el estado en un backend real.
        </FeedbackAlert>

        {resultado && (
          <FeedbackAlert
            semantic={semanticaDestino}
            title="Estado actualizado"
            actions={
              <Group gap="sm">
                <Button onClick={() => navigate("/caracteristicas")}>
                  Volver al listado
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/caracteristicas/${detalle.id}`)}
                >
                  Ver detalle
                </Button>
              </Group>
            }
          >
            {resultado}
          </FeedbackAlert>
        )}

        {error && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo cambiar el estado"
            actions={
              <Button variant="outline" onClick={() => setError(null)}>
                Intentar de nuevo
              </Button>
            }
          >
            {error}
          </FeedbackAlert>
        )}

        {!resultado && !error && (
          <SectionCard
            title="Confirmación de cambio de estado"
            description={`Estado actual: ${detalle.estado}`}
          >
            <Stack gap="md">
              <FeedbackAlert semantic="info" title="Cambio propuesto">
                El cambio propuesto es: <strong>{detalle.estado}</strong> →{" "}
                <strong>{destino}</strong>.
              </FeedbackAlert>
              <Text size="sm" c="dimmed">
                El identificador de la característica se conserva. La
                desactivación no elimina sus valores, solo impide su uso en
                nuevos esquemas (simulado).
              </Text>
              <Group gap="sm">
                <Button onClick={handleCambiarEstado} loading={procesando}>
                  {destino === "Activo"
                    ? "Activar característica"
                    : "Desactivar característica"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/caracteristicas/${detalle.id}`)}
                >
                  Cancelar
                </Button>
              </Group>
            </Stack>
          </SectionCard>
        )}
      </Stack>
    </>
  );
}
