import { createContext } from "react";
import type { G7Session } from "../../features/promotions/adapters/g7Session";

// One session instance for every feature; the legacy Promotions name is an alias.
export const AuthSessionContext = createContext<G7Session | null>(null);
