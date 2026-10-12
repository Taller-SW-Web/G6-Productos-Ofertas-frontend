import { reviewServices } from "../dev/reviewServices";
import { type CouponScenario } from "../dev/demoScenarios";
import { useCallback, useEffect, useState } from "react";
import {
  CouponReadError,
  type CouponQuery,
  type CouponReadFailure,
} from "../services/couponRepository";

type ReadState<T> =
  | { status: "loading" }
  | { status: "success"; result: T }
  | { status: "error"; kind: CouponReadFailure; message: string };

function useCouponRead<T>(
  key: string,
  read: (signal: AbortSignal) => Promise<T>,
) {
  const [response, setResponse] = useState<{
    key: string;
    state: ReadState<T>;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setResponse({ key, state: { status: "success", result } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResponse({
            key,
            state: {
              status: "error",
              kind:
                error instanceof CouponReadError ? error.kind : "unavailable",
              message:
                error instanceof Error
                  ? error.message
                  : "No se pudo consultar la información.",
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

export function useCouponList(
  query: CouponQuery,
  scenario: CouponScenario,
  revision: number,
) {
  const { status, page, pageSize } = query;
  const key = JSON.stringify([status, page, pageSize, scenario, revision]);
  const read = useCallback(
    (signal: AbortSignal) =>
      reviewServices(scenario).coupons.list({ status, page, pageSize }, signal),
    [status, page, pageSize, scenario],
  );
  return useCouponRead(key, read);
}
export function useCoupon(
  id: string,
  scenario: CouponScenario,
  revision: number,
) {
  const key = JSON.stringify([id, scenario, revision]);
  const read = useCallback(
    (signal: AbortSignal) => reviewServices(scenario).coupons.read(id, signal),
    [id, scenario],
  );
  return useCouponRead(key, read);
}
