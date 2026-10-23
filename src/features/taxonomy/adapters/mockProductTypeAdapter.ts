import { mockCharacteristicAdapter } from "./mockCharacteristicAdapter";
import type { ProductTypeRepository } from "../services/productTypeRepository";
import { PRODUCT_TYPE_ATTRIBUTE_LIMIT } from "../services/productTypeRepository";
import {
  isMockPersistenceAvailable,
  loadMockArray,
  persistMockArray,
  syncMockArrayOnExternalChange,
} from "../../shared/mockState";
import type {
  CharacteristicListItem,
  ProductTypeAssociarInput,
  ProductTypeAssociationCharacteristic,
  ProductTypeCreateInput,
  ProductTypeCreateResult,
  ProductTypeDesasociarResult,
  ProductTypeDesactivarResult,
  ProductTypeDetail,
  ProductTypeListItem,
  ProductTypeSeguimiento,
} from "../types";

interface RegistroAsociacion {
  caracteristicaId: string;
  obligatoria: boolean;
}

interface RegistroTipoProducto {
  tipoProductoId: string;
  nombre: string;
  estado: "Activo" | "Inactivo";
  schemaVersion: number;
  limiteCaracteristicas: number;
  asociadas: RegistroAsociacion[];
}

const storeFixtures: RegistroTipoProducto[] = [
  {
    tipoProductoId: "calzado",
    nombre: "Calzado deportivo",
    estado: "Activo",
    schemaVersion: 4,
    limiteCaracteristicas: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
    asociadas: [
      { caracteristicaId: "talla", obligatoria: true },
      { caracteristicaId: "color", obligatoria: true },
      { caracteristicaId: "material", obligatoria: false },
    ],
  },
  {
    tipoProductoId: "ropa",
    nombre: "Ropa de entrenamiento",
    estado: "Activo",
    schemaVersion: 3,
    limiteCaracteristicas: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
    asociadas: [
      { caracteristicaId: "talla", obligatoria: true },
      { caracteristicaId: "color", obligatoria: true },
      { caracteristicaId: "temporada", obligatoria: false },
    ],
  },
  {
    tipoProductoId: "accesorios",
    nombre: "Accesorios genéricos",
    estado: "Activo",
    schemaVersion: 1,
    limiteCaracteristicas: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
    asociadas: [],
  },
];

const isProductType = (value: unknown): value is RegistroTipoProducto => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.tipoProductoId === "string" &&
    typeof row.nombre === "string" &&
    (row.estado === "Activo" || row.estado === "Inactivo") &&
    typeof row.schemaVersion === "number" &&
    Array.isArray(row.asociadas)
  );
};

// Demo state restored from the current-browser session when available; otherwise a
// fresh clone of the fixtures. Cross-tab writes rehydrate this same array in place.
const store: RegistroTipoProducto[] = loadMockArray("taxonomy-product-types", storeFixtures, isProductType);
syncMockArrayOnExternalChange("taxonomy-product-types", store, isProductType);

const persist = () => persistMockArray("taxonomy-product-types", store);

const esperar = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const cargarCatalogo = async (
  signal: AbortSignal | undefined,
): Promise<Map<string, CharacteristicListItem>> => {
  const catalogo = await mockCharacteristicAdapter.list(signal);
  signal?.throwIfAborted();
  return new Map(catalogo.caracteristicas.map((item) => [item.id, item]));
};

const aDetalle = (
  registro: RegistroTipoProducto,
  catalogo: Map<string, CharacteristicListItem>,
): ProductTypeDetail => {
  const asociadas = registro.asociadas
    .map((asociacion) => catalogo.get(asociacion.caracteristicaId))
    .filter(
      (catalogoItem): catalogoItem is CharacteristicListItem =>
        catalogoItem !== undefined,
    )
    .map((caracteristica) => ({
      caracteristicaId: caracteristica.id,
      obligatoria:
        registro.asociadas.find(
          (asociacion) => asociacion.caracteristicaId === caracteristica.id,
        )?.obligatoria ?? false,
      estado: caracteristica.estado,
      schemaVersion: registro.schemaVersion,
      caracteristica: { ...caracteristica },
    }));
  return {
    tipoProductoId: registro.tipoProductoId,
    nombre: registro.nombre,
    estado: registro.estado,
    schemaVersion: registro.schemaVersion,
    limiteCaracteristicas: registro.limiteCaracteristicas,
    caracteristicasAsignadas: asociadas.length,
    asociadas,
  };
};

const aItem = (registro: RegistroTipoProducto): ProductTypeListItem => ({
  tipoProductoId: registro.tipoProductoId,
  nombre: registro.nombre,
  estado: registro.estado,
  schemaVersion: registro.schemaVersion,
  caracteristicasAsignadas: registro.asociadas.length,
  limiteCaracteristicas: registro.limiteCaracteristicas,
});

const encontrar = (id: string): RegistroTipoProducto | undefined =>
  store.find((registro) => registro.tipoProductoId === id);

const generarId = (nombre: string): string => {
  const base =
    nombre
      .trim()
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tipo-producto";
  let id = base;
  let sufijo = 2;
  while (store.some((item) => item.tipoProductoId === id)) {
    id = `${base}-${sufijo}`;
    sufijo += 1;
  }
  return id;
};

// BLOCKED_CONTRACT: no hay contrato OpenAPI confirmado para el sondeo del resultado
// de una operación asíncrona sobre tipo de producto (desasociación o desactivación,
// 202). Este registro mantiene las operaciones pendientes en memoria para que la UI
// consulte su estado sin inventar un endpoint.
type TipoOperacionTipoProducto = "desasocio" | "desactivacion";

interface OperacionTipoProducto {
  tipoProductoId: string;
  tipo: TipoOperacionTipoProducto;
  caracteristicaId?: string;
  estado: "pendiente" | "confirmada";
}

const operacionesTipoProducto = new Map<string, OperacionTipoProducto>();

// Deterministic local states used only for review. The repository contract does not
// accept scenarios; reviewers change these values to reproduce error or edge cases
// without touching pages, hooks or the service contract.
type EscenarioLista = "default" | "empty" | "error";

const MOCK: { lista: EscenarioLista } = {
  lista: "default",
};

export const mockProductTypeAdapter: ProductTypeRepository = {
  async list(signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    if (MOCK.lista === "error") {
      throw new Error(
        "No se pudieron cargar los tipos de producto. Inténtalo de nuevo.",
      );
    }
    if (MOCK.lista === "empty") {
      return { items: [], limite: PRODUCT_TYPE_ATTRIBUTE_LIMIT };
    }
    return {
      items: store.map(aItem),
      limite: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
    };
  },

  async crear(input: ProductTypeCreateInput, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    const registro: RegistroTipoProducto = {
      tipoProductoId: generarId(input.nombre),
      nombre: input.nombre.trim(),
      estado: "Activo",
      schemaVersion: 0,
      limiteCaracteristicas: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
      asociadas: [],
    };
    store.push(registro);
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      store.pop();
      throw new Error("No se pudo crear el tipo de producto. Vuelve a intentarlo.");
    }
    const resultado: ProductTypeCreateResult = {
      tipoProductoId: registro.tipoProductoId,
      nombre: registro.nombre,
      estado: registro.estado,
      schemaVersion: registro.schemaVersion,
    };
    return resultado;
  },

  async obtener(id: string, signal): Promise<ProductTypeDetail | null> {
    signal?.throwIfAborted();
    const registro = encontrar(id);
    if (!registro) return null;
    const catalogo = await cargarCatalogo(signal);
    signal?.throwIfAborted();
    return aDetalle(registro, catalogo);
  },

  async listarCaracteristicasDisponibles(
    id: string,
    signal,
  ): Promise<ProductTypeAssociationCharacteristic[]> {
    signal?.throwIfAborted();
    const registro = encontrar(id);
    if (!registro) return [];
    const catalogo = await cargarCatalogo(signal);
    return Array.from(catalogo.values())
      .filter(
        (caracteristica) =>
          caracteristica.estado === "Activo" &&
          !registro.asociadas.some(
            (asociacion) => asociacion.caracteristicaId === caracteristica.id,
          ),
      )
      .map((caracteristica) => ({ ...caracteristica }));
  },

  async asociarCaracteristica(input: ProductTypeAssociarInput, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    const registro = encontrar(input.tipoProductoId);
    if (!registro) throw new Error("TIPO_PRODUCTO_NO_ENCONTRADO");
    if (registro.estado !== "Activo")
      throw new Error("TIPO_PRODUCTO_INVALIDO");
    if (
      registro.asociadas.some(
        (asociacion) => asociacion.caracteristicaId === input.caracteristicaId,
      )
    ) {
      throw new Error("ASOCIACION_DUPLICADA");
    }
    if (registro.asociadas.length >= registro.limiteCaracteristicas) {
      throw new Error(
        "Se alcanzó el límite de características del tipo de producto.",
      );
    }
    const catalogo = await cargarCatalogo(signal);
    const caracteristica = catalogo.get(input.caracteristicaId);
    if (!caracteristica || caracteristica.estado !== "Activo") {
      throw new Error("CARACTERISTICA_NO_DISPONIBLE");
    }
    registro.asociadas.push({
      caracteristicaId: input.caracteristicaId,
      obligatoria: input.obligatoria,
    });
    registro.schemaVersion += 1;
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      registro.asociadas.pop();
      registro.schemaVersion -= 1;
      throw new Error("No se pudo asociar la característica. Vuelve a intentarlo.");
    }
    return aDetalle(registro, catalogo);
  },

  async desasociarCaracteristica(
    id: string,
    caracteristicaId: string,
    signal,
  ): Promise<ProductTypeDesasociarResult> {
    signal?.throwIfAborted();
    await esperar(500);
    signal?.throwIfAborted();
    const registro = encontrar(id);
    if (!registro) throw new Error("TIPO_PRODUCTO_NO_ENCONTRADO");
    const asociacion = registro.asociadas.find(
      (item) => item.caracteristicaId === caracteristicaId,
    );
    if (!asociacion) throw new Error("CARACTERISTICA_NO_ASOCIADA");
    if (asociacion.obligatoria) {
      const operacionId = `op-desasocio-${id}-${caracteristicaId}`;
      operacionesTipoProducto.set(operacionId, {
        tipoProductoId: id,
        tipo: "desasocio",
        caracteristicaId,
        estado: "pendiente",
      });
      return {
        resultado: "pendiente",
        mensaje:
          "La solicitud de desasociación se admitió (202) y quedó en verificación con Catálogo. El esquema aún no se modificó.",
        operacionId,
      };
    }
    const prevAsociadas = [...registro.asociadas];
    registro.asociadas = registro.asociadas.filter(
      (item) => item.caracteristicaId !== caracteristicaId,
    );
    registro.schemaVersion += 1;
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      registro.asociadas = prevAsociadas;
      registro.schemaVersion -= 1;
      throw new Error("No se pudo desasociar la característica. Vuelve a intentarlo.");
    }
    return {
      resultado: "exito",
      mensaje:
        "La característica se desasoció del esquema y se incrementó la versión del esquema.",
    };
  },

  async consultarEstadoOperacion(
    operacionId: string,
    signal,
  ): Promise<ProductTypeSeguimiento> {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();

    const operacion = operacionesTipoProducto.get(operacionId);
    if (!operacion) {
      throw new Error("No se encontró la operación de tipo de producto.");
    }
    const registro = encontrar(operacion.tipoProductoId);
    if (!registro) {
      throw new Error("El tipo de producto ya no está disponible.");
    }

    if (operacion.estado === "pendiente") {
      operacion.estado = "confirmada";
      const prevAsociadas = registro.asociadas;
      const prevSchemaVersion = registro.schemaVersion;
      const prevEstado = registro.estado;
      if (operacion.tipo === "desasocio" && operacion.caracteristicaId) {
        registro.asociadas = registro.asociadas.filter(
          (item) => item.caracteristicaId !== operacion.caracteristicaId,
        );
        registro.schemaVersion += 1;
      } else if (operacion.tipo === "desactivacion") {
        registro.estado = "Inactivo";
      }
      const ok = persist();
      if (!ok && isMockPersistenceAvailable()) {
        operacion.estado = "pendiente";
        registro.asociadas = prevAsociadas;
        registro.schemaVersion = prevSchemaVersion;
        registro.estado = prevEstado;
        throw new Error("No se pudo confirmar la operación del tipo de producto. Vuelve a intentarlo.");
      }
    }

    const mensaje =
      operacion.estado === "confirmada"
        ? operacion.tipo === "desasocio"
          ? "Verificación concluida: la característica se desasoció del esquema y se incrementó la versión del esquema."
          : "Verificación concluida: el tipo de producto quedó Inactivo."
        : "La operación continúa en verificación con Catálogo.";
    const catalogo = await cargarCatalogo(signal);
    return {
      operacionId,
      estado: operacion.estado,
      mensaje,
      tipoProducto: aDetalle(registro, catalogo),
    };
  },

  async desactivar(
    id: string,
    signal,
  ): Promise<ProductTypeDesactivarResult> {
    signal?.throwIfAborted();
    await esperar(500);
    signal?.throwIfAborted();
    const registro = encontrar(id);
    if (!registro) throw new Error("TIPO_PRODUCTO_NO_ENCONTRADO");
    if (registro.estado !== "Activo") throw new Error("TIPO_PRODUCTO_INVALIDO");
    if (registro.tipoProductoId === "calzado") {
      return {
        resultado: "rechazada",
        mensaje:
          "Este tipo todavía tiene productos activos asociados. No se realizó la desactivación.",
      };
    }
    if (registro.tipoProductoId === "ropa") {
      const operacionId = `op-desactivacion-${id}`;
      operacionesTipoProducto.set(operacionId, {
        tipoProductoId: id,
        tipo: "desactivacion",
        estado: "pendiente",
      });
      return {
        resultado: "pendiente",
        mensaje:
          "La solicitud de desactivación se admitió (202). El tipo conserva su estado Activo hasta que Catálogo confirme la verificación.",
        operacionId,
      };
    }
    const prevEstado = registro.estado;
    registro.estado = "Inactivo";
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      registro.estado = prevEstado;
      throw new Error("No se pudo desactivar el tipo de producto. Vuelve a intentarlo.");
    }
    return {
      resultado: "exito",
      mensaje: "El tipo de producto se desactivó correctamente.",
    };
  },
};