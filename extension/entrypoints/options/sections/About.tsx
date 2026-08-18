import { CoffeeButton } from '@/components/CoffeeButton';
import { GHOST, SECONDARY } from '@/components/ui';
import { CONTACT_URL, ISSUES_URL } from '@/lib/feedback';
import { NUDGE_EVERY } from '@/lib/replies';
import { supportNudges } from '@/lib/settings';
import { useReplies } from '@/lib/use-replies';
import { useSetting } from '@/lib/use-setting';
import { Section } from '../Section';

const { version, name } = browser.runtime.getManifest();

export function About() {
  const replies = useReplies();
  const [nudges, setNudges] = useSetting(supportNudges);

  return (
    <>
      <Section n={1} title="About">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Extension</dt>
            <dd className="font-medium">{name}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Version</dt>
            <dd className="font-mono">{version}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Replies written</dt>
            <dd className="font-mono">{replies ? replies.total : '…'}</dd>
          </div>
        </dl>
      </Section>

      <Section n={2} title="What leaves your browser">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-base-content/70">
          <li>
            The comment you are answering, your soul profile, and — depending on the context
            level — the video title, channel and description go to OpenRouter, and from there to
            the model you picked.
          </li>
          <li>
            Your API key is stored on this device only. It never reaches a web page, including
            YouTube: only the background worker can read it.
          </li>
          <li>
            Nothing is posted for you. The generated text is put in YouTube's reply box and
            waits for you to press their button.
          </li>
        </ul>

        <div className="flex flex-wrap gap-2">
          <a
            className={SECONDARY}
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Manage keys on OpenRouter
          </a>
        </div>
      </Section>

      {/* The donation block, and the whole of the product's ask (#36). There is
          no cap to lift and nothing to unlock, so this is the only sentence in
          the extension that mentions money at all — which is exactly why it is
          allowed to be a real button rather than a line of grey text. */}
      <Section
        n={3}
        title="Support this extension"
        description="Free, unlimited, no account, and it runs on your own key — so nobody is billed for what you write. If it saves you an evening of typing, a tea is how it stays that way."
      >
        <CoffeeButton className="self-start" />

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm mt-0.5"
            checked={nudges ?? true}
            disabled={nudges === null}
            onChange={(event) => setNudges(event.target.checked)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Say thank you every {NUDGE_EVERY} replies</span>
            <span className="text-base-content/70">
              A card over YouTube, once every {NUDGE_EVERY} replies, with this same button and a
              way to tell me what is wrong. Off means never — including from the card itself.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a className={GHOST} href={ISSUES_URL} target="_blank" rel="noreferrer">
            Report a problem
          </a>
          <a className={GHOST} href={CONTACT_URL}>
            Email me
          </a>
        </div>
      </Section>
    </>
  );
}
