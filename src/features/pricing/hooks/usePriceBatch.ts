import { useCallback, useContext, useEffect, useState } from "react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import {
  usePricingRevision,
  usePricingRuntime,
} from "../services/PricingContext";
import type { ReportFile } from "../services/pricingRepository";
import { usePricingAction, usePricingRead } from "./usePricingRequest";

export function usePriceBatch(id: string) {
  const { service, downloader } = usePricingRuntime();
  const update = usePricingRevision("readBatch");
  const mode = useContext(DataModeContext);
  const [poll, setPoll] = useState({ revision: 0, delay: 2000 });
  const read = useCallback(
    (signal: AbortSignal) => service.readBatch(id, signal),
    [service, id],
  );
  const response = usePricingRead(`${id}:${poll.revision}:${update}`, read, id);
  const status = response.state.status === "success" ? response.state.result?.status : undefined;
  useEffect(() => {
    if (mode !== "api" || (status !== "QUEUED" && status !== "PROCESSING"))
      return;
    const timer = setTimeout(() => {
      setPoll(({ revision, delay }) => ({
        revision: revision + 1,
        delay: Math.min(delay * 2, 30_000),
      }));
    }, poll.delay);
    return () => clearTimeout(timer);
  }, [mode, status, poll.delay, poll.revision, update]);
  const report = usePricingAction<ReportFile>();
  return {
    ...response,
    report,
    refresh: () => {
      report.clear();
      setPoll(({ revision }) => ({ revision: revision + 1, delay: 2000 }));
    },
    download: () =>
      report.run(async (signal) => {
        const file = await service.report(id, signal);
        signal.throwIfAborted();
        downloader.save(file);
        return file;
      }),
  };
}
