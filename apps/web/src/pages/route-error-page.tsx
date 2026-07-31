import { ArrowLeft, Home } from 'lucide-react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';

export function RouteErrorPage() {
  const navigate = useNavigate();
  const error = useRouteError();
  const notFound = !error || (isRouteErrorResponse(error) && error.status === 404);

  return (
    <main className="route-error-page">
      <section className="panel route-error-card" role="alert">
        <span className="route-error-code">{notFound ? '404' : 'Error'}</span>
        <h1>{notFound ? 'No encontramos esta página' : 'No se pudo abrir esta sección'}</h1>
        <p>
          {notFound
            ? 'La dirección no existe o el registro ya no está disponible.'
            : 'Ocurrió un problema inesperado. Puedes volver a la pantalla anterior sin perder el acceso al sistema.'}
        </p>
        <div className="route-error-actions">
          <button className="button button-secondary" type="button" onClick={() => navigate(-1)}>
            <ArrowLeft size={17} /> Volver
          </button>
          <button className="button button-primary" type="button" onClick={() => navigate('/')}>
            <Home size={17} /> Ir al inicio
          </button>
        </div>
      </section>
    </main>
  );
}
