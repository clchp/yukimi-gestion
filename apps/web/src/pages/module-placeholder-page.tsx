import { useLocation } from 'react-router';

export function ModulePlaceholderPage() {
  const location = useLocation();
  const moduleName = location.pathname.slice(1) || 'módulo';

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Módulo en construcción</span>
          <h1>{moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}</h1>
          <p>La ruta ya está protegida y preparada para implementar sus casos de uso.</p>
        </div>
      </header>
    </main>
  );
}
