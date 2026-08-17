/**
 * A key for one comment, derived from its content.
 *
 * Not the element: both pages recycle comment nodes as you scroll, so a node
 * identity outlives nothing. Not an id attribute either — the rendered markup
 * carries none we can rely on across their A/B variants, and a key that is
 * sometimes absent is worse than a key that is always derived.
 *
 * It keys two things. In the content script it is the attempt stack for one
 * comment; in the background it is the unit the daily quota counts, which is
 * why the function lives here rather than beside the DOM code that first needed
 * it: the worker derives the key from the same author and text the content
 * script sent, so the two cannot disagree about which comment is being charged.
 *
 * Author plus text is unique enough for both. Two identical comments by the
 * same person share a stack and a charge — not a failure worth extra machinery,
 * and the failure mode is a free generation rather than a lost one.
 */
export function commentKey(author: string, text: string): string {
  const source = `${author}\n${text}`;

  // FNV-1a. Short, stable, and no crypto import for something that only has to
  // avoid collisions inside one page and one day's worth of replies.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}
