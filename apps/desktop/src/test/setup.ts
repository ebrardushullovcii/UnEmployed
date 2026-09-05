type StorageName = "localStorage" | "sessionStorage";

function createInMemoryStorage() {
  const values = new Map<string, string>();
  return {
    get length(): number {
      return values.size;
    },
    key(index: number): string | null {
      return Array.from(values.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      const normalized = String(key);
      return values.get(normalized) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(String(key), String(value));
    },
    removeItem(key: string): void {
      values.delete(String(key));
    },
    clear(): void {
      values.clear();
    },
  };
}

function hasUsableStorage(name: StorageName): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (!descriptor) {
    return false;
  }
  if ("value" in descriptor) {
    return Boolean(descriptor.value);
  }
  try {
    return Boolean(descriptor.get?.call(globalThis));
  } catch {
    return false;
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (!hasUsableStorage(name)) {
    Object.defineProperty(globalThis, name, {
      value: createInMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
