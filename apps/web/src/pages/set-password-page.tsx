import { CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../app/supabase';

export function SetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) { setError(updateError.message); return; }
    navigate('/', { replace: true });
  }

  return (
    <main className="password-layout">
      <form className="login-card password-card" onSubmit={handleSubmit}>
        <span className="brand-mark brand-mark-large">雪</span>
        <div className="login-heading centered"><span className="eyebrow">Invitación Yukimi</span><h1>Crea tu contraseña</h1><p>Solo tú podrás conocerla. Yukimi y las demás administradoras nunca podrán verla.</p></div>
        <label className="field input-with-icon"><span>Nueva contraseña</span><div><LockKeyhole size={18}/><input autoComplete="new-password" minLength={8} required type={visible?'text':'password'} value={password} onChange={(event)=>setPassword(event.target.value)}/><button type="button" onClick={()=>setVisible((value)=>!value)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
        <label className="field input-with-icon"><span>Confirmar contraseña</span><div><CheckCircle2 size={18}/><input autoComplete="new-password" minLength={8} required type={visible?'text':'password'} value={confirmation} onChange={(event)=>setConfirmation(event.target.value)}/></div></label>
        <div className="password-rules"><span className={password.length>=8?'met':''}>Al menos 8 caracteres</span><span className={/[A-Z]/.test(password)?'met':''}>Una mayúscula recomendada</span><span className={/\d/.test(password)?'met':''}>Un número recomendado</span></div>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <button className="button button-primary button-full" disabled={submitting} type="submit">{submitting?'Guardando…':'Guardar contraseña y continuar'}</button>
      </form>
    </main>
  );
}
