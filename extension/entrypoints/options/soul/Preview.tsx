import { useState } from 'react';
import { useGeneration } from '@/lib/use-generation';

/**
 * Sample comments to try the profile against, one per kind the rules cover.
 *
 * Ordinary comments, not caricatures: a profile that only works on a cartoon
 * troll tells the user nothing about the comments they actually get.
 */
const SAMPLES = [
  { kind: 'Praise', text: 'This finally made it click for me. Been stuck on this for weeks, thank you!' },
  { kind: 'Question', text: 'Does this still work if I only have the cheaper version of the tool?' },
  {
    kind: 'Criticism',
    text: 'The audio in the second half is way too quiet, had to crank my volume the whole time.',
  },
  { kind: 'Hostility', text: 'Absolute waste of ten minutes. How is this channel this big lol' },
] as const;

/**
 * Generate a reply to a sample comment with the profile as it stands.
 *
 * Goes through the same background port as a real reply, so this is the actual
 * output, not an approximation — including what it costs and how long it takes.
 * That also means it spends a request, which is why it never fires on its own.
 */
export function Preview() {
  const [sample, setSample] = useState<(typeof SAMPLES)[number]>(SAMPLES[0]);
  const { state, generate, cancel } = useGeneration();

  const busy = state.status === 'streaming';
  const text = state.status === 'streaming' || state.status === 'done' ? state.text : '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={`btn btn-sm ${sample.kind === option.kind ? 'btn-primary' : 'btn-outline'}`}
            disabled={busy}
            onClick={() => setSample(option)}
          >
            {option.kind}
          </button>
        ))}
      </div>

      <p className="rounded-box bg-base-200 px-3 py-2 text-sm text-base-content/70">
        <span className="font-medium">@viewer: </span>
        {sample.text}
      </p>

      {state.status === 'error' ? (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          {state.message}
        </div>
      ) : (
        text && (
          <p className="whitespace-pre-wrap rounded-box border border-base-300 p-3 text-sm">
            {text}
          </p>
        )
      )}

      <div className="card-actions items-center justify-between">
        <span className="text-xs text-base-content/50">
          {state.status === 'done' && state.usage
            ? `${state.usage.totalTokens} tokens — a real request, billed like any other`
            : 'Uses your account, same as a real reply.'}
        </span>

        {busy ? (
          <button type="button" className="btn btn-sm" onClick={cancel}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() =>
              generate({ commentText: sample.text, commentAuthor: '@viewer', isReply: false })
            }
          >
            {text ? 'Try again' : 'Preview a reply'}
          </button>
        )}
      </div>
    </div>
  );
}
