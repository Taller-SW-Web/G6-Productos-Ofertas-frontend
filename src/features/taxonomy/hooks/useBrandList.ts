import { useEffect, useState } from "react";
import { brandService } from "../services/brandService";
import type { BrandListResult, BrandListScenario } from "../services/brandRepository";

export type BrandListState =
  | { status: "loading" }
  | { status: "success"; result: BrandListResult }
  | { status: "error"; message: string };

export function useBrandList(scenario: BrandListScenario, revision: number): { state: BrandListState } {
  const requestKey = JSON.stringify([scenario, revision]);
  const [response, setResponse] = useState<{ requestKey: string; state: BrandListState }>();

  useEffect(() => {
    const controller = new AbortController();
    void brandService.list(scenario, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setResponse({ requestKey, state: { status: "success", result } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResponse({
          requestKey,
          state: {
            status: "error",
            message: error instanceof Error ? error.message : "No se pudieron cargar las marcas.",
          },
        });
      },
    );
    return () => controller.abort();
  }, [scenario, requestKey]);

  const state = response?.requestKey === requestKey ? response.state : ({ status: "loading" } as const);
  return { state };
}
