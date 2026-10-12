import { useEffect, useState } from "react";
import { CouponReadError } from "../services/couponRepository";
export function useAdministrationRead<T>(
  key: string,
  read: (signal: AbortSignal) => Promise<T>,
) {
  const [response, setResponse] = useState<{
    key: string;
    state:
      | { status: "success"; result: T }
      | { status: "error"; message: string; access: boolean };
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setResponse({ key, state: { status: "success", result } });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setResponse({
            key,
            state: {
              status: "error",
              message:
                cause instanceof Error
                  ? cause.message
                  : "Consulta no disponible.",
              access:
                cause instanceof CouponReadError &&
                cause.kind !== "unavailable",
            },
          });
      },
    );
    return () => controller.abort();
  }, [key, read]);
  return response?.key === key
    ? response.state
    : ({ status: "loading" } as const);
}
