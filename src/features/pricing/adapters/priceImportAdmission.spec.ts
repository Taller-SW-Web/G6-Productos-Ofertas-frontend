import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createMemoryStorage } from "../../../../tests/fixtures/h4Controlled";
import { createPriceImportAdmission } from "./priceImportAdmission";

const storageKey = "g6:pricing:import:v1:actor";
const oldKey = "12345678-1234-4234-8234-123456789abc";
const batchId = "12345678-1234-4234-8234-123456789abd";
const csv = "sku\nSKU-A";
const oldIntent = {
  key: oldKey,
  digest: createHash("sha256").update(csv).digest("hex"),
  allowPartial: false,
};
const input = { file: new File([csv], "precios.csv"), allowPartial: false };

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
  vi.stubGlobal("navigator", {
    locks: { request: async (name: string, _options: LockOptions, handle: LockGrantedCallback<unknown>) =>
      handle({ name, mode: "exclusive" }) },
  });
});

afterEach(() => vi.unstubAllGlobals());

it("conserva el recibo anterior y asigna una clave distinta para otra intención del mismo CSV", async () => {
  localStorage.setItem(storageKey, JSON.stringify({ ...oldIntent, batchId }));
  const send = vi.fn().mockResolvedValue(batchId);
  const admission = createPriceImportAdmission(() => "actor", send);
  expect(admission.recovery()).toEqual({ lastBatchId: batchId });
  expect(send).not.toHaveBeenCalled();
  await expect(admission.submit(input, new AbortController().signal)).resolves.toBe(batchId);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[1]).not.toBe(oldKey);
});

it("recupera un intento anterior solo mediante su clave y protege su descarte de otra identidad", async () => {
  localStorage.setItem(storageKey, JSON.stringify(oldIntent));
  let actor = "actor";
  const send = vi.fn().mockResolvedValue(batchId);
  const admission = createPriceImportAdmission(() => actor, send);
  const signal = new AbortController().signal;
  expect(admission.recovery()?.pending?.key).toBe(oldKey);
  await expect(admission.submit(input, signal)).rejects.toMatchObject({ kind: "conflict" });
  actor = "other";
  await expect(admission.discard(oldKey, signal)).rejects.toMatchObject({ kind: "conflict" });
  expect(send).not.toHaveBeenCalled();
  actor = "actor";
  await expect(admission.submit(input, signal, oldKey)).resolves.toBe(batchId);
  expect(send).toHaveBeenCalledWith(input, oldKey, signal);
});
