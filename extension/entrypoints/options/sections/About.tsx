import { CoffeeButton } from '@/components/CoffeeButton';
import { GHOST, SECONDARY } from '@/components/ui';
import { CONTACT_URL, ISSUES_URL } from '@/lib/feedback';
import { waitlistUrl } from '@/lib/pro';
import { NUDGE_EVERY } from '@/lib/replies';
import { useReplies } from '@/lib/use-replies';
import { Section } from '../Section';

const { version, name } = browser.runtime.getManifest();

export function About() {
  const replies = useReplies();

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

        {/* Stated plainly rather than offered as a switch. The card is what the
            free version costs, so a checkbox here would be a checkbox for
            paying nothing — and someone who finds it in the way deserves to
            read why it is there rather than only how to be rid of it. */}
        <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <span className="font-medium">Once every {NUDGE_EVERY} replies, a card appears</span>
          <p className="text-base-content/70">
            Over the comment you are answering, as the reply lands: the count, one question, this
            same button, and a way to tell me what is broken. It reports nothing and it closes with
            Escape. It is the only thing this extension ever asks for — there is no cap to lift, no
            metered anything, and no second ask anywhere else. A paid plan will switch it off.
          </p>
          <a
            className="link text-sm text-base-content/50"
            href={waitlistUrl('settings')}
            target="_blank"
            rel="noreferrer"
          >
            What a paid plan would add
          </a>
        </div>

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
