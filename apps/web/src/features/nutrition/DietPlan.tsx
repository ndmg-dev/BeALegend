import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { FoodItem, MealSlot, MealSlotItem } from '@/data/db/schema';
import {
  cachedWeightKg,
  dietPlan,
  foodItems,
  supplements,
} from '@/data/db/nutritionRepo';
import { calcularMetas, macrosDaPorcao, somarMacros } from '@/domain/nutrition/targets';
import { Card } from '@/ui/Card';
import { CategoryPill } from '@/ui/CategoryPill';
import { EmptyState } from '@/ui/EmptyState';
import { StatCard } from '@/ui/StatCard';

/**
 * O plano alimentar — o que a planilha de dieta virou dentro do app.
 *
 * Só leitura. O conteúdo nasce do seed da planilha e chega pelo delta do
 * sync; nada aqui escreve. O registro do dia (o que foi comido, aderência,
 * água) continua na aba "Hoje", que é outra pergunta: esta responde "qual é
 * o plano", aquela responde "como foi hoje".
 */
export function DietPlan() {
  const [aba, setAba] = useState<'refeicoes' | 'alimentos' | 'suplementos'>('refeicoes');
  const dados = useLiveQuery(async () => ({
    plano: await dietPlan(),
    alimentos: await foodItems(),
    suplementos: await supplements(),
    peso: await cachedWeightKg(),
  }), []);

  const metas = useMemo(
    () => calcularMetas(dados?.plano.meta ?? null, dados?.peso ?? null),
    [dados?.plano.meta, dados?.peso],
  );

  if (!dados) return <div role="status" className="text-text-muted">Carregando plano…</div>;

  if (!dados.plano.plano) {
    return (
      <EmptyState
        title="Nenhum plano alimentar"
        description="O plano da planilha de dieta ainda não chegou neste dispositivo. Sincronize e tente de novo."
      />
    );
  }

  return (
    <div className="flex flex-col gap-sp-5">
      <MetasCard metas={metas} peso={dados.peso} />

      <div role="tablist" aria-label="Seções do plano" className="flex gap-sp-2">
        {([
          ['refeicoes', 'Refeições'],
          ['alimentos', 'Alimentos'],
          ['suplementos', 'Suplementos'],
        ] as const).map(([valor, rotulo]) => (
          <CategoryPill
            key={valor}
            role="tab"
            aria-selected={aba === valor}
            selected={aba === valor}
            onClick={() => setAba(valor)}
          >
            {rotulo}
          </CategoryPill>
        ))}
      </div>

      {aba === 'refeicoes' ? (
        <Refeicoes
          slots={dados.plano.slots}
          itens={dados.plano.itens}
          alimentosPorId={dados.plano.alimentosPorId}
        />
      ) : null}
      {aba === 'alimentos' ? <BaseDeAlimentos alimentos={dados.alimentos} /> : null}
      {aba === 'suplementos' ? <Suplementos itens={dados.suplementos} /> : null}
    </div>
  );
}

const ROTULO_FALTANTE = {
  peso: 'seu peso',
  sexo: 'sexo',
  idade: 'idade',
  altura: 'altura',
} as const;

function MetasCard({
  metas,
  peso,
}: {
  metas: ReturnType<typeof calcularMetas>;
  peso: number | null;
}) {
  const semCalorias = metas.kcal === null;
  return (
    <Card className="border-l-[3px] border-l-nutricao-400">
      <div className="mb-sp-4 flex items-baseline justify-between">
        <h2 className="text-heading">Meta do dia</h2>
        {peso !== null ? (
          <span className="text-caption text-text-muted">com {peso} kg</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-sp-3 sm:grid-cols-4">
        <StatCard label="Calorias" value={metas.kcal ?? '—'} detail={semCalorias ? null : 'kcal'} />
        <StatCard label="Proteína" value={metas.proteina_g ?? '—'} detail="g" />
        <StatCard label="Carboidrato" value={metas.carboidrato_g ?? '—'} detail="g" />
        <StatCard label="Gordura" value={metas.gordura_g ?? '—'} detail="g" />
      </div>

      {metas.fibra_g !== null ? (
        <p className="mt-sp-3 text-label text-text-secondary">
          Fibra: <strong className="tabular-nums">{metas.fibra_g} g</strong> — a planilha acompanha
          fibra de perto porque a dieta não inclui frutas, verduras e legumes.
        </p>
      ) : null}

      {metas.faltando.length ? (
        <p className="mt-sp-3 text-label text-text-muted">
          Para fechar a meta calórica falta informar{' '}
          {metas.faltando.map((campo) => ROTULO_FALTANTE[campo]).join(', ')}. Sem isso o app mostra
          só o que dá para calcular, em vez de estimar por cima.
        </p>
      ) : null}
    </Card>
  );
}

function Refeicoes({
  slots,
  itens,
  alimentosPorId,
}: {
  slots: MealSlot[];
  itens: MealSlotItem[];
  alimentosPorId: Map<string, FoodItem>;
}) {
  return (
    <div className="flex flex-col gap-sp-4">
      {slots.map((slot) => {
        const doSlot = itens.filter((item) => item.meal_slot_id === slot.id);
        const comQuantidade = doSlot.filter((item) => item.quantidade_g !== null);
        const total = somarMacros(
          comQuantidade.flatMap((item) => {
            const alimento = alimentosPorId.get(item.food_item_id);
            return alimento ? [macrosDaPorcao(alimento, item.quantidade_g as number)] : [];
          }),
        );

        return (
          <Card key={slot.id}>
            <div className="mb-sp-3 flex items-baseline justify-between">
              <h3 className="text-heading">{slot.nome}</h3>
              {slot.horario_alvo ? (
                <span className="text-caption text-text-muted">{slot.horario_alvo}</span>
              ) : null}
            </div>

            <ul className="flex flex-col gap-sp-2">
              {doSlot.map((item) => {
                const alimento = alimentosPorId.get(item.food_item_id);
                if (!alimento) return null;
                return (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-sp-3 border-b border-border-subtle pb-sp-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-body">{alimento.nome}</p>
                      {alimento.referencia_pratica ? (
                        <p className="text-caption text-text-muted">
                          {alimento.referencia_pratica}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-label tabular-nums text-text-secondary">
                      {item.quantidade_g !== null
                        ? `${item.quantidade_g} g`
                        : `${Math.round(alimento.kcal)} kcal/100 g`}
                    </span>
                  </li>
                );
              })}
            </ul>

            {comQuantidade.length ? (
              <p className="mt-sp-3 text-label tabular-nums text-nutricao-300">
                {Math.round(total.kcal)} kcal · {Math.round(total.proteina_g)} g proteína
              </p>
            ) : (
              <p className="mt-sp-3 text-caption text-text-muted">
                Porções em aberto — a planilha sugere os alimentos e deixa a quantidade para você
                fechar contra a meta do dia.
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function BaseDeAlimentos({ alimentos }: { alimentos: FoodItem[] }) {
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? alimentos.filter((a) => a.nome.toLowerCase().includes(termo)) : alimentos;
  }, [alimentos, busca]);

  return (
    <Card>
      <div className="mb-sp-3 flex items-baseline justify-between">
        <h3 className="text-heading">Base de alimentos</h3>
        <span className="text-caption text-text-muted">por 100 g/ml</span>
      </div>

      <input
        type="search"
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
        placeholder="Buscar alimento…"
        aria-label="Buscar alimento"
        className="mb-sp-3 min-h-tap w-full rounded-md border border-border bg-surface-sunken px-sp-3 text-body"
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-label">
          <thead>
            <tr className="text-caption uppercase tracking-wider text-text-muted">
              <th scope="col" className="py-sp-2 text-left font-medium">Alimento</th>
              <th scope="col" className="py-sp-2 text-right font-medium">kcal</th>
              <th scope="col" className="py-sp-2 text-right font-medium">Prot</th>
              <th scope="col" className="py-sp-2 text-right font-medium">Carb</th>
              <th scope="col" className="py-sp-2 text-right font-medium">Gord</th>
              <th scope="col" className="py-sp-2 text-right font-medium">Fibra</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((alimento) => (
              <tr key={alimento.id} className="border-t border-border-subtle">
                <th scope="row" className="py-sp-2 text-left font-normal">
                  {alimento.nome}
                  {alimento.conferir_rotulo ? (
                    <span
                      title="Valor genérico — confira o rótulo da marca que você usa"
                      className="ml-sp-1 text-caption text-text-muted"
                    >
                      *
                    </span>
                  ) : null}
                </th>
                <td className="py-sp-2 text-right tabular-nums">{alimento.kcal}</td>
                <td className="py-sp-2 text-right tabular-nums">{alimento.proteina_g}</td>
                <td className="py-sp-2 text-right tabular-nums">{alimento.carboidrato_g}</td>
                <td className="py-sp-2 text-right tabular-nums">{alimento.gordura_g}</td>
                <td className="py-sp-2 text-right tabular-nums">{alimento.fibra_g}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-sp-3 text-caption text-text-muted">
        * Industrializado: o rótulo da marca que você realmente usa vale mais que o valor genérico
        da tabela.
      </p>
    </Card>
  );
}

function Suplementos({ itens }: { itens: { id: string; nome: string; como_usar: string | null;
  faixa: string | null; horario: string | null; observar: string | null; status: string | null }[] }) {
  if (!itens.length) {
    return <EmptyState title="Sem suplementos" description="Nada cadastrado no plano." />;
  }
  return (
    <div className="flex flex-col gap-sp-4">
      {itens.map((item) => (
        <Card key={item.id}>
          <div className="mb-sp-2 flex items-baseline justify-between gap-sp-3">
            <h3 className="text-heading">{item.nome}</h3>
            {item.status ? (
              <span className="shrink-0 text-caption text-nutricao-300">{item.status}</span>
            ) : null}
          </div>
          {item.faixa ? <p className="text-body text-text-secondary">{item.faixa}</p> : null}
          <dl className="mt-sp-3 flex flex-col gap-sp-2 text-label">
            {item.horario ? (
              <div>
                <dt className="text-text-muted">Horário</dt>
                <dd className="text-text-secondary">{item.horario}</dd>
              </div>
            ) : null}
            {item.observar ? (
              <div>
                <dt className="text-text-muted">O que observar</dt>
                <dd className="text-text-secondary">{item.observar}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ))}
    </div>
  );
}
