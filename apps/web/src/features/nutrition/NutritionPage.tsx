import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MealLog, MealSlot } from '@/data/db/schema';
import {
  addWater,
  createMeal,
  ensureNutritionDefaults,
  mealsOnDay,
  mealSlots,
  saveWeightKg,
  waterOnDay,
} from '@/data/db/nutritionRepo';
import { fetchDietPlan } from '@/data/api/dietPlan';
import { DietPlan } from './DietPlan';
import {
  fetchTodayInsight,
  fetchWeeklyInsight,
  type NutritionInsight,
} from '@/data/api/nutritionInsights';
import { cachedInsight, saveInsight } from '@/data/db/insightsRepo';
import { sincronizar } from '@/data/sync/engine';
import { summarizeAdherence, totalWater, type Adherence } from '@/domain/nutrition/adherence';
import { toLocalDate } from '@/domain/time/day';
import { useSession } from '@/features/auth/useSession';
import { photoToDataUrl } from '@/platform/camera';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CategoryPill } from '@/ui/CategoryPill';
import { TextField } from '@/ui/TextField';

const WATER_GOAL_ML = 2000;

export function NutritionPage() {
  const user = useSession((state) => state.user);
  const day = user ? toLocalDate(new Date(), user.timezone) : '';
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null);
  const [aba, setAba] = useState<'hoje' | 'plano'>('hoje');
  const data = useLiveQuery(async () => ({
    slots: await mealSlots(),
    meals: await mealsOnDay(day),
    water: await waterOnDay(day),
  }), [day]);
  const insight = useLiveQuery(
    async () => (await cachedInsight('diario')) ?? (await cachedInsight('semanal')),
    [],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void sincronizar().then(async () => {
      if (!cancelled) await ensureNutritionDefaults(user.id);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user || !navigator.onLine) return;
    let cancelled = false;
    void (async () => {
      const [diario, semanal] = await Promise.allSettled([
        fetchTodayInsight(),
        fetchWeeklyInsight(),
      ]);
      if (cancelled) return;
      if (diario.status === 'fulfilled') await saveInsight('diario', diario.value);
      if (semanal.status === 'fulfilled') await saveInsight('semanal', semanal.value);
      // O peso vem daqui porque `body_metric` não é sincronizado para o Dexie;
      // sem ele a meta de proteína/gordura não fecha. Falha de rede não é
      // problema: o valor cacheado da última vez continua valendo.
      const plano = await fetchDietPlan().catch(() => null);
      if (!cancelled && plano) await saveWeightKg(plano.peso_kg);
    })();
    return () => { cancelled = true; };
  }, [user, day]);

  const adherence = useMemo(
    () => summarizeAdherence((data?.meals ?? []).map((meal) => meal.aderencia)),
    [data?.meals],
  );
  const waterMl = totalWater(data?.water ?? []);

  if (!user || !data) return <div role="status" className="text-text-muted">Carregando alimentação…</div>;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-sp-5">
      <header>
        <h1 className="text-title">Comer</h1>
        <p className="text-label text-text-muted">
          {aba === 'plano'
            ? 'Seu plano alimentar'
            : adherence.total
              ? `${adherence.percentual}% de aderência hoje`
              : 'Registre sem contar calorias'}
        </p>
      </header>

      <div role="tablist" aria-label="Comer" className="flex gap-sp-2">
        {([['hoje', 'Hoje'], ['plano', 'Plano']] as const).map(([valor, rotulo]) => (
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

      {aba === 'plano' ? <DietPlan /> : (
      <>
      {insight ? <InsightCard insight={insight} /> : null}

      <Card className="border-l-[3px] border-l-nutricao-400">
        <div className="mb-sp-4 flex items-baseline justify-between">
          <h2 className="text-heading">Refeições de hoje</h2>
          <span className="text-label text-text-muted">{adherence.dentro} dentro do plano</span>
        </div>
        <div className="flex flex-col gap-sp-2">
          {data.slots.map((slot) => {
            const meal = data.meals.find((item) => item.slot_id === slot.id);
            return <MealSlotRow key={slot.id} slot={slot} meal={meal} onRegister={() => setSelectedSlot(slot)} />;
          })}
        </div>
      </Card>

      {selectedSlot ? (
        <MealRegistration
          slot={selectedSlot}
          day={day}
          timezone={user.timezone}
          onCancel={() => setSelectedSlot(null)}
          onSave={async (input) => {
            await createMeal(input, user.id);
            setSelectedSlot(null);
            void sincronizar();
          }}
        />
      ) : null}

      <Card>
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-heading">Água</h2>
            <p className="text-label text-text-muted">Meta visual de {WATER_GOAL_ML / 1000} L</p>
          </div>
          <strong className="text-subhead text-nutricao-300">{waterMl} ml</strong>
        </div>
        <div className="my-sp-4 h-2 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-nutricao-500"
            style={{ width: `${Math.min(100, (waterMl / WATER_GOAL_ML) * 100)}%` }}
            role="progressbar"
            aria-label="Água consumida hoje"
            aria-valuenow={waterMl}
            aria-valuemax={WATER_GOAL_ML}
          />
        </div>
        <div className="grid grid-cols-2 gap-sp-3">
          {[250, 500].map((ml) => (
            <Button
              key={ml}
              variant="secondary"
              onClick={() => void addWater(day, ml, user.id).then(() => sincronizar())}
            >
              + {ml} ml
            </Button>
          ))}
        </div>
      </Card>

      {data.meals.length ? (
        <Card>
          <h2 className="mb-sp-3 text-heading">Registrado hoje</h2>
          <div className="flex flex-col gap-sp-4">
            {data.meals.map((meal) => <MealHistory key={meal.id} meal={meal} />)}
          </div>
        </Card>
      ) : null}
      </>
      )}
    </section>
  );
}

function InsightCard({ insight }: { insight: NutritionInsight }) {
  const dias = Math.floor((Date.now() - Date.parse(insight.gerado_em)) / 86_400_000);
  const quando = dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
  return (
    <Card className="border-l-[3px] border-l-nutricao-300 bg-nutricao-950/30">
      <div className="mb-sp-2 flex items-baseline justify-between">
        <h2 className="text-heading">
          <span aria-hidden="true">✨ </span>
          {insight.tipo === 'semanal' ? 'Leitura da semana' : 'Observação do dia'}
        </h2>
        <span className="text-caption text-text-muted">{quando}</span>
      </div>
      <p className="text-body text-text-secondary">{insight.texto}</p>
    </Card>
  );
}

function MealSlotRow({ slot, meal, onRegister }: { slot: MealSlot; meal: MealLog | undefined; onRegister: () => void }) {
  const label = meal?.aderencia === 'dentro' ? 'Dentro do plano' : meal?.aderencia === 'parcial' ? 'Parcial' : 'Fora do plano';
  return (
    <div className="flex min-h-tap items-center gap-sp-3 border-b border-border-subtle py-sp-2 last:border-0">
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 place-items-center rounded-full ${meal ? 'bg-nutricao-500 text-white' : 'border-2 border-border'}`}
      >
        {meal ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium">{slot.nome}</p>
        <p className="truncate text-caption text-text-muted">
          {meal ? `${meal.descricao} · ${label}` : `${slot.horario_alvo ?? ''} · ${slot.descricao ?? ''}`}
        </p>
      </div>
      {!meal ? <Button variant="secondary" onClick={onRegister}>Registrar</Button> : null}
    </div>
  );
}

function MealRegistration({
  slot, day, timezone, onCancel, onSave,
}: {
  slot: MealSlot; day: string; timezone: string; onCancel: () => void;
  onSave: (input: Parameters<typeof createMeal>[0]) => Promise<void>;
}) {
  const [description, setDescription] = useState(slot.descricao ?? slot.nome);
  const [adherence, setAdherence] = useState<Adherence>('dentro');
  const [tags, setTags] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const availableTags = ['caseiro', 'proteína', 'vegetais'];

  async function save() {
    if (!description.trim()) return setError('Descreva brevemente a refeição.');
    setSaving(true);
    try {
      await onSave({
        day, slotId: slot.id, time: localTime(timezone), description: description.trim(),
        adherence, photoUrl: photo, tags,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-nutricao-700/60">
      <div className="mb-sp-4 flex items-center justify-between">
        <h2 className="text-heading">Registrar {slot.nome}</h2>
        <Button variant="ghost" onClick={onCancel}>Fechar</Button>
      </div>
      <div className="flex flex-col gap-sp-4">
        <TextField label="O que você comeu?" value={description} maxLength={240} onChange={(event) => setDescription(event.target.value)} />
        <fieldset>
          <legend className="mb-sp-2 text-label text-text-secondary">Aderência ao plano</legend>
          <div className="grid grid-cols-3 gap-sp-2">
            {([['dentro', 'Dentro'], ['parcial', 'Parcial'], ['fora', 'Fora']] as const).map(([value, label]) => (
              <CategoryPill key={value} selected={adherence === value} onClick={() => setAdherence(value)}>{label}</CategoryPill>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-sp-2 text-label text-text-secondary">Tags opcionais</legend>
          <div className="flex flex-wrap gap-sp-2">
            {availableTags.map((tag) => (
              <CategoryPill
                key={tag}
                selected={tags.includes(tag)}
                onClick={() => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}
              >
                {tag}
              </CategoryPill>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-tap cursor-pointer items-center justify-center rounded-md border border-border bg-surface-raised text-label font-semibold">
          {photo ? '✓ Foto adicionada' : 'Adicionar foto (opcional)'}
          <input
            type="file" accept="image/*" capture="environment" className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void photoToDataUrl(file).then(setPhoto).catch((cause: Error) => setError(cause.message));
            }}
          />
        </label>
        {error ? <p role="alert" className="text-label text-danger">⚠ {error}</p> : null}
        <Button size="lg" full disabled={saving} onClick={() => void save()}>
          {saving ? 'Registrando…' : 'Registrar refeição'}
        </Button>
      </div>
    </Card>
  );
}

function MealHistory({ meal }: { meal: MealLog }) {
  return (
    <div className="flex gap-sp-3">
      {meal.foto_url ? <img src={meal.foto_url} alt="Foto da refeição" className="h-16 w-16 rounded-md object-cover" /> : null}
      <div>
        <p className="text-body">{meal.descricao}</p>
        <p className="text-caption text-text-muted">{meal.horario} · {meal.aderencia}</p>
        {meal.tags.length ? <p className="text-caption text-nutricao-300">{meal.tags.join(' · ')}</p> : null}
      </div>
    </div>
  );
}

function localTime(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour === '24' ? '00' : hour}:${minute}`;
}
