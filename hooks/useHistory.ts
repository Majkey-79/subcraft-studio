import { useState, useCallback } from "react";

export function useHistory<T>(initialState: T, maxHistory = 50) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initialState);
  const [future, setFuture] = useState<T[]>([]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const undo = useCallback(() => {
    if (!canUndo) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setPast(newPast);
    setFuture((prev) => [present, ...prev]);
    setPresent(previous);
  }, [canUndo, past, present]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    const next = future[0];
    const newFuture = future.slice(1);

    setPast((prev) => [...prev, present]);
    setPresent(next);
    setFuture(newFuture);
  }, [canRedo, future, present]);

  const set = useCallback(
    (newPresent: T | ((current: T) => T)) => {
      setPresent((current) => {
        const computedValue =
          typeof newPresent === "function"
            ? (newPresent as (c: T) => T)(current)
            : newPresent;

        if (computedValue === current) return current;

        setPast((prevPast) => {
          const updated = [...prevPast, current];
          if (updated.length > maxHistory) {
            return updated.slice(updated.length - maxHistory);
          }
          return updated;
        });

        setFuture([]);
        return computedValue;
      });
    },
    [maxHistory]
  );

  // Vynulování historie při nahrání nového souboru / vyčištění
  const reset = useCallback((newState: T) => {
    setPast([]);
    setPresent(newState);
    setFuture([]);
  }, []);

  return {
    state: present,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  };
}