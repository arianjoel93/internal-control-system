import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function AppLayout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  if (isAdmin) {
    return (
      <div className="app-shell admin-app-shell">
        <main>
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Ir al inicio">
          <img className="brand-logo" src="/tectronic-logo.png" alt="Tectronic" />
          <span>
            <strong>Corporación Tectronic</strong>
            <small>Soportes a equipos y Programación</small>
          </span>
        </NavLink>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
