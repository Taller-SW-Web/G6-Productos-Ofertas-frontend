import { mockBrandAdapter } from "../adapters/mockBrandAdapter";
import type { BrandRepository } from "./brandRepository";

export const brandService: BrandRepository = mockBrandAdapter;
