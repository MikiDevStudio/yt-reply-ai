interface ReplyButtonProps {
  onOpen: () => void;
}

/**
 * The button injected into a comment's toolbar.
 *
 * This one deliberately does *not* use our theme colours: it has to read as one
 * of YouTube's own toolbar buttons, so it borrows YouTube's CSS custom
 * properties. Those pierce the shadow root, which means the button tracks the
 * user's YouTube theme for free. Everything we render on our own surfaces uses
 * daisyUI semantic colours instead.
 */
export function ReplyButton({ onOpen }: ReplyButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="btn btn-sm gap-1.5 border-0 bg-[var(--yt-spec-badge-chip-background,rgba(255,255,255,0.1))] text-[var(--yt-spec-text-primary,#f1f1f1)] shadow-none"
    >
      <SparkIcon />
      AI reply
    </button>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
      <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm6.5 10l.95 2.8 2.8.95-2.8.95-.95 2.8-.95-2.8-2.8-.95 2.8-.95.95-2.8z" />
    </svg>
  );
}
