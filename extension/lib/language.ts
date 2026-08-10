/**
 * Work out what language a comment is in, as a name a model understands.
 *
 * Detection is Chrome's own (CLD, `chrome.i18n.detectLanguage`, since Chrome 47,
 * no permission required), so there is no library to ship and no service to
 * call. The code it returns is turned into an English language name through
 * `Intl.DisplayNames` rather than a table of our own: `ru` → `Russian`.
 *
 * A name beats a code in the prompt. Models answer "write in Russian" reliably;
 * "write in ru" invites a shrug.
 */

/** Below this the guess is not worth acting on — mixed-language comments sit here. */
const MIN_CONFIDENCE = 60;

export async function detectLanguage(text: string): Promise<string | null> {
  if (text.trim().length === 0) return null;

  try {
    const result = await browser.i18n.detectLanguage(text);
    const best = result.languages?.[0];

    // `und` is CLD's "no idea". Together with `isReliable` it covers the emoji-
    // only and three-word comments that make up a good part of any comment
    // section, where guessing would be worse than saying nothing.
    if (!result.isReliable || !best || best.language === 'und') return null;
    if (best.percentage < MIN_CONFIDENCE) return null;

    return languageName(best.language);
  } catch {
    // Detection is a convenience. Losing it means the prompt falls back to
    // "answer in the language of the comment", which is where we started.
    return null;
  }
}

function languageName(code: string): string | null {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? null;
  } catch {
    return null;
  }
}
