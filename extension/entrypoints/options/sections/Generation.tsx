import { useSetting } from '@/lib/use-setting';
import { type ContextLevel, contextLevel } from '@/lib/settings';
import { Section } from '../Section';

/**
 * What each context level sends, in the user's terms.
 *
 * Spelled out rather than hidden behind "smart context": the levels trade money
 * for reply quality, and that is the user's call to make.
 */
const CONTEXT_LEVELS: ReadonlyArray<{ level: ContextLevel; label: string; hint: string }> = [
  { level: 0, label: 'Comment only', hint: '~300 tokens' },
  { level: 1, label: '+ video title, channel, thread', hint: '~500 tokens' },
  { level: 2, label: '+ video description', hint: '~800 tokens, read once per video' },
];

export function Generation() {
  const [level, setLevel] = useSetting(contextLevel);

  // Auto-generation used to live here. It moved into the popover itself (#30):
  // whether opening a comment should spend a request is decided while looking
  // at the comment, not on a settings page in another tab.
  return (
    <Section
      n={1}
      title="Context sent with each comment"
      description="More context means better replies and a bigger bill. The description is read once per video and reused for every comment on it."
    >
      <div className="flex flex-col gap-2">
        {CONTEXT_LEVELS.map(({ level: value, label, hint }) => (
          <label key={value} className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name="context-level"
              className="radio radio-sm"
              checked={level === value}
              disabled={level === null}
              onChange={() => setLevel(value)}
            />
            <span className="font-medium">{label}</span>
            {/* A token count is a number, and numbers are mono. */}
            <span className="ml-auto font-mono text-[11px] text-base-content/50">{hint}</span>
          </label>
        ))}
      </div>
    </Section>
  );
}
