import { mockCampaignRepository } from "../adapters/mockCampaignRepository";
import type { CampaignRepository } from "./campaignRepository";
export const campaignService: CampaignRepository = mockCampaignRepository;
