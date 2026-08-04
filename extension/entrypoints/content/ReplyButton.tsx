interface ReplyButtonProps {
  onOpen: () => void;
}

/**
 * The button injected into a comment's toolbar.
 *
 * Sizing and colour follow YouTube's own toolbar buttons so it reads as part of
 * the page rather than an add-on. YouTube exposes its palette as CSS custom
 * properties, and custom properties pierce the shadow root — so we can pick up
 * the user's light/dark theme for free.
 */
export function ReplyButton({ onOpen }: ReplyButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="ml-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--yt-spec-badge-chip-background,rgba(255,255,255,0.1))] px-3 text-sm font-medium text-[var(--yt-spec-text-primary,#f1f1f1)] transition-opacity hover:opacity-80"
    >
      <SparkIcon />
      AI reply
    </button>
  );
}

function SparkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4 fill-current"
    >
      <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm6.5 10l.95 2.8 2.8.95-2.8.95-.95 2.8-.95-2.8-2.8-.95 2.8-.95.95-2.8z" />
    </svg>
  );
}
