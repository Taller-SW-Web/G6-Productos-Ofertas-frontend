export type LoopbackProxyStats = {
  allowedRequests: number;
  deniedRequests: number;
  upstreamFailures: number;
};

export type LoopbackOnlyProxy = {
  url: string;
  stats(): LoopbackProxyStats;
  close(): Promise<void>;
};

export function isAllowedLoopbackOrigin(value: string, allowedOrigins: string[]): boolean;
export function startLoopbackOnlyProxy(allowedOrigins: string[]): Promise<LoopbackOnlyProxy>;
