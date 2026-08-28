import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, NetworkError } from '@/data/api/problem';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { TextField } from '@/ui/TextField';
import { useSession } from './useSession';

type Modo = 'entrar' | 'criar';

export function AuthPage({ modo }: { modo: Modo }) {
  const navigate = useNavigate();
  const login = useSession((s) => s.login);
  const register = useSession((s) => s.register);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') await login(email, password);
      else await register({ email, password });
      navigate('/hoje', { replace: true });
    } catch (e) {
      if (e instanceof NetworkError) setErro('Sem conexão. Entrar exige rede uma vez.');
      else if (e instanceof ApiError) setErro(e.problem.detail ?? e.problem.title);
      else setErro('Não foi possível concluir. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-sp-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-sp-2 text-title">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="mb-sp-6 text-label text-text-muted">
          Treino, refeições, gastos e hábitos — num lugar só.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-sp-4" noValidate>
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Senha"
            type="password"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
            {...(modo === 'criar' ? { minLength: 10 } : {})}
            hint={modo === 'criar' ? 'Mínimo de 10 caracteres.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {erro ? (
            <p role="alert" className="flex items-start gap-sp-2 rounded-md bg-danger-bg px-sp-3 py-sp-2 text-label text-danger">
              <span aria-hidden="true">⚠</span>
              {erro}
            </p>
          ) : null}

          <Button type="submit" size="lg" full disabled={enviando}>
            {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>

        <p className="mt-sp-5 text-center text-label text-text-muted">
          {modo === 'entrar' ? (
            <a href="/criar-conta" className="text-accent">Criar uma conta</a>
          ) : (
            <a href="/entrar" className="text-accent">Já tenho conta</a>
          )}
        </p>
      </Card>
    </main>
  );
}
