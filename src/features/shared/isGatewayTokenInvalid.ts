// Classify the contract error without consuming the response the caller reports.
export async function isGatewayTokenInvalid(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  const problem: unknown = await response.clone().json().catch(() => null);
  return problem !== null && typeof problem === "object" &&
    "code" in problem && problem.code === "TOKEN_INVALIDO";
}
