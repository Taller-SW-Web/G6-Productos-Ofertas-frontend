import {
  CategorySlugConflictError,
  type CategoryRepository,
} from "../services/categoryRepository";
import { generarSlug } from "../services/slug";
import type {
  BloqueoDependencia,
  CategoryDetail,
  CategoryNode,
} from "../types";
import {
  isMockPersistenceAvailable,
  loadMockArray,
  persistMockArray,
  syncMockArrayOnExternalChange,
} from "../../shared/mockState";

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

const storeFixtures: RegistroCategoria[] = [
  {
    id: "CAT-ROPA",
    nombre: "Ropa",
    slug: "cat-ropa",
    padreId: null,
    orden: 1,
    estado: "Activo",
    descripcion: "Prendas de vestir.",
    productosActivos: 0,
  },
  {
    id: "calzado",
    nombre: "Calzado",
    slug: "calzado",
    padreId: null,
    orden: 2,
    estado: "Activo",
    descripcion: "Calzado para dama y caballero.",
    productosActivos: 0,
  },
  {
    id: "ropa",
    nombre: "Ropa",
    slug: "ropa",
    padreId: null,
    orden: 3,
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

const isCategory = (value: unknown): value is RegistroCategoria => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.nombre === "string" &&
    typeof row.slug === "string" &&
    (row.padreId === null || typeof row.padreId === "string") &&
    typeof row.orden === "number" &&
    (row.estado === "Activo" || row.estado === "Inactivo" || row.estado === "Verificando baja")
  );
};

// Demo state restored from the current-browser session when available; otherwise a
// fresh clone of the fixtures. Cross-tab writes rehydrate this same array in place.
const store: RegistroCategoria[] = loadMockArray("taxonomy-categories", storeFixtures, isCategory);
syncMockArrayOnExternalChange("taxonomy-categories", store, isCategory);

const persist = () => persistMockArray("taxonomy-categories", store);

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// H-06: test isolation. The adapter keeps a module-level mutable store; tests that
// create/move categories must be able to restore the pristine baseline so they do
// not leak state into one another. Not part of the CategoryRepository contract.
const estadoInicial: RegistroCategoria[] = store.map((item) => ({ ...item }));

export const __resetCategoryStore = (): void => {
  store.length = 0;
  store.push(...estadoInicial.map((item) => ({ ...item })));
  __resetCategoryMockScenarios();
};

// SPEC-008 / MK-008: la taxonomía admite como máximo dos niveles (raíz y
// subcategoría). Crear o mover una categoría a un tercer nivel (nieta) rompería
// el árbol y la navegación, por lo que el adaptador lo rechaza explícitamente.
const MAX_NIVELES_CATEGORIA = 2;
const MENSAJE_MAX_NIVELES =
  "No se permiten más de dos niveles de categorías (raíz y subcategoría).";

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

// Las operaciones de baja pendientes se persisten con su identificador y estado;
// al recargar el usuario puede consultar o finalizar la misma operación sin que se
// genere un identificador nuevo.
interface OperacionBajaCategoria {
  operacionId: string;
  categoriaId: string;
  estado: "pendiente" | "confirmada" | "rechazada";
}

const isOperacionBajaCategoria = (value: unknown): value is OperacionBajaCategoria => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.operacionId === "string" &&
    typeof row.categoriaId === "string" &&
    (row.estado === "pendiente" || row.estado === "confirmada")
  );
};

const operacionesBaja: OperacionBajaCategoria[] = loadMockArray(
  "taxonomy-category-baja",
  [],
  isOperacionBajaCategoria,
);
syncMockArrayOnExternalChange("taxonomy-category-baja", operacionesBaja, isOperacionBajaCategoria);

const persistCategoriaBaja = () => persistMockArray("taxonomy-category-baja", operacionesBaja);

// Deterministic local states used only for review. The repository contract does not
// accept scenarios; reviewers change these values to reproduce error or edge cases
// without touching pages, hooks or the service contract.
const DEFAULT_MOCK_SCENARIOS: CategoryMockScenarios = {
  detalle: "default",
  slug: "default",
  baja: "default",
  reactivacion: "default",
  arbol: "default",
};
const MOCK: CategoryMockScenarios = { ...DEFAULT_MOCK_SCENARIOS };

// Test/review controls for deterministic local adapter scenarios. They are not
// part of CategoryRepository and do not select a different application data mode.
export const __setCategoryMockScenarios = (
  scenarios: Partial<CategoryMockScenarios>,
): void => {
  Object.assign(MOCK, scenarios);
};

export const __resetCategoryMockScenarios = (): void => {
  Object.assign(MOCK, DEFAULT_MOCK_SCENARIOS);
};

// Mock adapter: returns deterministic fixtures, never a real backend response.
export const mockCategoryAdapter: CategoryRepository = {
  async list(signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    if (MOCK.arbol === "error") {
      throw new Error("No se pudo cargar el árbol de categorías. Inténtalo de nuevo.");
    }
    if (MOCK.arbol === "empty") return { nodos: [], colapsadosPorId: [] };
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

  async proponerSlug(nombre, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();

    const slug = generarSlug(nombre);

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

    if (MOCK.slug === "slug-carrera-409") {
      // Simulate a concurrent writer exactly once. The next resolution sees
      // the occupied slug and returns the deterministic alternative.
      MOCK.slug = "default";
      store.push({
        id: `reserva-concurrente-${input.slug}`,
        nombre: "Categoría creada en otra operación",
        slug: input.slug,
        padreId: null,
        orden: store.length + 1,
        estado: "Activo",
        productosActivos: 0,
      });
      throw new CategorySlugConflictError();
    }
    if (slugEnUso(input.slug)) {
      throw new CategorySlugConflictError();
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
      // The parent must be a root category: a child parent would place the new
      // category on a third level.
      if (nivelDe(padreId) + 1 >= MAX_NIVELES_CATEGORIA) {
        throw new Error(MENSAJE_MAX_NIVELES);
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
    };
    store.push(creado);
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      store.pop();
      throw new Error("No se pudo guardar la categoría. Vuelve a intentarlo.");
    }
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
      // The new parent must be a root: a child parent would place the moved
      // category on a third level.
      if (nivelDe(padreId) + 1 >= MAX_NIVELES_CATEGORIA) {
        throw new Error(MENSAJE_MAX_NIVELES);
      }
      // Moving a category that already has children under any parent would push
      // those children to a third level, so it is rejected.
      if (hijasDe(registro.id).length > 0) {
        throw new Error(
          "No puedes mover una categoría con subcategorías bajo otra categoría: se superarían los dos niveles permitidos.",
        );
      }
    }

    const prev = { ...registro };
    registro.nombre = input.nombre;
    registro.slug = input.slug;
    registro.padreId = padreId;
    registro.orden = typeof input.orden === "number" ? input.orden : registro.orden;
    registro.descripcion = input.descripcion;
    registro.imagen =
      input.imagen?.trim() || input.imagenUrl?.trim() || undefined;

    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      Object.assign(registro, prev);
      throw new Error("No se pudo guardar la categoría. Vuelve a intentarlo.");
    }
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

    const prevEstado = registro.estado;
    registro.estado = "Verificando baja";
    const operacionId = `op-baja-categoria-${id}`;
    operacionesBaja.set(operacionId, {
      categoriaId: id,
      estado: MOCK.baja === "rechazada-asincrona" ? "rechazada" : "pendiente",
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

    const operacion = operacionesBaja.find((item) => item.operacionId === operacionId);
    if (!operacion) {
      throw new Error("No se encontró la operación de baja solicitada.");
    }
    const registro = hallar(operacion.categoriaId);
    if (!registro) {
      throw new Error("La categoría ya no está disponible.");
    }

    if (MOCK.baja === "error-consulta") {
      throw new Error("No se pudo consultar la verificación de dependencias.");
    }

    if (operacion.estado === "rechazada") {
      registro.estado = "Activo";
      return {
        operacionId,
        estado: "rechazada",
        mensaje: "La verificación encontró productos activos asociados. La categoría continúa activa.",
        categoria: aDetalle(registro),
      };
    }

    if (operacion.estado === "pendiente" && MOCK.baja === "pendiente-prolongado") {
      return {
        operacionId,
        estado: "pendiente",
        mensaje: "La verificación continúa pendiente. La categoría no se ha desactivado.",
        categoria: aDetalle(registro),
      };
    }

    if (operacion.estado === "pendiente") {
      operacion.estado = "confirmada";
      const prevEstado = registro.estado;
      registro.estado = "Inactivo";
      const ok1 = persist();
      const ok2 = persistCategoriaBaja();
      if ((!ok1 || !ok2) && isMockPersistenceAvailable()) {
        registro.estado = prevEstado;
        operacion.estado = "pendiente";
        throw new Error("No se pudo confirmar la baja de la categoría. Vuelve a intentarlo.");
      }
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

    const prev = registro.estado;
    registro.estado = "Activo";
    const ok = persist();
    if (!ok && isMockPersistenceAvailable()) {
      registro.estado = prev;
      throw new Error("No se pudo reactivar la categoría. Vuelve a intentarlo.");
    }
    return {
      resultado: "reactivada",
      categoria: aDetalle(registro),
      bloqueos: [],
      mensaje: "La categoría se reactivó correctamente.",
    };
  },
};
