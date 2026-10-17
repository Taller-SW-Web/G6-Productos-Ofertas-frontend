import type { CategoryRepository } from "../services/categoryRepository";
import type {
  BloqueoDependencia,
  CategoryDetail,
  CategoryNode,
} from "../types";

// In-memory flat store for MK-008. No HTTP contract exists yet; writes are simulated
// and lost on reload. Keeping it flat makes parent/child relationships explicit.
interface RegistroCategoria {
  id: string;
  nombre: string;
  slug: string;
  padreId: string | null;
  orden: number;
  estado: CategoryNode["estado"];
  descripcion?: string;
  imagen?: string;
  // Simulated dependency count. Taxonomy does not own product state; used only to
  // exercise the deactivation/reactivation review flows.
  productosActivos?: number;
}

const store: RegistroCategoria[] = [
  {
    id: "calzado",
    nombre: "Calzado",
    slug: "calzado",
    padreId: null,
    orden: 1,
    estado: "Activo",
    descripcion: "Calzado para dama y caballero.",
    productosActivos: 0,
  },
  {
    id: "ropa",
    nombre: "Ropa",
    slug: "ropa",
    padreId: null,
    orden: 2,
    estado: "Activo",
    descripcion: "Prendas de vestir.",
    productosActivos: 0,
  },
  {
    id: "accesorios",
    nombre: "Accesorios",
    slug: "accesorios",
    padreId: null,
    orden: 3,
    estado: "Activo",
    descripcion: "Accesorios y complementos.",
    productosActivos: 0,
  },
  {
    id: "running",
    nombre: "Running",
    slug: "running",
    padreId: "calzado",
    orden: 1,
    estado: "Activo",
    productosActivos: 12,
  },
  {
    id: "casual",
    nombre: "Casual",
    slug: "casual",
    padreId: "calzado",
    orden: 2,
    estado: "Activo",
    productosActivos: 0,
  },
  {
    id: "play",
    nombre: "Play",
    slug: "play",
    padreId: "ropa",
    orden: 1,
    estado: "Inactivo",
    productosActivos: 5,
  },
  {
    id: "office",
    nombre: "Office",
    slug: "office",
    padreId: "ropa",
    orden: 2,
    estado: "Verificando baja",
    productosActivos: 0,
  },
  {
    id: "inactiva-raiz",
    nombre: "Inactiva Raiz",
    slug: "inactiva-raiz",
    padreId: null,
    orden: 4,
    estado: "Inactivo",
    productosActivos: 3,
  },
  {
    id: "hija-padre-inactivo",
    nombre: "Hija Padre Inactivo",
    slug: "hija-padre-inactivo",
    padreId: "inactiva-raiz",
    orden: 1,
    estado: "Inactivo",
    productosActivos: 0,
  },
];

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// LOP-01 / LOP-04: single internal ID per category. Catálogo can send external
// aliases (CAT-CALZADO), so every id that takes part in a parent/child relation
// is normalized to the canonical Taxonomy ID before it is stored or compared.
// Without this, a category created or moved through an alias would keep the
// alias as `padreId`, become invisible in the tree (hijasDe compares raw) and
// allow self-referencing cycles that the raw equality check would miss.
const ALIAS_CATEGORY_MAP: Record<string, string> = {
  "CAT-CALZADO": "calzado",
  "CAT-ROPA": "ropa",
  "CAT-ACC": "accesorios",
};

const normalizarIdCategoria = (id: string): string =>
  ALIAS_CATEGORY_MAP[id] ?? id;

const hallar = (id: string): RegistroCategoria | undefined => {
  const targetId = normalizarIdCategoria(id);
  return store.find((item) => item.id === targetId);
};

const nivelDe = (id: string): number => {
  let nivel = 0;
  let actual = hallar(id);
  while (actual && actual.padreId) {
    nivel += 1;
    actual = hallar(actual.padreId);
  }
  return nivel;
};

const esDescendiente = (posibleDescendienteId: string, ancestroId: string): boolean => {
  const ancestro = normalizarIdCategoria(ancestroId);
  let actual = hallar(posibleDescendienteId);
  while (actual && actual.padreId) {
    if (actual.padreId === ancestro) return true;
    actual = hallar(actual.padreId);
  }
  return false;
};

const hijasDe = (padreId: string | null): RegistroCategoria[] => {
  const objetivo =
    padreId === null ? null : normalizarIdCategoria(padreId);
  return store
    .filter((item) => item.padreId === objetivo)
    .sort((a, b) => a.orden - b.orden);
};

const slugEnUso = (slug: string, exceptoId?: string): boolean =>
  store.some((item) => item.slug === slug && item.id !== exceptoId);

const aNodo = (registro: RegistroCategoria): CategoryNode => ({
  id: registro.id,
  nombre: registro.nombre,
  nivel: nivelDe(registro.id),
  estado: registro.estado,
  slug: registro.slug,
  orden: registro.orden,
  descripcion: registro.descripcion,
  imagen: registro.imagen,
  imagenUrl: registro.imagen,
  hijas: hijasDe(registro.id).map(aNodo),
});

const aDetalle = (registro: RegistroCategoria): CategoryDetail => {
  const padre = registro.padreId ? hallar(registro.padreId) : undefined;
  return {
    id: registro.id,
    nombre: registro.nombre,
    slug: registro.slug,
    nivel: nivelDe(registro.id),
    orden: registro.orden,
    estado: registro.estado,
    descripcion: registro.descripcion,
    padreId: registro.padreId ?? undefined,
    padreNombre: padre?.nombre,
    imagen: registro.imagen,
    imagenUrl: registro.imagen,
    hijas: hijasDe(registro.id).map(aNodo),
  };
};

// BLOCKED_CONTRACT: no hay contrato OpenAPI confirmado para el sondeo del resultado
// de una baja asíncrona (202). Este registro mantiene las operaciones pendientes en
// memoria para que la UI pueda consultar su estado sin inventar un endpoint HTTP.
interface OperacionBajaCategoria {
  categoriaId: string;
  estado: "pendiente" | "confirmada";
}

const operacionesBaja = new Map<string, OperacionBajaCategoria>();

// Deterministic local states used only for review. The repository contract does not
// accept scenarios; reviewers change these values to reproduce error or edge cases
// without touching pages, hooks or the service contract.
type EscenarioDetalle = "default" | "no-encontrado" | "error";
type EscenarioSlug =
  | "default"
  | "slug-sin-colision"
  | "slug-con-colision"
  | "slug-carrera-409";
type EscenarioBaja = "default" | "rechazada-subcategorias" | "rechazada-productos" | "error";
type EscenarioReactivacion = "default" | "bloqueada" | "error";

const MOCK: {
  detalle: EscenarioDetalle;
  slug: EscenarioSlug;
  baja: EscenarioBaja;
  reactivacion: EscenarioReactivacion;
} = {
  detalle: "default",
  slug: "default",
  baja: "default",
  reactivacion: "default",
};

// Mock adapter: returns deterministic fixtures, never a real backend response.
export const mockCategoryAdapter: CategoryRepository = {
  async list(signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    return { nodos: hijasDe(null).map(aNodo), colapsadosPorId: [] };
  },

  async obtener(id, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();

    if (MOCK.detalle === "error") {
      throw new Error("No se pudo cargar la categoría. Inténtalo de nuevo.");
    }
    if (MOCK.detalle === "no-encontrado") return null;

    const registro = hallar(id);
    return registro ? aDetalle(registro) : null;
  },

  async comprobarSlug(slug, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();

    if (MOCK.slug === "slug-sin-colision") {
      return { slug, disponible: true };
    }
    if (MOCK.slug === "slug-con-colision") {
      return { slug, disponible: false, alternativo: `${slug}-2` };
    }
    if (MOCK.slug === "slug-carrera-409") {
      // Looks free here; the collision only appears when saving.
      return { slug, disponible: true };
    }

    const disponible = !slugEnUso(slug);
    return disponible
      ? { slug, disponible }
      : { slug, disponible, alternativo: `${slug}-2` };
  },

  async crear(input, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();

    if (MOCK.slug === "slug-carrera-409" || slugEnUso(input.slug)) {
      throw new Error(
        "El slug ya está en uso. Elige la alternativa sugerida o modifica el slug.",
      );
    }

    const padreId = input.padreId
      ? normalizarIdCategoria(input.padreId)
      : null;
    if (padreId) {
      const padre = hallar(padreId);
      if (!padre) {
        throw new Error("La categoría padre seleccionada no existe.");
      }
      if (padre.estado !== "Activo") {
        throw new Error(
          "No se puede crear una categoría activa bajo una categoría padre inactiva.",
        );
      }
    }

    // A reserved external alias must never become a stored category id; doing so
    // would create a second ID for the same entity and break the single-ID rule.
    if (normalizarIdCategoria(input.slug) !== input.slug) {
      throw new Error(
        "El slug no puede coincidir con un identificador reservado.",
      );
    }
    const id = input.slug;
    if (padreId && padreId === id) {
      throw new Error(
        "Una categoría no puede ser su propia categoría padre.",
      );
    }
    const orden =
      typeof input.orden === "number"
        ? input.orden
        : hijasDe(padreId).length + 1;
    const imagen =
      input.imagen?.trim() || input.imagenUrl?.trim() || undefined;

    store.push({
      id,
      nombre: input.nombre,
      slug: input.slug,
      padreId,
      orden,
      estado: "Activo",
      descripcion: input.descripcion,
      imagen,
      productosActivos: 0,
    });
    return { id, nombre: input.nombre, slug: input.slug };
  },

  async actualizar(input, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();

    const registro = hallar(input.id);
    if (!registro) {
      throw new Error("La categoría ya no está disponible para editar.");
    }
    if (MOCK.slug === "slug-carrera-409" || slugEnUso(input.slug, input.id)) {
      throw new Error(
        "El slug ya está en uso. Elige la alternativa sugerida o modifica el slug.",
      );
    }

    const padreId = input.padreId
      ? normalizarIdCategoria(input.padreId)
      : null;
    if (padreId) {
      const padre = hallar(padreId);
      if (!padre) {
        throw new Error("La categoría padre seleccionada no existe.");
      }
      // Compare against the canonical stored id: a parent passed as an alias of
      // the category itself (e.g. padreId "CAT-CALZADO" for id "calzado") must be
      // rejected as self-reference instead of creating a cycle.
      if (padreId === registro.id || esDescendiente(padreId, registro.id)) {
        throw new Error(
          "No puedes mover una categoría dentro de sí misma o de una de sus subcategorías.",
        );
      }
      if (registro.estado === "Activo" && padre.estado !== "Activo") {
        throw new Error(
          "No se puede asignar como padre a una categoría inactiva.",
        );
      }
    }

    registro.nombre = input.nombre;
    registro.slug = input.slug;
    registro.padreId = padreId;
    registro.orden = typeof input.orden === "number" ? input.orden : registro.orden;
    registro.descripcion = input.descripcion;
    registro.imagen =
      input.imagen?.trim() || input.imagenUrl?.trim() || undefined;

    return aDetalle(registro);
  },

  async solicitarBaja(id, signal) {
    signal?.throwIfAborted();
    await esperar(500);
    signal?.throwIfAborted();

    const registro = hallar(id);
    if (!registro) {
      throw new Error("La categoría ya no está disponible para desactivar.");
    }

    if (MOCK.baja === "error") {
      throw new Error("No se pudo verificar la baja. Inténtalo de nuevo.");
    }

    if (MOCK.baja === "rechazada-subcategorias") {
      const cantidad = hijasDe(id).filter((item) => item.estado === "Activo").length || 1;
      return {
        resultado: "rechazada",
        categoria: aDetalle(registro),
        bloqueos: [
          {
            tipo: "subcategorias",
            cantidad,
            detalle: "Subcategorías activas que dependen de esta categoría.",
          },
        ],
        mensaje:
          "No se puede desactivar: la categoría tiene subcategorías activas.",
      };
    }

    if (MOCK.baja === "rechazada-productos") {
      const cantidad = registro.productosActivos || 1;
      return {
        resultado: "rechazada",
        categoria: aDetalle(registro),
        bloqueos: [
          {
            tipo: "productos",
            cantidad,
            detalle: "Productos activos asociados a esta categoría.",
          },
        ],
        mensaje: "No se puede desactivar: la categoría tiene productos activos.",
      };
    }

    if (MOCK.baja === "default") {
      const hijasActivas = hijasDe(id).filter((item) => item.estado === "Activo");
      if (hijasActivas.length > 0) {
        return {
          resultado: "rechazada",
          categoria: aDetalle(registro),
          bloqueos: [
            {
              tipo: "subcategorias",
              cantidad: hijasActivas.length,
              detalle: "Subcategorías activas que dependen de esta categoría.",
            },
          ],
          mensaje:
            "No se puede desactivar: la categoría tiene subcategorías activas.",
        };
      }
      const productos = registro.productosActivos ?? 0;
      if (productos > 0) {
        return {
          resultado: "rechazada",
          categoria: aDetalle(registro),
          bloqueos: [
            {
              tipo: "productos",
              cantidad: productos,
              detalle: "Productos activos asociados a esta categoría.",
            },
          ],
          mensaje:
            "No se puede desactivar: la categoría tiene productos activos.",
        };
      }
    }

    registro.estado = "Verificando baja";
    const operacionId = `op-baja-categoria-${id}`;
    operacionesBaja.set(operacionId, {
      categoriaId: id,
      estado: "pendiente",
    });
    return {
      resultado: "verificando",
      categoria: aDetalle(registro),
      bloqueos: [],
      mensaje:
        "La solicitud de baja quedó en verificación. La categoría se marcará como inactiva al finalizar.",
      operacionId,
    };
  },

  async consultarEstadoOperacion(operacionId, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();

    const operacion = operacionesBaja.get(operacionId);
    if (!operacion) {
      throw new Error("No se encontró la operación de baja solicitada.");
    }
    const registro = hallar(operacion.categoriaId);
    if (!registro) {
      throw new Error("La categoría ya no está disponible.");
    }

    if (operacion.estado === "pendiente") {
      operacion.estado = "confirmada";
      registro.estado = "Inactivo";
      return {
        operacionId,
        estado: "confirmada",
        mensaje:
          "Verificación concluida: la categoría quedó Inactiva sin eliminar el registro.",
        categoria: aDetalle(registro),
      };
    }

    return {
      operacionId,
      estado: "confirmada",
      mensaje: "La baja de la categoría ya estaba confirmada.",
      categoria: aDetalle(registro),
    };
  },

  async reactivar(id, signal) {
    signal?.throwIfAborted();
    await esperar(500);
    signal?.throwIfAborted();

    const registro = hallar(id);
    if (!registro) {
      throw new Error("La categoría ya no está disponible para reactivar.");
    }

    if (MOCK.reactivacion === "error") {
      throw new Error("No se pudo reactivar la categoría. Inténtalo de nuevo.");
    }

    const productos = registro.productosActivos ?? 0;
    const padre = registro.padreId ? hallar(registro.padreId) : undefined;
    const padreBloqueante = padre && padre.estado !== "Activo";

    const bloqueada =
      MOCK.reactivacion === "bloqueada" ||
      (MOCK.reactivacion === "default" && (productos > 0 || Boolean(padreBloqueante)));

    if (bloqueada) {
      const bloqueos: BloqueoDependencia[] = [];
      if (productos > 0) {
        bloqueos.push({
          tipo: "productos",
          cantidad: productos,
          detalle: "Productos activos asociados a esta categoría.",
        });
      }
      if (padreBloqueante && padre) {
        bloqueos.push({
          tipo: "padre",
          cantidad: 1,
          detalle: `La categoría padre «${padre.nombre}» no está activa.`,
        });
      }
      if (bloqueos.length === 0) {
        bloqueos.push({
          tipo: "productos",
          cantidad: 1,
          detalle: "La categoría tiene dependencias que impiden reactivarla.",
        });
      }
      return {
        resultado: "bloqueada",
        categoria: aDetalle(registro),
        bloqueos,
        mensaje: "No se puede reactivar la categoría en este momento.",
      };
    }

    registro.estado = "Activo";
    return {
      resultado: "reactivada",
      categoria: aDetalle(registro),
      bloqueos: [],
      mensaje: "La categoría se reactivó correctamente.",
    };
  },
};