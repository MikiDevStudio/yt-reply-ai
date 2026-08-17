import { useEffect, useState } from 'react';
import { type QuotaState, readQuota, watchQuota } from './quota';

/**
 * The day's reply count, bound to component state.
 *
 * Follows storage rather than reading once: the counter moves in the background
 * worker while the popup, the settings page and the popover are all open, and a
 * number that lags behind the reply the user just generated is a number nobody
 * trusts. `null` until the first read lands — "not read yet" has to stay
 * distinguishable from "nothing used today".
 *
 * Runs in a content script too. `storage.sync` is exposed to content scripts by
 * default, unlike `session`, so the popover can show what is left without
 * asking the worker for it.
 */
export function useQuota(): QuotaState | null {
  const [state, setState] = useState<QuotaState | null>(null);

  useEffect(() => {
    void readQuota().then(setState);
    return watchQuota(setState);
  }, []);

  return state;
}
