import { Suspense } from "react";
import { Text } from "@mantine/core";
import { useAuditRuntime } from "../services/AuditRuntimeContext";

export function AuditDataNotice() {
  const runtime = useAuditRuntime();
  const Tools = runtime.ReviewTools;
  return (
    <>
      {runtime.notice && (
        <Text
          size="sm"
          c="dimmed"
          style={{ lineHeight: "20px" }}
        >
          {runtime.notice}
        </Text>
      )}
      {Tools && (
        <Suspense fallback={null}>
          <Tools />
        </Suspense>
      )}
    </>
  );
}
