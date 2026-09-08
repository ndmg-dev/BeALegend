import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apagar, historico, registrar } from '@/data/db/bodyMetricRepo';
import { sincronizar } from '@/data/sync/engine';
import { ordenarPorData, variacao } from '@/domain/nutrition/bodyMetrics';
import { toLocalDate } from '@/domain/time/day';
import { useSession } from '@/features/auth/useSession';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CategoryPill } from '@/ui/CategoryPill';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { TextField } from '@/ui/TextField';

type Tipo = 'peso' | 'circunferencia';

const CONFIG: Record<Tipo, { titulo: string; unidade: string; placeholder: string }> = {
  peso: { titulo: 'Peso', unidade: 'kg', placeholder: 'Ex.: 78.5' },
  circunferencia: { titulo: 'Circunferência', unidade: 'cm', placeholder: 'Ex.: 82' },
};

/**
 * Histórico de peso e medidas — carregado sob demanda (`React.lazy` em
 * `NutritionPage`) porque só quem abre esta aba precisa do recharts, a
 * maior dependência do bundle.
 *
 * `body_metric` chega inteiro pelo delta do sync: o mesmo registro que o
 * usuário lança aqui é o que `/nutrition/plan` já lê para calcular a meta
 * de proteína/gordura — nenhum código novo no cálculo da meta, só a tela
 * que faltava para alimentá-lo.
 */
export function WeightHistory() {
  const user = useSession((s) => s.user);
  const [tipo, setTipo] = useState<Tipo>('peso');
  const [valor, setValor] = useState('');

  const registros = useLiveQuery(async () => historico(tipo), [tipo], undefined);
  const pontos = useMemo(() => ordenarPorData(registros ?? []), [registros]);
  const config = CONFIG[tipo];
  const delta = variacao(pontos);

  async function lancar() {
    const numero = Number(valor.replace(',', '.'));
    if (!user || !Number.isFinite(numero) || numero <= 0) return;
    const hoje = toLocalDate(new Date(), user.timezone);
    await registrar(tipo, numero, hoje, user.id);
    setValor('');
    void sincronizar();
  }

  if (!user) return null;

  return (
    <div className="flex flex-col gap-sp-5">
      <div role="tablist" aria-label="Tipo de medida" className="flex gap-sp-2">
        {(Object.keys(CONFIG) as Tipo[]).map((chave) => (
          <CategoryPill
            key={chave}
            role="tab"
            aria-selected={tipo === chave}
            selected={tipo === chave}
            onClick={() => setTipo(chave)}
          >
            {CONFIG[chave].titulo}
          </CategoryPill>
        ))}
      </div>

      <Card>
        <h2 className="mb-sp-3 text-heading">Novo registro</h2>
        <div className="flex items-end gap-sp-3">
          <TextField
            label={`${config.titulo} (${config.unidade})`}
            inputMode="decimal"
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            placeholder={config.placeholder}
          />
          <Button disabled={!valor.trim()} onClick={() => void lancar()}>
            Registrar
          </Button>
        </div>
      </Card>

      {pontos.length === 0 ? (
        <EmptyState title="Sem registros ainda">
          Lance {tipo === 'peso' ? 'seu peso' : 'uma medida'} acima para ver a evolução aqui.
        </EmptyState>
      ) : (
        <>
          <Card className="flex items-center justify-between gap-sp-4">
            <div>
              <p className="text-label text-text-muted">Último registro</p>
              <p className="text-title tabular-nums">
                {pontos[pontos.length - 1]?.valor} {config.unidade}
              </p>
            </div>
            {delta !== null ? (
              <div className="text-right">
                <p className="text-label text-text-muted">Desde o início</p>
                <p
                  className={`text-subhead tabular-nums ${
                    delta === 0 ? 'text-text-muted' : 'text-nutricao-300'
                  }`}
                >
                  {delta > 0 ? '+' : ''}
                  {delta} {config.unidade}
                </p>
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-sp-3 text-heading">{config.titulo} ao longo do tempo</h2>
            <div
              className="h-56 w-full"
              role="img"
              aria-label={`Gráfico de ${config.titulo.toLowerCase()} ao longo do tempo`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pontos.map((p) => ({ ...p }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
                  <XAxis
                    dataKey="data"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(data: string) => data.slice(5).replace('-', '/')}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={36} unit={config.unidade} domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(value: number) => [`${value} ${config.unidade}`, config.titulo]}
                    labelFormatter={(data: string) => data.split('-').reverse().join('/')}
                  />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="var(--nu-400)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h2 className="mb-sp-3 text-heading">Registros</h2>
            <ul className="flex flex-col gap-sp-1">
              {[...pontos].reverse().map((ponto) => (
                <li
                  key={ponto.data}
                  className="flex min-h-tap items-center justify-between gap-sp-3 border-b border-border-subtle py-sp-2 last:border-0"
                >
                  <span className="text-label text-text-secondary">
                    {ponto.data.split('-').reverse().join('/')}
                  </span>
                  <span className="flex items-center gap-sp-3">
                    <span className="text-body tabular-nums">
                      {ponto.valor} {config.unidade}
                    </span>
                    <RemoverBotao tipo={tipo} data={ponto.data} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * O ponto do gráfico só tem `data`+`valor` (agregado por dia); o id real do
 * `body_metric` mora no Dexie. Busca de novo por `tipo`+`data` na hora de
 * apagar em vez de carregar o id na estrutura do gráfico — mantém
 * `domain/nutrition/bodyMetrics.ts` livre de qualquer forma do banco.
 */
function RemoverBotao({ tipo, data }: { tipo: Tipo; data: string }) {
  const [busy, setBusy] = useState(false);
  async function remover() {
    setBusy(true);
    try {
      const linhas = await historico(tipo);
      const alvo = linhas.find((item) => item.data === data);
      if (alvo) {
        await apagar(alvo.id);
        void sincronizar();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Remover registro de ${data}`}
      onClick={() => void remover()}
      className="grid min-h-tap min-w-tap place-items-center text-text-muted"
    >
      <Icon name="trash" size={16} />
    </button>
  );
}
