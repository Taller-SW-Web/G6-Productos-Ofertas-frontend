// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ solicitar: vi.fn() }));
vi.mock("../services/categoryService", () => ({ categoryService: { solicitarBaja: mock.solicitar } }));
vi.mock("../services/brandService", () => ({ brandService: { solicitarBaja: mock.solicitar } }));
import { useSolicitarBaja } from "../hooks/useSolicitarBaja";
import { useSolicitarBajaMarca } from "../hooks/useSolicitarBajaMarca";

afterEach(() => { cleanup(); mock.solicitar.mockReset(); });

it.each([useSolicitarBaja, useSolicitarBajaMarca])("no duplica una solicitud aún en vuelo", (useHook) => {
  mock.solicitar.mockReturnValue(new Promise(() => {}));
  const hook = renderHook(() => useHook("id"));
  act(() => { hook.result.current.solicitar(); hook.result.current.solicitar(); });
  expect(mock.solicitar).toHaveBeenCalledTimes(1);
});
