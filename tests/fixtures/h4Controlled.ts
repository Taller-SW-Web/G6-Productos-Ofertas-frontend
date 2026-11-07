export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(String(key)) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(String(key)); },
    setItem(key, value) { values.set(String(key), String(value)); },
  };
  return new Proxy(storage, {
    ownKeys(target) { return [...Reflect.ownKeys(target), ...values.keys()]; },
    getOwnPropertyDescriptor(target, property) {
      if (typeof property === "string" && values.has(property)) return { configurable: true, enumerable: true, writable: false, value: values.get(property) };
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
}

export function createRejectingStorage(): Storage {
  const fail = (): never => { throw new DOMException("Storage is unavailable", "SecurityError"); };
  return {
    get length() { return fail(); },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

export const fakeOwnerA = "g7-h4-owner-a";
export const fakeOwnerB = "g7-h4-owner-b";
