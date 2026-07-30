import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth-context';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <div className="screen-center">Verificando sesión…</div>;
  }

  if (!auth.session) {
    return <Navigate to="/iniciar-sesion" replace state={{ from: location.pathname }} />;
  }

  if (!auth.currentUser) {
    return (
      <main className="screen-center">
        <section className="message-card">
          <span className="eyebrow">Acceso pendiente</span>
          <h1>Tu cuenta existe, pero aún no está habilitada</h1>
          <p>
            {auth.accessError ??
              'Una administradora debe activar tu perfil y asignarte el rol ADMIN.'}
          </p>
          <button className="button button-secondary" onClick={() => void auth.signOut()}>
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
