import type { CharacteristicRepository } from "../services/characteristicRepository";
import { characteristicConfigDefaults } from "../services/characteristicRepository";
import {
  isMockPersistenceAvailable,
  loadMockArray,
  persistMockArray,
  readMockState,
  saveMockState,
  syncMockArrayOnExternalChange,
  subscribeExternalMockChanges,
} from "../../shared/mockState";
import type {
  BloqueoDependencia,
  CharacteristicDetail,
  CharacteristicListItem,
  CharacteristicType,
  CharacteristicValue,
} from "../types";

// In-memory fixture store for MK-009. No HTTP contract exists yet; the adapter returns
// deterministic simulated data and never claims a real backend response.
interface RegistroValor {
  valorId: string;
  nombre: string;
  estado: "Activo" | "Inactivo";
  version: number;
}

interface RegistroCaracteristica {
  id: string;
  nombre: string;
  tipo: CharacteristicType;
  estado: CharacteristicListItem["estado"];
  unidad?: string;
  valoresActivos: number;
  valores?: RegistroValor[];
}

const storeFixtures: RegistroCaracteristica[] = [
  {
    id: "talla",
    nombre: "Talla",
    tipo: "LISTA",
    estado: "Activo",
    valoresActivos: 2,
    valores: [
      { valorId: "xs", nombre: "XS", estado: "Activo", version: 1 },
      { valorId: "m", nombre: "M", estado: "Activo", version: 1 },
    ],
  },
  {
    id: "color",
    nombre: "Color",
    tipo: "LISTA",
    estado: "Activo",
    valoresActivos: 2,
    valores: [
      { valorId: "negro", nombre: "Negro", estado: "Activo", version: 1 },
      { valorId: "blanco", nombre: "Blanco", estado: "Activo", version: 1 },
    ],
  },
  {
    id: "peso",
    nombre: "Peso",
    tipo: "NUMERO",
    estado: "Activo",
    unidad: "kg",
    valoresActivos: 0,
  },
  {
    id: "material",
    nombre: "Material",
    tipo: "TEXTO",
    estado: "Activo",
    valoresActivos: 0,
  },
  {
    id: "temporada",
    nombre: "Temporada",
    tipo: "LISTA",
    estado: "Inactivo",
    valoresActivos: 3,
    valores: [
      { valorId: "invierno", nombre: "Invierno", estado: "Activo", version: 1 },
      { valorId: "verano", nombre: "Verano", estado: "Activo", version: 1 },
      { valorId: "primavera", nombre: "Primavera", estado: "Activo", version: 1 },
    ],
  },
];

const isCharacteristic = (value: unknown): value is RegistroCaracteristica => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.nombre === "string" &&
    (row.tipo === "TEXTO" || row.tipo === "NUMERO" || row.tipo === "LISTA") &&
    (row.estado === "Activo" || row.estado === "Inactivo")
  );
};

// Demo state restored from the current-browser session when available; otherwise a
// fresh clone of the fixtures. Cross-tab writes rehydrate this same array in place.
const store: RegistroCaracteristica[] = loadMockArray("taxonomy-characteristics", storeFixtures, isCharacteristic);
syncMockArrayOnExternalChange("taxonomy-characteristics", store, isCharacteristic);

const persist = () => persistMockArray("taxonomy-characteristics", store);

const esperar = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const hallar = (id: string): RegistroCaracteristica | undefined =>
  store.find((item) => item.id === id);

const aItem = (registro: RegistroCaracteristica): CharacteristicListItem => ({
  id: registro.id,
  nombre: registro.nombre,
  tipo: registro.tipo,
  estado: registro.estado,
  unidad: registro.unidad,
  valoresActivos: registro.valoresActivos,
});

const aDetalle = (registro: RegistroCaracteristica): CharacteristicDetail => ({
  id: registro.id,
  nombre: registro.nombre,
  tipo: registro.tipo,
  estado: registro.estado,
  unidad: registro.unidad,
  valoresActivos: registro.valoresActivos,
  valores: (registro.valores ?? []).map((v) => ({ ...v })),
});

const generarId = (nombre: string): string => {
  const base =
    nombre
      .trim()
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "caracteristica";
  let id = base;
  let sufijo = 2;
  while (store.some((item) => item.id === id)) {
    id = `${base}-${sufijo}`;
    sufijo += 1;
  }
  return id;
};

const contarActivos = (valores: RegistroValor[]): number =>
  valores.filter((valor) => valor.estado === "Activo").length;

// BLOCKED_CONTRACT: no hay contrato OpenAPI confirmado para el sondeo del resultado
// de una baja asíncrona de valor (202). Este registro mantiene las operaciones
// pendientes en memoria para que la UI consulte su estado sin inventar un endpoint.
export interface OperacionBajaValor {
  operacionId: string;
  caracteristicaId: string;
  valorId: string;
  estado: "pendiente" | "confirmada" | "rechazada" | "no-concluyente";
}

const isOperacionBajaValor = (value: unknown): value is OperacionBajaValor => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.operacionId === "string" && typeof row.caracteristicaId === "string" &&
    typeof row.valorId === "string" &&
    ["pendiente", "confirmada", "rechazada", "no-concluyente"].includes(String(row.estado));
};

const operacionesBajaValor = new Map<string, OperacionBajaValor>(
  (readMockState<OperacionBajaValor[]>("taxonomy-characteristic-baja", (value): value is OperacionBajaValor[] => Array.isArray(value) && value.every(isOperacionBajaValor)) ?? [])
    .map((operation) => [operation.operacionId, operation]),
);
const persistirOperaciones = () => saveMockState("taxonomy-characteristic-baja", Array.from(operacionesBajaValor.values()));
subscribeExternalMockChanges("taxonomy-characteristic-baja", () => {
  const stored = readMockState<OperacionBajaValor[]>("taxonomy-characteristic-baja", (value): value is OperacionBajaValor[] => Array.isArray(value) && value.every(isOperacionBajaValor));
  if (!stored) return;
  operacionesBajaValor.clear();
  stored.forEach((operation) => operacionesBajaValor.set(operation.operacionId, operation));
});
export const getPendingCharacteristicValueOperation = (id: string) =>
  Array.from(operacionesBajaValor.values()).find((operation) => operation.caracteristicaId === id && operation.estado === "pendiente");

// Deterministic local states used only for review. The repository contract does not
// accept scenarios; reviewers change these values to reproduce error or edge cases
// without touching pages, hooks or the service contract.
type EscenarioLista = "default" | "empty" | "error";
type EscenarioCatalogo = "default" | "error" | "no-encontrado";
type EscenarioFormulario = "default" | "error";

const MOCK: {
  lista: EscenarioLista;
  catalogo: EscenarioCatalogo;
  formulario: EscenarioFormulario;
} = {
  lista: "default",
  catalogo: "default",
  formulario: "default",
};

export const mockCharacteristicAdapter: CharacteristicRepository = {
  async list(signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    if (MOCK.lista === "error") {
      throw new Error(
        "No se pudieron cargar las características. Inténtalo de nuevo.",
      );
    }
    if (MOCK.lista === "empty") {
      return { caracteristicas: [], config: characteristicConfigDefaults };
    }
    return {
      caracteristicas: store.map(aItem),
      config: characteristicConfigDefaults,
    };
  },

  async obtener(id, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    if (MOCK.catalogo === "error") {
      throw new Error(
        "No se pudo cargar la característica. Inténtalo de nuevo.",
      );
    }
    if (MOCK.catalogo === "no-encontrado") return null;
    const registro = hallar(id);
    return registro ? aDetalle(registro) : null;
  },

  async crear(input, signal) {
    signal?.throwIfAborted();
    await esperar(500);
    signal?.throwIfAborted();
    if (MOCK.formulario === "error") {
      throw new Error(
        "No se pudo crear la característica. Inténtalo de nuevo.",
      );
    }
    const unidad = input.tipo === "NUMERO" ? input.unidad : undefined;
    const registro: RegistroCaracteristica = {
      id: generarId(input.nombre),
      nombre: input.nombre,
      tipo: input.tipo,
      estado: input.estado,
      unidad,
      valoresActivos: 0,
      valores: input.tipo === "LISTA" ? [] : undefined,
    };
    store.push(registro);
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      store.pop();
      throw new Error(
        "No se pudo crear la característica. Vuelve a intentarlo.",
      );
    }
    return {
      id: registro.id,
      nombre: registro.nombre,
      tipo: registro.tipo,
      estado: registro.estado,
      unidad: registro.unidad,
    };
  },

  async actualizar(input, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    const registro = hallar(input.id);
    if (!registro) {
      throw new Error(
        "La característica ya no está disponible para editar.",
      );
    }
    if (MOCK.formulario === "error") {
      throw new Error(
        "No se pudo guardar la característica. Inténtalo de nuevo.",
      );
    }
    const prevNombre = registro.nombre;
    const prevUnidad = registro.unidad;
    registro.nombre = input.nombre;
    registro.unidad = registro.tipo === "NUMERO" ? input.unidad : undefined;
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      registro.nombre = prevNombre;
      registro.unidad = prevUnidad;
      throw new Error(
        "No se pudo guardar la característica. Vuelve a intentarlo.",
      );
    }
    return aDetalle(registro);
  },

  async listarValores(id, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();
    const r = hallar(id);
    return r ? ((r.valores ?? []).map((v) => ({ ...v })) as CharacteristicValue[]) : null;
  },

  async agregarValor(id, nombre, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();
    const r = hallar(id);
    if (!r) throw new Error("Característica no encontrada.");
    // SPEC-009: el límite de valores permitidos se aplica también aquí y no solo como
    // restricción visual del formulario (maxValoresLista sobre valores activos).
    const existentes = r.valores ?? [];
    if (contarActivos(existentes) >= characteristicConfigDefaults.maxValoresLista) {
      throw new Error(
        `Se alcanzó el límite de ${characteristicConfigDefaults.maxValoresLista} valores permitidos para esta característica.`,
      );
    }
    const base =
      nombre
        .trim()
        .toLocaleLowerCase("es")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "val";
    let vid = base;
    let i = 2;
    while (existentes.some((v) => v.valorId === vid)) {
      vid = `${base}-${i}`;
      i += 1;
    }
    const v: RegistroValor = {
      valorId: vid,
      nombre: nombre.trim(),
      estado: "Activo",
      version: 1,
    };
    if (!r.valores) r.valores = [];
    r.valores.push(v);
    r.valoresActivos = contarActivos(r.valores);
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      r.valores.pop();
      r.valoresActivos = contarActivos(r.valores);
      throw new Error("No se pudo agregar el valor. Vuelve a intentarlo.");
    }
    return { ...v };
  },

  async solicitarBajaValor(id, valorId, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    const r = hallar(id);
    const v = r?.valores?.find((x) => x.valorId === valorId);
    if (!r || !v) {
      throw new Error(
        "El valor no existe o ya no está disponible para una baja.",
      );
    }
    if (v.estado !== "Activo") {
      throw new Error("El valor ya no está activo; no se aplicó ninguna baja.");
    }
    const actual: CharacteristicValue = {
      valorId: v.valorId,
      nombre: v.nombre,
      estado: v.estado,
      version: v.version,
    };
    // SPEC-010: un valor referenciado por el esquema de un tipo de producto activo
    // no puede desactivarse. Demostración determinista para la revisión del piloto.
    if (valorId === "m") {
      const bloqueos: BloqueoDependencia[] = [
        {
          tipo: "productos",
          cantidad: 2,
          detalle:
            "Valor usado por el esquema de un tipo de producto activo (SPEC-010).",
        },
      ];
      return {
        resultado: "rechazada",
        valor: actual,
        mensaje:
          "No se puede dar de baja: el valor está referenciado por el esquema de un tipo de producto activo.",
        bloqueos,
      };
    }
    // Demostración de verificación en curso (equivalente a 202): la solicitud se
    // admite pero el valor conserva su estado hasta que se confirme.
    if (valorId === "negro") {
      const operacionId = `baja-valor-${valorId}`;
      const existing = operacionesBajaValor.get(operacionId);
      if (existing?.estado === "pendiente")
        return {
          resultado: "pendiente",
          valor: actual,
          mensaje: "La solicitud de baja ya está pendiente; no se reenvió la operación.",
          bloqueos: [],
          operacionId,
        };
      operacionesBajaValor.set(operacionId, {
        operacionId,
        caracteristicaId: id,
        valorId,
        estado: "pendiente",
      });
      persistirOperaciones();
      return {
        resultado: "pendiente",
        valor: actual,
        mensaje:
          "Solicitud de baja admitida en revisión. El valor continúa Activo; la desactivación no quedó confirmada.",
        bloqueos: [],
        operacionId,
      };
    }
    const prevEstado = v.estado;
    const prevVersion = v.version;
    const prevActivos = r.valoresActivos;
    v.estado = "Inactivo";
    v.version += 1;
    if (r.valores) {
      r.valoresActivos = contarActivos(r.valores);
    }
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      v.estado = prevEstado;
      v.version = prevVersion;
      r.valoresActivos = prevActivos;
      throw new Error("No se pudo dar de baja el valor. Vuelve a intentarlo.");
    }
    return {
      resultado: "exito",
      valor: {
        valorId: v.valorId,
        nombre: v.nombre,
        estado: v.estado,
        version: v.version,
      },
      mensaje:
        "Baja confirmada. El valor quedó Inactivo sin eliminar el registro.",
      bloqueos: [],
    };
  },

  async consultarEstadoOperacion(operacionId, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();

    const operacion = operacionesBajaValor.get(operacionId);
    if (!operacion) {
      throw new Error("No se encontró la operación de baja del valor.");
    }
    const r = hallar(operacion.caracteristicaId);
    const v = r?.valores?.find((x) => x.valorId === operacion.valorId);
    if (!r || !v) {
      throw new Error("El valor ya no está disponible.");
    }

    if (operacion.estado === "pendiente") {
      operacion.estado = "confirmada";
      const prevEstado = v.estado;
      const prevVersion = v.version;
      const prevActivos = r.valoresActivos;
      v.estado = "Inactivo";
      v.version += 1;
      r.valoresActivos = contarActivos(r.valores ?? []);
      const ok = persist();
      if (!ok && isMockPersistenceAvailable()) {
        operacion.estado = "pendiente";
        v.estado = prevEstado;
        v.version = prevVersion;
        r.valoresActivos = prevActivos;
        throw new Error("No se pudo confirmar la baja del valor. Vuelve a intentarlo.");
      }
      persistirOperaciones();
      return {
        operacionId,
        estado: "confirmada",
        mensaje:
          "Verificación concluida: el valor quedó Inactivo sin eliminar el registro.",
        valor: { ...v },
      };
    }

    return {
      operacionId,
      estado: "confirmada",
      mensaje: "La baja del valor ya estaba confirmada.",
      valor: { ...v },
    };
  },

  async cambiarEstado(id, estado, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();
    const r = hallar(id);
    if (!r) return null;
    const prevEstado = r.estado;
    r.estado = estado;
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      r.estado = prevEstado;
      throw new Error("No se pudo cambiar el estado de la característica. Vuelve a intentarlo.");
    }
    return aDetalle(r);
  },
};
