import {
  Playfair_Display, Inter, Cinzel, Cormorant_Garamond, Fredoka, Nunito, Special_Elite, Courier_Prime, Unbounded,
  Space_Grotesk, Pirata_One, EB_Garamond, Fraunces, Pacifico, Karla, Abril_Fatface, Libre_Baskerville,
  Caveat, Bebas_Neue, Oswald, JetBrains_Mono, Rozha_One, Marcellus,
} from 'next/font/google';

// Self-hosted at build time (no font requests while playing). Each world picks one pair in world.css.

const f0 = Playfair_Display({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-playfair' });
const f1 = Inter({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-inter' });
const f2 = Cinzel({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-cinzel' });
const f3 = Cormorant_Garamond({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '600'], variable: '--font-cormorant' });
const f4 = Fredoka({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-fredoka' });
const f5 = Nunito({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-nunito' });
const f6 = Special_Elite({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--font-special-elite' });
const f7 = Courier_Prime({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '700'], variable: '--font-courier-prime' });
const f8 = Unbounded({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-unbounded' });
const f9 = Space_Grotesk({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-space-grotesk' });
const f10 = Pirata_One({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--font-pirata' });
const f11 = EB_Garamond({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-eb-garamond' });
const f12 = Fraunces({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-fraunces' });
const f13 = Pacifico({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--font-pacifico' });
const f14 = Karla({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-karla' });
const f15 = Abril_Fatface({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--font-abril' });
const f16 = Libre_Baskerville({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '700'], variable: '--font-libre-baskerville' });

const f17 = Caveat({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-caveat' });
const f18 = Bebas_Neue({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--font-bebas' });
const f19 = Oswald({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-oswald' });
const f20 = JetBrains_Mono({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-jetbrains' });
const f21 = Rozha_One({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--font-rozha' });
const f22 = Marcellus({ subsets: ['latin'], display: 'swap', preload: false, weight: '400', variable: '--font-marcellus' });

const fonts = [f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21, f22];

export const worldFontVariables = fonts.map((f) => f.variable).join(' ');
