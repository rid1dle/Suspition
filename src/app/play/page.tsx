import type { Viewport } from 'next';
import { PlayApp } from './play-app';

export const metadata = { title: 'Suspition' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#141217' };

export default function PlayPage() {
  return <PlayApp />;
}
