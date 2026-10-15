import { useContext, useMemo } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { createBulkRepository } from "../services/bulkService";
import { BulkRepositoryContext } from "../services/BulkRepositoryContext";

export function useBulkRepository() {
  const mode = useContext(DataModeContext);
  const injected = useContext(BulkRepositoryContext);
  if (!mode) {
    throw new Error("Carga masiva requiere DataModeContext.");
  }
  return useMemo(
    () => injected ?? createBulkRepository(mode),
    [injected, mode],
  );
}
