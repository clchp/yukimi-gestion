import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../features/auth/auth-context';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (auth.currentUser) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.signIn(email.trim(), password);
      const state = location.state as LocationState | null;
      navigate(state?.from ?? '/', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-visual-panel">
        <div className="login-ambient login-ambient-one" />
        <div className="login-ambient login-ambient-two" />
        <div className="login-brand">
          <span className="brand-mark brand-mark-large">雪</span>
          <div>
            <strong>Yukimi</strong>
            <small>Gestión administrativa</small>
          </div>
        </div>
        <div className="login-message">
          <span className="login-kicker">
            <Sparkles size={15} /> Orden para crecer
          </span>
          <h1>Tu negocio, claro y bajo control.</h1>
          <p>
            Ventas, productos, importaciones y finanzas conectados en una experiencia simple para
            Lorena y Camila.
          </p>
        </div>
        <div className="login-preview-card preview-main">
          <div className="preview-card-head">
            <span>Resumen del día</span>
            <b>S/.1,248.70</b>
          </div>
          <div className="mini-bars">
            {[42, 70, 54, 88, 65, 96, 78].map((value, index) => (
              <i key={index} style={{ height: `${value}%` }} />
            ))}
          </div>
        </div>
        <div className="login-preview-card preview-float">
          <ShieldCheck size={18} />
          <div>
            <strong>Auditoría activa</strong>
            <small>Cada cambio queda registrado</small>
          </div>
        </div>
        <div className="login-security">
          <ShieldCheck size={17} />
          <span>Acceso privado para administradoras autorizadas</span>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-mobile-brand">
            <span className="brand-mark">雪</span>
            <div>
              <strong>Yukimi</strong>
              <small>Gestión</small>
            </div>
          </div>
          <div className="login-heading">
            <span className="eyebrow">Bienvenida</span>
            <h2>Inicia sesión</h2>
            <p>Ingresa con tu cuenta administrativa para continuar.</p>
          </div>
          <label className="field input-with-icon">
            <span>Correo electrónico</span>
            <div>
              <Mail size={18} />
              <input
                autoComplete="email"
                inputMode="email"
                required
                type="email"
                placeholder="nombre@correo.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>
          <label className="field input-with-icon">
            <span>Contraseña</span>
            <div>
              <LockKeyhole size={18} />
              <input
                autoComplete="current-password"
                minLength={8}
                required
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <div className="login-options">
            <label>
              <input type="checkbox" /> Mantener sesión iniciada
            </label>
            <button type="button">¿Olvidaste tu contraseña?</button>
          </div>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <button
            className="button button-primary button-full login-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
          <p className="login-help">
            ¿Problemas para ingresar? Comunícate con la administradora del proyecto.
          </p>
        </form>
      </section>
    </main>
  );
}
