import type { ReactNode } from 'react';
import './globals.css';
import './world.css';
import { worldFontVariables } from '@/components/world/fonts';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = { title: 'Suspition' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable, worldFontVariables)}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
