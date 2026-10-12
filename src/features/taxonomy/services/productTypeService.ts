import { mockProductTypeAdapter } from "../adapters/mockProductTypeAdapter";
import type { ProductTypeRepository } from "./productTypeRepository";

export const productTypeService: ProductTypeRepository = mockProductTypeAdapter;
