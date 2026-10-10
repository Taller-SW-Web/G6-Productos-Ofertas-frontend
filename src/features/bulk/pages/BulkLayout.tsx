import { Outlet } from "react-router-dom";
import { BulkUploadProvider } from "../context/BulkUploadContext";

export function BulkLayout() {
  return (
    <BulkUploadProvider>
      <Outlet />
    </BulkUploadProvider>
  );
}
