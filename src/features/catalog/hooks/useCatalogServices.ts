import { useContext } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { getCatalogServices, type CatalogServices } from "../services/catalogServices";

export function useCatalogServices(): CatalogServices {
  const mode = useContext(DataModeContext);
  if (!mode) {
    // If not wrapped in DataModeContext in isolated tests/DEV, fallback to resolved data mode
    const resolved =
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
      (import.meta.env.DEV ? "mock" : "api");
    return getCatalogServices(resolved);
  }
  return getCatalogServices(mode);
}
