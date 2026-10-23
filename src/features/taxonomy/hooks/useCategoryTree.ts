import { useCallback, useEffect, useState } from "react";
import { categoryService } from "../services/categoryService";
import type { CategoryNode } from "../types";
import { useMockStateRevision } from "../../shared/useMockStateRevision";

export type CategoryTreeState =
  | { status: "loading" }
  | { status: "success"; nodos: CategoryNode[] }
  | { status: "error"; message: string };

export function useCategoryTree(): {
  state: CategoryTreeState;
  reload: () => void;
} {
  const [state, setState] = useState<CategoryTreeState>({ status: "loading" });
  const [requestVersion, setRequestVersion] = useState(0);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setRequestVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void categoryService.list(controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setState({ status: "success", nodos: result.nodos });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo cargar el árbol de categorías.",
        });
      },
    );
    return () => controller.abort();
  }, [requestVersion]);

  return { state, reload };
}
