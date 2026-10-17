import { GamesList } from './games-list';

export const metadata = { title: 'Saved games · Suspition' };

export default function GamesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <GamesList />
    </main>
  );
}
