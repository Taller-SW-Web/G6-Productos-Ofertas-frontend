import { useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  FeedbackAlert,
  PageHeader,
  SectionCard,
} from "../../../components/shared";
import { useCharacteristicDetail } from "../hooks/useCharacteristicDetail";
import { useUpdateCharacteristic } from "../hooks/useUpdateCharacteristic";
import {
  characteristicConfigDefaults,
  scenariosCatalogoCaracteristica,
  scenariosFormularioCaracteristica,
  type CharacteristicCatalogScenario,
  type CharacteristicFormScenario,
} from "../services/characteristicRepository";
import {
  describirReglaTipo,
  etiquetaTipoCaracteristica,
} from "../services/characteristicPresentation";
import type { CharacteristicDetail } from "../types";

function parseCatalogScenario(
  raw: string | null,
): CharacteristicCatalogScenario {
  return scenariosCatalogoCaracteristica.some((item) => item.value === raw)
    ? (raw as CharacteristicCatalogScenario)
    : "default";
}

function parseFormScenario(raw: string | null): CharacteristicFormScenario {
  return scenariosFormularioCaracteristica.some((item) => item.value === raw)
    ? (raw as CharacteristicFormScenario)
    : "default";
}

export function CharacteristicEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Característica no encontrada">
        La dirección no incluye una característica para editar.
      </FeedbackAlert>
    );
  }
  return <CharacteristicEditLoader key={id} id={id} />;
}

function CharacteristicEditLoader({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";
  const catalogScenario = parseCatalogScenario(params.get("escenario"));
  const { state } = useCharacteristicDetail(id, catalogScenario);

  const contenido =
    state.status === "loading" ? (
      <Group gap="sm" role="status">
        <Loader size="sm" />
        <Text size="sm">Cargando característica…</Text>
      </Group>
    ) : state.status === "error" ? (
      <FeedbackAlert
        semantic="error"
        title="No se pudo cargar la característica"
      >
        {state.message}
      </FeedbackAlert>
    ) : state.status === "not-found" ? (
      <FeedbackAlert
        semantic="warning"
        title="Característica no encontrada"
        actions={
          <Button variant="outline" onClick={() => navigate("/caracteristicas")}>
            Volver al listado
          </Button>
        }
      >
        La característica solicitada no existe o ya no está disponible.
      </FeedbackAlert>
    ) : (
      <CharacteristicEditForm
        detalle={state.detalle}
        isRevisionMode={isRevisionMode}
      />
    );

  return (
    <>
      <PageHeader
        title="Editar característica"
        description="Actualiza el nombre y la unidad de la característica seleccionada."
        breadcrumbs={[
          { label: "Características", to: "/caracteristicas" },
          { label: "Editar" },
        ]}
      />
      <Stack gap="lg">
        {isRevisionMode && (
          <Select
            label="Escenario de revisión de carga"
            value={catalogScenario}
            data={scenariosCatalogoCaracteristica}
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

function CharacteristicEditForm({
  detalle,
  isRevisionMode,
}: {
  detalle: CharacteristicDetail;
  isRevisionMode: boolean;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const formScenario = parseFormScenario(params.get("guardado"));
  const { phase, error, resultado, actualizar } =
    useUpdateCharacteristic(formScenario);

  const [nombre, setNombre] = useState(detalle.nombre);
  const [unidad, setUnidad] = useState(detalle.unidad ?? "");
  const [nombreError, setNombreError] = useState<string | null>(null);
  const [unidadError, setUnidadError] = useState<string | null>(null);
  const esNumero = detalle.tipo === "NUMERO";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nombreLimpio = nombre.trim();
    const unidadLimpia = unidad.trim();
    const nombreValido = nombreLimpio !== "";
    const unidadValida = !esNumero || unidadLimpia !== "";

    setNombreError(
      nombreValido ? null : "Ingresa el nombre de la característica.",
    );
    setUnidadError(
      unidadValida ? null : "Ingresa la unidad (por ejemplo kg o cm).",
    );

    if (!nombreValido || !unidadValida) return;

    actualizar({
      id: detalle.id,
      nombre: nombreLimpio,
      unidad: esNumero ? unidadLimpia : undefined,
    });
  };

  const guardando = phase === "guardando";

  if (resultado) {
    return (
      <FeedbackAlert
        semantic="success"
        title="Característica actualizada"
        actions={
          <Group gap="sm">
            <Button onClick={() => navigate(`/caracteristicas/${resultado.id}`)}>
              Ver detalle
            </Button>
            <Button variant="outline" onClick={() => navigate("/caracteristicas")}>
              Volver al listado
            </Button>
          </Group>
        }
      >
        {`Se actualizó «${resultado.nombre}». La actualización es simulada y no se guarda en un backend.`}
      </FeedbackAlert>
    );
  }

  return (
    <>
      {isRevisionMode && (
        <Select
          label="Escenario de revisión de guardado"
          value={formScenario}
          data={scenariosFormularioCaracteristica}
          maw={320}
          onChange={(next) => {
            if (!next) return;
            setParams((prev) => {
              const copy = new URLSearchParams(prev);
              copy.set("guardado", next);
              return copy;
            });
          }}
        />
      )}
      <FeedbackAlert semantic="info" title="Datos de demostración">
        El formulario es simulado. No actualiza características reales ni envía
        datos a un backend.
      </FeedbackAlert>
      <SectionCard
        title="Datos de la característica"
        description="El tipo se define al crear la característica y no puede cambiarse después."
      >
        <form onSubmit={handleSubmit} noValidate>
          <Stack gap="md">
            <TextInput
              label="Nombre"
              withAsterisk
              value={nombre}
              error={nombreError}
              disabled={guardando}
              onChange={(event) => setNombre(event.currentTarget.value)}
            />
            <TextInput
              label="Tipo"
              value={etiquetaTipoCaracteristica[detalle.tipo]}
              disabled
              description="El tipo no puede cambiarse después de crear la característica."
            />
            {esNumero && (
              <TextInput
                label="Unidad"
                withAsterisk
                value={unidad}
                error={unidadError}
                placeholder="Ej. kg, cm"
                disabled={guardando}
                onChange={(event) => setUnidad(event.currentTarget.value)}
              />
            )}
            <FeedbackAlert semantic="info" title="Regla del tipo seleccionado">
              {describirReglaTipo(detalle.tipo, characteristicConfigDefaults)}
            </FeedbackAlert>
            {error && (
              <FeedbackAlert
                semantic="error"
                title="No se pudo guardar la característica"
              >
                {error}
              </FeedbackAlert>
            )}
            <Group justify="flex-end" gap="sm">
              <Button
                variant="outline"
                disabled={guardando}
                onClick={() => navigate(`/caracteristicas/${detalle.id}`)}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={guardando}>
                Guardar cambios
              </Button>
            </Group>
          </Stack>
        </form>
      </SectionCard>
    </>
  );
}