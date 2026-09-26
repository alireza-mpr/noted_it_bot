declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, callback: () => R): R;
    getStore(): T | undefined;
  }
}

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
