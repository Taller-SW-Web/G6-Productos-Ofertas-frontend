// Set before importing domain repositories; never persisted as an auth marker.
let identity: string | null = null;
export function setMockIdentity(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Identidad no válida.");
  if (identity && identity !== value) throw new Error("Reinicia la aplicación al cambiar de identidad.");
  identity = value;
}
export function identityStorageKey(key: string): string {
  return identity ? `${key.replace(/:$/, "")}:user:${identity}:` : key;
}
