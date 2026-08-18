import { useEffect, useState } from 'react';
import { type ReplyCount, readReplies, watchReplies } from './replies';

/**
 * How many replies this copy has written, bound to component state.
 *
 * Follows storage rather than reading once: the counter moves in the background
 * worker while the popup, the settings page and the popover are all open, and a
 * number that lags behind the reply the user just generated is a number nobody
 * trusts. `null` until the first read lands — "not read yet" has to stay
 * distinguishable from "nothing written today".
 *
 * Runs in a content script too. `storage.sync` is exposed to content scripts by
 * default, unlike `session`, so an injected surface can show the count without
 * asking the worker for it.
 */
export function useReplies(): ReplyCount | null {
  const [count, setCount] = useState<ReplyCount | null>(null);

  useEffect(() => {
    void readReplies().then(setCount);
    return watchReplies(setCount);
  }, []);

  return count;
}
