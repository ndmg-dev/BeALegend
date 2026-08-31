import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, NetworkError } from '@/data/api/problem';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Icon, type IconName } from '@/ui/Icon';
import { TextField } from '@/ui/TextField';
import { useSession } from './useSession';

type Modo = 'entrar' | 'criar';

const DOMINIOS: { icone: IconName; label: string; cor: string }[] = [
  { icone: 'tab-treino', label: 'Treino', cor: 'text-treino-300' },
  { icone: 'tab-comer', label: 'Comer', cor: 'text-nutricao-300' },
  { icone: 'tab-grana', label: 'Grana', cor: 'text-financas-300' },
  { icone: 'tab-metas', label: 'Metas', cor: 'text-rotina-300' },
];

export function AuthPage({ modo }: { modo: Modo }) {
  const navigate = useNavigate();
  const login = useSession((s) => s.login);
  const register = useSession((s) => s.register);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
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
      <Card className="flex w-full max-w-sm flex-col items-center">
        <img src="/assets/logomark.svg" alt="" width={56} height={56} className="rounded-[14px]" />
        <h1 className="mt-sp-4 text-title">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="mt-sp-1 mb-sp-6 text-center text-label text-text-muted">
          Treino, refeições, gastos e hábitos — num lugar só.
        </p>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="flex w-full flex-col gap-sp-4"
          noValidate
        >
          <TextField
            label="E-mail"
            type="email"
            icon="mail"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Senha"
            type={mostrarSenha ? 'text' : 'password'}
            icon="lock"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
            {...(modo === 'criar' ? { minLength: 10 } : {})}
            hint={modo === 'criar' ? 'Mínimo de 10 caracteres.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            trailing={
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                className="grid min-h-tap min-w-tap place-items-center text-text-muted"
              >
                <Icon name={mostrarSenha ? 'eye-off' : 'eye'} size={20} />
              </button>
            }
          />

          {erro ? (
            <p
              role="alert"
              className="flex items-start gap-sp-2 rounded-md bg-danger-bg px-sp-3 py-sp-2 text-label text-danger"
            >
              <Icon name="alert" size={16} className="mt-[2px] shrink-0" />
              {erro}
            </p>
          ) : null}

          <Button type="submit" size="lg" full disabled={enviando}>
            {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>

        <p className="mt-sp-5 text-center text-label text-text-muted">
          {modo === 'entrar' ? (
            <a href="/criar-conta" className="text-accent">
              Criar uma conta
            </a>
          ) : (
            <a href="/entrar" className="text-accent">
              Já tenho conta
            </a>
          )}
        </p>

        <div className="mt-sp-6 grid w-full grid-cols-4 gap-sp-2 border-t border-border-subtle pt-sp-5">
          {DOMINIOS.map((d) => (
            <div key={d.label} className={`flex flex-col items-center gap-sp-1 ${d.cor}`}>
              <Icon name={d.icone} size={22} />
              <span className="text-caption text-text-muted">{d.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
