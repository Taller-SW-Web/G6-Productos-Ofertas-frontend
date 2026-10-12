import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import {
  EntityTable,
  FeedbackAlert,
  FilterBar,
  PageHeader,
  SearchField,
  SectionCard,
  StatusBadge,
  type TableColumn,
  type TableState,
} from "../../../components/shared";
import { useCharacteristicDetail } from "../hooks/useCharacteristicDetail";
import {
  characteristicConfigDefaults,
  scenariosCatalogoCaracteristica,
  type CharacteristicCatalogScenario,
} from "../services/characteristicRepository";
import { characteristicService } from "../services/characteristicService";
import { estadoCaracteristicaSemantic } from "../services/estadoSemantic";
import type { CharacteristicValue } from "../types";

type BajaEstado = "idle" | "verificando" | "rechazada" | "exito";

function parseScenario(raw: string | null): CharacteristicCatalogScenario {
  return scenariosCatalogoCaracteristica.some((item) => item.value === raw)
    ? (raw as CharacteristicCatalogScenario)
    : "default";
}

export function CharacteristicValuesPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return (
      <FeedbackAlert semantic="error" title="Característica no encontrada">
        La dirección no incluye una característica para gestionar sus valores.
      </FeedbackAlert>
    );
  }
  return <CharacteristicValuesLoader key={id} id={id} />;
}

function CharacteristicValuesLoader({ id }: { id: string }) {
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

  if (state.detalle.tipo !== "LISTA") {
    return (
      <FeedbackAlert
        semantic="warning"
        title="Esta característica no admite valores"
        actions={
          <Group gap="sm">
            <Button onClick={() => navigate(`/caracteristicas/${state.detalle.id}`)}>
              Ver detalle
            </Button>
            <Button variant="outline" onClick={() => navigate("/caracteristicas")}>
              Volver al listado
            </Button>
          </Group>
        }
      >
        Solo las características de tipo LISTA tienen valores permitidos.
      </FeedbackAlert>
    );
  }

  return <CharacteristicValuesContent detalle={state.detalle} />;
}

function CharacteristicValuesContent({
  detalle,
}: {
  detalle: import("../types").CharacteristicDetail;
}) {
  const navigate = useNavigate();
  const [valores, setValores] = useState<CharacteristicValue[]>([]);
  const [loadingValores, setLoadingValores] = useState(true);
  const [errorValores, setErrorValores] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [agregarError, setAgregarError] = useState<string | null>(null);
  const [bajaEstado, setBajaEstado] = useState<BajaEstado>("idle");
  const [valorEnBaja, setValorEnBaja] = useState<CharacteristicValue | null>(null);
  const [mensajeRechazo, setMensajeRechazo] = useState<string | null>(null);

  const termino = busqueda.trim().toLocaleLowerCase("es");
  const filas = useMemo(
    () =>
      valores.filter(
        (item) =>
          termino === "" ||
          item.nombre.toLocaleLowerCase("es").includes(termino),
      ),
    [valores, termino],
  );

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const idDetalle = detalle.id;
    setTimeout(() => {
      if (!mounted) return;
      setLoadingValores(true);
      setErrorValores(null);
    }, 0);
    characteristicService
      .listarValores(idDetalle, "default", controller.signal)
      .then((res) => {
        if (!mounted || controller.signal.aborted) return;
        if (res) {
          setValores(res);
        } else {
          setValores([]);
        }
      })
      .catch((err) => {
        if (!mounted || controller.signal.aborted) return;
        setErrorValores(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los valores de la característica.",
        );
        setValores([]);
      })
      .finally(() => {
        if (!mounted || controller.signal.aborted) return;
        setLoadingValores(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [detalle.id]);

  const cargarValores = () => {
    const controller = new AbortController();
    let mounted = true;
    setLoadingValores(true);
    setErrorValores(null);
    characteristicService
      .listarValores(detalle.id, "default", controller.signal)
      .then((res) => {
        if (!mounted || controller.signal.aborted) return;
        if (res) {
          setValores(res);
        } else {
          setValores([]);
        }
      })
      .catch((err) => {
        if (!mounted || controller.signal.aborted) return;
        setErrorValores(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los valores de la característica.",
        );
        setValores([]);
      })
      .finally(() => {
        if (!mounted || controller.signal.aborted) return;
        setLoadingValores(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  };

  const handleAgregar = () => {
    const nombre = nuevoValor.trim();
    if (nombre === "") {
      setAgregarError("Ingresa el nombre del valor.");
      return;
    }
    const controller = new AbortController();
    setAgregando(true);
    setAgregarError(null);
    characteristicService
      .agregarValor(detalle.id, nombre, controller.signal)
      .then((valor) => {
        setValores((prev) => [...prev, valor]);
        setNuevoValor("");
      })
      .catch((err) => {
        setAgregarError(
          err instanceof Error ? err.message : "No se pudo agregar el valor.",
        );
      })
      .finally(() => {
        setAgregando(false);
      });
  };

  const handleSolicitarBaja = (valor: CharacteristicValue) => {
    setBajaEstado("verificando");
    setValorEnBaja(valor);
    setMensajeRechazo(null);
    const controller = new AbortController();
    characteristicService
      .solicitarBajaValor(detalle.id, valor.valorId, controller.signal)
      .then((res) => {
        if (res === "REJECTED") {
          setBajaEstado("rechazada");
          setMensajeRechazo(
            "No se puede dar de baja este valor porque está siendo usado por productos asociados al esquema de tipo de producto (según SPEC-010).",
          );
          return;
        }
        if (res && res.estado === "Inactivo") {
          setValores((prev) =>
            prev.map((v) => (v.valorId === res.valorId ? res : v)),
          );
          setBajaEstado("exito");
          return;
        }
        setBajaEstado("rechazada");
        setMensajeRechazo("La verificación de uso no confirmó la baja.");
      })
      .catch((err) => {
        setBajaEstado("rechazada");
        setMensajeRechazo(
          err instanceof Error
            ? err.message
            : "No se pudo verificar el uso del valor.",
        );
      });
  };

  const columnas: TableColumn<CharacteristicValue>[] = [
    {
      key: "nombre",
      header: "Valor",
      render: (item) => (
        <Text size="sm" fw={600}>
          {item.nombre}
        </Text>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      width: 140,
      render: (item) => (
        <StatusBadge semantic={estadoCaracteristicaSemantic[item.estado]}>
          {item.estado}
        </StatusBadge>
      ),
    },
    {
      key: "acciones",
      header: "Acciones",
      width: 120,
      align: "right",
      render: (item) => (
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            disabled={item.estado !== "Activo" || bajaEstado === "verificando"}
            aria-label={`Solicitar baja de ${item.nombre}`}
            onClick={() => handleSolicitarBaja(item)}
          >
            <IconTrash size={16} stroke={2} aria-hidden="true" />
          </ActionIcon>
        </Group>
      ),
    },
  ];

  const tablaState: TableState = loadingValores
    ? { status: "loading" }
    : errorValores
      ? {
          status: "error",
          message: errorValores,
          action: (
            <Button variant="outline" onClick={cargarValores}>
              Volver a intentar
            </Button>
          ),
        }
      : { status: "success" };

  const vacio =
    valores.length === 0
      ? {
          title: "Sin valores permitidos",
          description:
            "Esta característica de tipo LISTA aún no tiene valores definidos.",
        }
      : {
          title: "Sin resultados",
          description: "Ningún valor coincide con la búsqueda.",
        };

  const maxLista = characteristicConfigDefaults.maxValoresLista;

  return (
    <>
      <PageHeader
        title={`Valores de: ${detalle.nombre}`}
        description="Gestiona los valores permitidos para una característica tipo LISTA."
        breadcrumbs={[
          { label: "Taxonomía" },
          { label: "Características", to: "/caracteristicas" },
          { label: "Detalle", to: `/caracteristicas/${detalle.id}` },
          { label: "Valores" },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate(`/caracteristicas/${detalle.id}`)}>
            Volver al detalle
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Los valores mostrados son simulados. Esta pantalla no consulta ni
          modifica valores reales.
        </FeedbackAlert>

        {bajaEstado === "verificando" && valorEnBaja && (
          <FeedbackAlert
            semantic="info"
            title="Comprobando uso"
            actions={
              <Group gap="sm">
                <Button variant="outline" onClick={() => setBajaEstado("idle")}>
                  Cancelar comprobación
                </Button>
              </Group>
            }
          >
            Se está verificando si el valor «{valorEnBaja.nombre}» está en uso
            por productos asociados al esquema de tipo de producto...
          </FeedbackAlert>
        )}

        {bajaEstado === "rechazada" && (
          <FeedbackAlert
            semantic="warning"
            title="Baja de valor rechazada"
            actions={
              <Group gap="sm">
                <Button onClick={() => setBajaEstado("idle")}>Aceptar</Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/caracteristicas/${detalle.id}/estado`)}
                >
                  Cambiar estado de característica
                </Button>
              </Group>
            }
          >
            {mensajeRechazo}
          </FeedbackAlert>
        )}

        {bajaEstado === "exito" && valorEnBaja && (
          <FeedbackAlert
            semantic="success"
            title="Solicitud de baja procesada"
            actions={
              <Button onClick={() => setBajaEstado("idle")}>Continuar</Button>
            }
          >
            El valor «{valorEnBaja.nombre}» quedó marcado como Inactivo. La
            simulación no elimina el registro.
          </FeedbackAlert>
        )}

        <SectionCard
          title="Agregar valor permitido"
          description={`Valores permitidos activos: ${filas.filter((v) => v.estado === "Activo").length} (máx. ${maxLista})`}
        >
          <Stack gap="md">
            <TextInput
              label="Nombre del valor"
              placeholder="Ej. XL"
              value={nuevoValor}
              error={agregarError}
              onChange={(e) => {
                setNuevoValor(e.currentTarget.value);
                setAgregarError(null);
              }}
            />
            <Group justify="flex-start">
              <Button onClick={handleAgregar} loading={agregando}>
                Agregar valor
              </Button>
            </Group>
          </Stack>
        </SectionCard>

        <FilterBar summary={`${filas.length} valores visibles`}>
          <Box w={320}>
            <SearchField
              label="Buscar valor"
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Nombre del valor"
            />
          </Box>
        </FilterBar>
        <EntityTable
          caption="Valores permitidos de la característica"
          columns={columnas}
          rows={filas}
          rowKey={(item) => item.valorId}
          state={tablaState}
          minWidth={700}
          empty={vacio}
        />
      </Stack>
    </>
  );
}
