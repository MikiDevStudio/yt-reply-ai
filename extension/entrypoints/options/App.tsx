import { NavLink, Outlet } from 'react-router';
import { FOCUS } from '@/components/ui';

const SECTIONS = [
  { to: '/account', label: 'Account' },
  { to: '/soul', label: 'Soul profile' },
  { to: '/presets', label: 'Reply presets' },
  { to: '/generation', label: 'Generation' },
  { to: '/models', label: 'Models' },
  { to: '/licence', label: 'Licence' },
  { to: '/pro', label: 'Pro' },
  { to: '/about', label: 'About' },
] as const;

/** Nav item: a left rule that only the current section fills in. */
function itemClass(isActive: boolean) {
  const state = isActive
    ? 'border-accent bg-accent-soft text-accent'
    : 'border-transparent text-base-content/70 hover:bg-base-content/4 hover:text-base-content';

  // 2px rule + 14px padding puts the label at the sidebar's own 16px gutter, so
  // an inactive item lines up with the product name above it.
  return `flex border-l-2 px-3.5 py-2 text-sm transition-colors duration-150 ${state} ${FOCUS}`;
}

/**
 * Settings shell: sidebar on the left, the current section on the right.
 *
 * A full tab rather than Chrome's embedded options dialog — see the meta tag in
 * index.html. The soul editor alone needs more room than that box has.
 */
export function App() {
  return (
    <div className="flex min-h-screen bg-base-100 text-base-content">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-line bg-base-200 p-4">
        <header className="flex flex-col gap-0.5">
          <h1 className="font-semibold tracking-[-0.01em]">Reply AI</h1>
          <p className="text-xs text-base-content/45">YouTube comment assistant</p>
        </header>

        {/* Sharp, flush items rather than daisyUI's `menu`, which rounds them
            and pads them off the sidebar's own edge. */}
        <nav>
          <ul className="-mx-4 flex flex-col">
            {SECTIONS.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => itemClass(isActive)}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
