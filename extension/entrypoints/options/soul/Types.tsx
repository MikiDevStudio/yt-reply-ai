import { Building2, Clapperboard, FaceGrinning, GraduationCap, type LucideIcon } from 'lucide-react';
import { SOUL_TYPES, type SoulType, type SoulTypeId } from '@/lib/soul';

/**
 * Icons live here rather than in `lib/soul.ts`: that module is plain
 * TypeScript, and a `LucideIcon` import there would drag React into the domain
 * layer for the sake of a picture.
 */
const ICONS: Record<SoulTypeId, LucideIcon> = {
  creator: Clapperboard,
  expert: GraduationCap,
  brand: Building2,
  comedian: FaceGrinning,
};

interface TypesProps {
  /** The type the profile matches right now, or null for none. */
  selected: SoulTypeId | null;
  onPick: (type: SoulType) => void;
}

/**
 * The four starting points, as a row of cards.
 *
 * Each card carries a hand-written reply rather than a generated one, shown
 * under the selected card only. The difference between Expert and Brand has to
 * be legible before the click, not after ten real comments — and a fixed string
 * answers that for no requests and promises nothing it cannot keep.
 */
export function Types({ selected, onPick }: TypesProps) {
  const sample = SOUL_TYPES.find((type) => type.id === selected)?.sample;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {SOUL_TYPES.map((type) => {
          const Icon = ICONS[type.id];
          const active = type.id === selected;

          return (
            <button
              key={type.id}
              type="button"
              aria-pressed={active}
              className={`flex cursor-pointer flex-col items-center gap-1 border p-3 text-center transition-colors ${
                active ? 'border-accent-line bg-accent-soft' : 'border-line hover:border-line-hi'
              }`}
              onClick={() => onPick(type)}
            >
              <Icon aria-hidden className={`size-5 ${active ? 'text-primary' : ''}`} />
              <span className="text-sm font-medium">{type.name}</span>
              <span className="text-xs text-base-content/60">{type.description}</span>
            </button>
          );
        })}
      </div>

      {sample && (
        <p className="rounded-control bg-surface-hi px-3 py-2 text-sm">
          <span className="text-base-content/50">Sounds like: </span>
          {sample}
        </p>
      )}
    </div>
  );
}
