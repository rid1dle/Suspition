import { MusicLab } from './music-lab';

export const metadata = { title: 'Music lab · Suspition' };

export default function MusicLabPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <MusicLab />
    </main>
  );
}
