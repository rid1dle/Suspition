'use client';

// Pinned to the top of every tab while it is this player's turn, so nobody has to watch the table to know.
export function CallBanner({ text, onShow }: { text: string | null; onShow: () => void }) {
  if (!text) return null;
  return (
    <button role="alert" onClick={onShow}
      className="sticky top-0 z-40 w-full animate-pulse bg-primary px-4 py-3 text-left text-lg font-semibold text-primary-foreground shadow-lg motion-reduce:animate-none">
      {text}
    </button>
  );
}
