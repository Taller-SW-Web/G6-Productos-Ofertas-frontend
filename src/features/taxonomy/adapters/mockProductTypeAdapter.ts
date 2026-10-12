import { mockCharacteristicAdapter } from "./mockCharacteristicAdapter";
import type { ProductTypeRepository } from "../services/productTypeRepository";
import { PRODUCT_TYPE_ATTRIBUTE_LIMIT } from "../services/productTypeRepository";
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

const store: RegistroTipoProducto[] = [
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

const esperar = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const cargarCatalogo = async (
  signal: AbortSignal,
): Promise<Map<string, CharacteristicListItem>> => {
  const catalogo = await mockCharacteristicAdapter.list("default", signal);
  signal.throwIfAborted();
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
        catalogoItem !== undefined && catalogoItem.estado === "Activo",
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

export const mockProductTypeAdapter: ProductTypeRepository = {
  async list(scenario, signal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();
    if (scenario === "error") {
      throw new Error(
        "No se pudieron cargar los tipos de producto. Inténtalo de nuevo.",
      );
    }
    if (scenario === "empty") {
      return { items: [], limite: PRODUCT_TYPE_ATTRIBUTE_LIMIT };
    }
    return {
      items: store.map(aItem),
      limite: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
    };
  },

  async crear(input: ProductTypeCreateInput, signal: AbortSignal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();
    const registro: RegistroTipoProducto = {
      tipoProductoId: generarId(input.nombre),
      nombre: input.nombre.trim(),
      estado: "Activo",
      schemaVersion: 0,
      limiteCaracteristicas: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
      asociadas: [],
    };
    store.push(registro);
    const resultado: ProductTypeCreateResult = {
      tipoProductoId: registro.tipoProductoId,
      nombre: registro.nombre,
      estado: registro.estado,
      schemaVersion: registro.schemaVersion,
    };
    return resultado;
  },

  async obtener(id: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const registro = encontrar(id);
    if (!registro) return null;
    const catalogo = await cargarCatalogo(signal);
    signal.throwIfAborted();
    return aDetalle(registro, catalogo);
  },

  async listarCaracteristicasDisponibles(
    id: string,
    signal: AbortSignal,
  ): Promise<ProductTypeAssociationCharacteristic[]> {
    signal.throwIfAborted();
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

  async asociarCaracteristica(
    input: ProductTypeAssociarInput,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();
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
    return aDetalle(registro, catalogo);
  },

  async desasociarCaracteristica(
    id: string,
    caracteristicaId: string,
    signal: AbortSignal,
  ): Promise<ProductTypeDesasociarResult> {
    signal.throwIfAborted();
    await esperar(500);
    signal.throwIfAborted();
    const registro = encontrar(id);
    if (!registro) throw new Error("TIPO_PRODUCTO_NO_ENCONTRADO");
    const asociacion = registro.asociadas.find(
      (item) => item.caracteristicaId === caracteristicaId,
    );
    if (!asociacion) throw new Error("CARACTERISTICA_NO_ASOCIADA");
    if (asociacion.obligatoria) {
      return {
        resultado: "pendiente",
        mensaje:
          "La solicitud de desasociación se admitió (202) y quedó en verificación con Catálogo. El esquema aún no se modificó.",
      };
    }
    registro.asociadas = registro.asociadas.filter(
      (item) => item.caracteristicaId !== caracteristicaId,
    );
    registro.schemaVersion += 1;
    return {
      resultado: "exito",
      mensaje:
        "La característica se desasoció del esquema y se incrementó la versión del esquema.",
    };
  },

  async desactivar(
    id: string,
    signal: AbortSignal,
  ): Promise<ProductTypeDesactivarResult> {
    signal.throwIfAborted();
    await esperar(500);
    signal.throwIfAborted();
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
      return {
        resultado: "pendiente",
        mensaje:
          "La solicitud de desactivación se admitió (202). Se espera la verificación de Catálogo antes de confirmarla.",
      };
    }
    registro.estado = "Inactivo";
    return {
      resultado: "exito",
      mensaje: "El tipo de producto se desactivó correctamente.",
    };
  },
};