import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Account, Category } from '@/data/db/schema';
import { parseMoney } from '@/domain/finance/money';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CategoryPill } from '@/ui/CategoryPill';
import { TextField } from '@/ui/TextField';

interface Props {
  accounts: Account[];
  categories: Category[];
  onSave: (input: { accountId: string; categoryId: string; cents: number; description: string }) => Promise<void>;
}

export function QuickEntrySheet({ accounts, categories, onSave }: Props) {
  const [value, setValue] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cents = parseMoney(value);
    if (!cents) return setError('Valor precisa ser maior que zero.');
    if (!categoryId) return setError('Escolha uma categoria.');
    const account = accounts[0];
    if (!account) return setError('Nenhuma conta disponível.');
    setSaving(true);
    setError(undefined);
    try {
      await onSave({ accountId: account.id, categoryId, cents, description });
      setValue('');
      setDescription('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-financas-700/60">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-sp-4">
        <div>
          <h2 className="text-heading">Novo gasto</h2>
          <p className="text-label text-text-muted">Registre em poucos toques; sincroniza depois.</p>
        </div>
        <TextField
          label="Valor"
          inputMode="decimal"
          placeholder="0,00"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error?.startsWith('Valor') ? error : undefined}
        />
        <fieldset>
          <legend className="mb-sp-2 text-label text-text-secondary">Categoria</legend>
          <div className="flex flex-wrap gap-sp-2">
            {categories.map((category) => (
              <CategoryPill
                key={category.id}
                selected={category.id === categoryId}
                icon={category.icone}
                onClick={() => { setCategoryId(category.id); setError(undefined); }}
              >
                {category.nome}
              </CategoryPill>
            ))}
          </div>
        </fieldset>
        {error && !error.startsWith('Valor') ? <p role="alert" className="text-label text-danger">⚠ {error}</p> : null}
        <TextField
          label="Descrição (opcional)"
          value={description}
          maxLength={200}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button type="submit" size="lg" full disabled={saving}>
          {saving ? 'Registrando…' : 'Registrar gasto'}
        </Button>
      </form>
    </Card>
  );
}
