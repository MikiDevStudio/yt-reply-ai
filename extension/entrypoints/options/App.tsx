import { NavLink, Outlet } from 'react-router';

const SECTIONS = [
  { to: '/account', label: 'Account' },
  { to: '/soul', label: 'Soul profile' },
  { to: '/generation', label: 'Generation' },
  { to: '/models', label: 'Models' },
  { to: '/pro', label: 'Pro' },
  { to: '/about', label: 'About' },
] as const;

/**
 * Settings shell: sidebar on the left, the current section on the right.
 *
 * A full tab rather than Chrome's embedded options dialog — see the meta tag in
 * index.html. The soul editor alone needs more room than that box has.
 */
export function App() {
  return (
    <div className="flex min-h-screen bg-base-100 text-base-content">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-line bg-base-200 p-4">
        <header>
          <h1 className="font-semibold">Reply AI</h1>
          <p className="text-xs text-base-content/60">YouTube comment assistant</p>
        </header>

        <ul className="menu w-full gap-1 p-0">
          {SECTIONS.map(({ to, label }) => (
            <li key={to}>
              <NavLink to={to} className={({ isActive }) => (isActive ? 'menu-active' : '')}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
