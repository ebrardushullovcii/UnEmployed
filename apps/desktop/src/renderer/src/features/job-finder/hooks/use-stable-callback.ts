import { useCallback, useEffect, useRef } from "react";

/**
 * A callback whose identity never changes while always calling the newest
 * function it was given.
 *
 * This exists for memoised list rows. A row can only skip a re-render when
 * every prop it is handed is unchanged, and a handler written inline by a
 * parent — or rebuilt by `useCallback` because it closes over the list — is a
 * new value on every pass, which defeats the memo for every row at once. The
 * latest function is kept in a ref and invoked through one stable wrapper, so
 * the row's props stay equal and the handler still sees current state.
 *
 * Use it only for event handlers. It is deliberately not usable as a render
 * value or an effect dependency: the wrapper never changes, so nothing can
 * observe that the wrapped function did.
 */
export function useStableCallback<Args extends readonly unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);

  // Committed, not written during render: a render that is thrown away must
  // not be able to leave its handler behind as the live one.
  useEffect(() => {
    latest.current = callback;
  });

  return useCallback((...args: Args) => latest.current(...args), []);
}
