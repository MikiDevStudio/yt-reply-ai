import type { Browser } from '#imports';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GENERATE_PORT,
  type GenerateClientMessage,
  type GenerateServerMessage,
  type GenerationContext,
} from '@/lib/messaging';
import type { FailureFacts } from '@/lib/failure';
import type { TokenUsage } from '@/lib/openrouter/types';

/** Everything a `start` message carries besides the comment itself. */
export type GenerateOptions = Omit<
  Extract<GenerateClientMessage, { type: 'start' }>,
  'type' | 'context'
>;

export type GenerationState =
  | { status: 'idle' }
  | { status: 'streaming'; text: string }
  | { status: 'done'; text: string; usage?: TokenUsage; truncated?: boolean }
  /** `facts.partial` carries whatever streamed in before the failure. */
  | { status: 'error'; facts: FailureFacts };

/**
 * Drive one generation over a port to the background worker.
 *
 * A port rather than `sendMessage` because tokens arrive over time; keeping it
 * open also keeps the service worker from being torn down mid-answer.
 * Disconnecting cancels the request upstream, which is why every exit path here
 * disconnects rather than merely ignoring further messages.
 *
 * Shared by the injected popover and the soul preview on the options page, so
 * what the preview shows is produced by the same path as a real reply — a
 * preview built on a second, simpler code path would drift and start lying.
 */
export function useGeneration() {
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  const portRef = useRef<Browser.runtime.Port | null>(null);

  const disconnect = useCallback(() => {
    portRef.current?.disconnect();
    portRef.current = null;
  }, []);

  const generate = useCallback(
    (context: GenerationContext, options: GenerateOptions = {}) => {
      // Starting again while a request is in flight abandons the old one.
      disconnect();
      setState({ status: 'streaming', text: '' });

      const port = browser.runtime.connect({ name: GENERATE_PORT });
      portRef.current = port;

      port.onMessage.addListener((message: GenerateServerMessage) => {
        switch (message.type) {
          case 'delta':
            setState((current) =>
              current.status === 'streaming'
                ? { status: 'streaming', text: current.text + message.text }
                : current,
            );
            break;
          case 'done':
            setState({
              status: 'done',
              text: message.text,
              usage: message.usage,
              truncated: message.truncated,
            });
            disconnect();
            break;
          case 'error': {
            const { type, ...facts } = message;
            // Half an answer is still an answer worth editing, so a failure
            // after the first tokens keeps what arrived instead of clearing the
            // box and pretending the attempt produced nothing.
            setState((current) => ({
              status: 'error',
              facts:
                current.status === 'streaming' && current.text
                  ? { ...facts, partial: current.text }
                  : facts,
            }));
            disconnect();
            break;
          }
        }
      });

      // The worker can be torn down before it answers. Without this the UI
      // would sit on a spinner forever.
      port.onDisconnect.addListener(() => {
        portRef.current = null;
        setState((current) =>
          current.status === 'streaming'
            ? {
                status: 'error',
                facts: {
                  kind: 'interrupted',
                  ...(current.text ? { partial: current.text } : {}),
                },
              }
            : current,
        );
      });

      port.postMessage({ type: 'start', context, ...options });
    },
    [disconnect],
  );

  const cancel = useCallback(() => {
    disconnect();
    setState({ status: 'idle' });
  }, [disconnect]);

  useEffect(() => disconnect, [disconnect]);

  return { state, generate, cancel };
}
