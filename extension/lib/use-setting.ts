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
 * the UI updates immediately and storage catches up — because a radio button
 * that lags behind the click feels broken.
 *
 * The value is `null` until the first read resolves. Callers render a skeleton
 * or a disabled control for that frame rather than guessing a default that may
 * differ from what is stored.
 */
export function useSetting<T>(item: SettingItem<T>): [T | null, (value: T) => void] {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    void item.getValue().then(setValue);
    return item.watch(setValue);
  }, [item]);

  return [
    value,
    (next: T) => {
      setValue(next);
      void item.setValue(next);
    },
  ];
}
