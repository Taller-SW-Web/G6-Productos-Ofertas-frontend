import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createHttpBrandRepository } from "../../src/features/taxonomy/adapters/httpTaxonomyAdmin";
import type { TaxonomyGatewayTransport } from "../../src/features/taxonomy/adapters/httpProductTypeAdapter";
import type { BrandDetail } from "../../src/features/taxonomy/types";

const transport: TaxonomyGatewayTransport = {
  scopeId: () => "g7-taxonomy-h4-human-a",
  request: async (path, signal) => fetch(path, { method: "GET", signal }),
  requestWithInit: async (path, init) => fetch(path, init),
};
const repository = createHttpBrandRepository(transport);

function BrandHttpProbe() {
  const [brand, setBrand] = useState<BrandDetail | null>(null);
  const [message, setMessage] = useState("Cargando marca");
  const [refreshError, setRefreshError] = useState("");
  const reload = useCallback(async () => {
    try {
      const value = await repository.obtener("brand-h4-http");
      if (value) setBrand(value);
      setRefreshError("");
    } catch {
      setRefreshError("La consulta posterior no está disponible.");
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const save = async () => {
    const updated = await repository.actualizar({ marcaId: "brand-h4-http", nombre: "Marca H4 HTTP", descripcion: "Actualizada", paisOrigenIso: "PE" });
    if (updated) {
      setBrand(updated);
      setMessage(`Escritura confirmada v${updated.version}`);
    }
  };
  return <main>
    <h1>Prueba de adaptador HTTP de Marca</h1>
    {brand && <p>{brand.nombre} v{brand.version}</p>}
    {message.startsWith("Escritura") && <p>{message.replace("Escritura confirmada v", "Marca H4 HTTP v").concat(" confirmada")}</p>}
    {refreshError && <p role="alert">{refreshError}</p>}
    <button type="button" onClick={() => void save()}>Guardar marca</button>
    <button type="button" onClick={() => void reload()}>Consultar marca</button>
  </main>;
}

createRoot(document.getElementById("root")!).render(<BrandHttpProbe />);
