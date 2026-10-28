import { useCallback, useEffect, useRef } from "react";
import { DEFAULT_DEBOUNCE_TIME } from "../constants/default-debounce-time.const";

// oxlint-disable-next-line typescript/no-explicit-any
type VoidFunction = (...args: any[]) => void;

export function useDebouncedCallback<T extends VoidFunction>(
  callback: T,
  delay = DEFAULT_DEBOUNCE_TIME
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // Cancel a pending call if the component unmounts.
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const debouncedFunction = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );

  return debouncedFunction;
}
