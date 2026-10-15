import { Stack } from "@mantine/core";
import { useContext } from "react";
import { Outlet } from "react-router-dom";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { FeedbackAlert } from "../../../components/shared";
import { BulkUploadProvider } from "../context/BulkUploadContext";

export function BulkLayout() {
  const mode = useContext(DataModeContext);
  if (!mode) throw new Error("La aplicación requiere configurar su modo de datos.");

  return (
    <BulkUploadProvider>
      <Stack gap="lg">
        {mode === "api" && (
          <FeedbackAlert semantic="warning" title="Provider API de Bulk no configurado">
            Las operaciones de carga masiva no están conectadas a bulk-svc. No se utilizarán fixtures mock en este modo.
          </FeedbackAlert>
        )}
        <Outlet />
      </Stack>
    </BulkUploadProvider>
  );
}
