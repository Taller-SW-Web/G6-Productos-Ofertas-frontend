import { mockSeoAdapter } from "../adapters/mockSeoAdapter";
import type { SeoRepository } from "./seoRepository";

export const seoService: SeoRepository = mockSeoAdapter;
