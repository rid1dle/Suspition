import { DicesIcon } from 'lucide-react';
import { ART_STYLES } from '@/lib/art-styles';

const sample = (id: string) => `/art-styles/${id}.svg`;

// The art style is chosen by looking: each option is a real picture the GM drew in that style.
export function ArtStylePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const tile = (id: string, name: string, art: React.ReactNode) => (
    <button key={id} type="button" aria-pressed={value === id} onClick={() => onPick(id)}
      className={`flex flex-col gap-1.5 rounded-xl p-1.5 text-left text-sm transition ${value === id ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted/60'}`}>
      <span className="block aspect-[2/1] overflow-hidden rounded-lg bg-muted">{art}</span>
      <span className="px-1">{name}</span>
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {ART_STYLES.map((s) => tile(s.id, s.name, <img src={sample(s.id)} alt="" className="size-full object-cover" />))}
      {tile('random', 'Random', (
        <span className="relative block size-full">
          <img src={sample(ART_STYLES[3].id)} alt="" className="size-full object-cover blur-sm" />
          <DicesIcon className="absolute inset-0 m-auto size-8 text-foreground drop-shadow" />
        </span>
      ))}
      {tile('mix', 'Mix', (
        <span className="grid size-full grid-cols-2 grid-rows-2">
          {ART_STYLES.slice(1, 5).map((s) => <img key={s.id} src={sample(s.id)} alt="" className="size-full object-cover" />)}
        </span>
      ))}
    </div>
  );
}
