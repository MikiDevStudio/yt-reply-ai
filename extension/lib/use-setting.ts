import { useEffect, useState } from 'react';

/**
 * The part of a WXT storage item this hook needs.
 *
 * Structural rather than the imported `WxtStorageItem`: the generic signature
 * carries a metadata parameter that every caller would have to spell out for
 * nothing.
 */
interface SettingItem<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
  watch(callback: (value: T) => void): () => void;
}

/**
 * Bind a stored setting to component state.
 *
 * Reads once on mount and then follows storage, so a change made in the popup
 * shows up on an open options page without a reload. Writes are optimistic —
 * the UI updates immediately and storage catches up — because a control that
 * lags behind the click feels broken.
 *
 * Returns `[value, setValue, loaded]`. The third element is not redundant with
 * `value === null`: a setting can legitimately *store* null, and "not read yet"
 * has to stay distinguishable from "read, and it is empty".
 */
export function useSetting<T>(item: SettingItem<T>): [T | null, (value: T) => void, boolean] {
  const [state, setState] = useState<{ value: T | null; loaded: boolean }>({
    value: null,
    loaded: false,
  });

  useEffect(() => {
    void item.getValue().then((value) => setState({ value, loaded: true }));
    return item.watch((value) => setState({ value, loaded: true }));
  }, [item]);

  return [
    state.value,
    (next: T) => {
      setState({ value: next, loaded: true });
      void item.setValue(next);
    },
    state.loaded,
  ];
}
