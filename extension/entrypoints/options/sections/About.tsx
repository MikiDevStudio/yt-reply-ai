import { Section } from '../Section';

const { version, name } = browser.runtime.getManifest();

export function About() {
  return (
    <>
      <Section title="About">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Extension</dt>
            <dd className="font-medium">{name}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-base-content/60">Version</dt>
            <dd className="font-medium">{version}</dd>
          </div>
        </dl>
      </Section>

      <Section title="What leaves your browser">
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

        <div className="card-actions">
          <a
            className="btn btn-sm"
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Manage keys on OpenRouter
          </a>
        </div>
      </Section>
    </>
  );
}
