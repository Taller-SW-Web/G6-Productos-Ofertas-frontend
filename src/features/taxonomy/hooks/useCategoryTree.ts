import { useContext, useEffect, useState } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { getTaxonomyGateway } from "../services/taxonomyGatewayRuntime";
import { loadCategoryTree } from "../adapters/httpCategoryTreeAdapter";
import type { CategoryNode } from "../types";
import { useMockStateRevision } from "../../shared/useMockStateRevision";

export type CategoryTreeState =
  | { status: "loading" }
  | { status: "success"; nodos: CategoryNode[] }
  | { status: "error"; message: string };

export function useCategoryTree(): { state: CategoryTreeState } {
  const mode = useContext(DataModeContext);
  const revision = useMockStateRevision(["taxonomy", "taxonomy-categories"]);
  const requestKey = JSON.stringify([revision, mode]);
  const [response, setResponse] = useState<{ requestKey: string; state: CategoryTreeState }>();

  useEffect(() => {
    const controller = new AbortController();
    const list = async () => {
      if (mode === "mock") return (await import("../services/categoryService")).categoryService.list(controller.signal);
      const gateway = getTaxonomyGateway();
      if (!gateway) throw new Error("Integración de Taxonomía no configurada.");
      return { nodos: await loadCategoryTree(gateway, controller.signal) };
    };
    void list().then(
      (result) => {
        if (controller.signal.aborted) return;
        setResponse({ requestKey, state: { status: "success", nodos: result.nodos } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResponse({ requestKey, state: {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo cargar el árbol de categorías.",
        } });
      },
    );
    return () => controller.abort();
  }, [requestKey, mode]);

  return { state: response?.requestKey === requestKey ? response.state : { status: "loading" } };
}
