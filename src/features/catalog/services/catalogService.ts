import type { CatalogRepository } from "./catalogRepository";
import { getCatalogServices } from "./catalogServices";

// Facade for Catalog operations decoupled from static mock imports.
// In React components and hooks, prefer `useCatalogServices()`.
export const catalogService: CatalogRepository = {
  list: (q, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.list(q, sc, sig),
  getById: (id, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.getById(id, sc, sig),
  create: (p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.create(p, sc, sig),
  update: (id, p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.update(id, p, sc, sig),
  activate: (id, p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.activate(id, p, sc, sig),
  deactivate: (id, p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.deactivate(id, p, sc, sig),
  reactivate: (id, p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.reactivate(id, p, sc, sig),
  getPreparation: (id, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.getPreparation(id, sc, sig),
  retryPreparation: (id, p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.retryPreparation(id, p, sc, sig),
  listVariants: (id, q, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.listVariants(id, q, sc, sig),
  getVariantById: (pid, vid, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.getVariantById(pid, vid, sc, sig),
  createVariant: (pid, p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.createVariant(pid, p, sc, sig),
  updateVariant: (pid, vid, p, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.updateVariant(pid, vid, p, sc, sig),
  activateVariant: (pid, vid, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.activateVariant(pid, vid, sc, sig),
  deactivateVariant: (pid, vid, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.deactivateVariant(pid, vid, sc, sig),
  reactivateVariant: (pid, vid, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.reactivateVariant(pid, vid, sc, sig),
  retryVariantPreparation: (pid, vid, sc, sig) =>
    getCatalogServices(
      (import.meta.env.VITE_DATA_MODE as "mock" | "api" | undefined) ??
        (import.meta.env.DEV ? "mock" : "api"),
    ).catalog.retryVariantPreparation(pid, vid, sc, sig),
};
