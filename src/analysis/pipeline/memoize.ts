function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v) as object | null;
  return proto === Object.prototype || proto === null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

interface MemoizedFn<TArgs extends unknown[], TResult> {
  (...args: TArgs): TResult;
  clear(): void;
}

export function memoizeStage<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
): MemoizedFn<TArgs, TResult> {
  let cachedArgs: TArgs | null = null;
  let cachedResult: TResult;

  const wrapped = ((...args: TArgs): TResult => {
    if (cachedArgs && cachedArgs.length === args.length) {
      let allEqual = true;
      for (let i = 0; i < args.length; i++) {
        if (!deepEqual(cachedArgs[i], args[i])) {
          allEqual = false;
          break;
        }
      }
      if (allEqual) return cachedResult;
    }
    cachedResult = fn(...args);
    cachedArgs = args;
    return cachedResult;
  }) as MemoizedFn<TArgs, TResult>;

  wrapped.clear = () => {
    cachedArgs = null;
  };
  return wrapped;
}
