import { useEffect, useState } from "react";
import type { ProductDetailView } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { catalogService } from "../services/catalogService";

export interface ProductDetailState {
  status: "loading" | "success" | "error" | "not_found" | "forbidden" | "session";
  product?: ProductDetailView;
  error?: string;
}

export function useProductDetail(
  id: string,
  scenario?: string,
  revision = 0,
): ProductDetailState {
  const key = JSON.stringify([id, scenario, revision]);
  const [response, setResponse] = useState<{
    key: string;
    state: ProductDetailState;
  }>();

  useEffect(() => {
    const controller = new AbortController();

    catalogService
      .getById(id, scenario, controller.signal)
      .then((product) => {
        if (!controller.signal.aborted) {
          if (!product) {
            setResponse({
              key,
              state: { status: "not_found", error: "Producto no encontrado." },
            });
          } else {
            setResponse({
              key,
              state: { status: "success", product },
            });
          }
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof CatalogError) {
          if (err.kind === "forbidden") {
            setResponse({
              key,
              state: { status: "forbidden", error: err.message },
            });
            return;
          }
          if (err.kind === "session") {
            setResponse({
              key,
              state: { status: "session", error: err.message },
            });
            return;
          }
          if (err.kind === "not_found") {
            setResponse({
              key,
              state: { status: "not_found", error: err.message },
            });
            return;
          }
        }
        setResponse({
          key,
          state: {
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "Error al consultar el detalle del producto.",
          },
        });
      });

    return () => controller.abort();
  }, [id, key, scenario]);

  return response?.key === key
    ? response.state
    : { status: "loading" };
}
