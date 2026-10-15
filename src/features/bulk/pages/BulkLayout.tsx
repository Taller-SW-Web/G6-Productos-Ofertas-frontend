import { Stack } from "@mantine/core";
import { Outlet } from "react-router-dom";
import { FeedbackAlert } from "../../../components/shared";
import { BulkUploadProvider } from "../context/BulkUploadContext";
import { useBulkRepositorySelection } from "../hooks/useBulkRepository";

export function BulkLayout() {
  const { mode, providerConfigured } = useBulkRepositorySelection();

  return (
    <BulkUploadProvider>
      <Stack gap="lg">
        {mode === "api" && !providerConfigured && (
          <FeedbackAlert semantic="warning" title="Provider API de Bulk no configurado">
            Las operaciones de carga masiva no están conectadas a bulk-svc. No se utilizarán fixtures mock en este modo.
          </FeedbackAlert>
        )}
        <Outlet />
      </Stack>
    </BulkUploadProvider>
  );
}
