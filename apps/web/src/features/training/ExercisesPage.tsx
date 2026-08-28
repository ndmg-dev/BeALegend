import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { criar, listar } from '@/data/db/exerciseRepo';
import { useSession } from '@/features/auth/useSession';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { TextField } from '@/ui/TextField';

/**
 * Tela mínima de exercícios — o suficiente para a fase 1 ter uma escrita real
 * que atravessa Dexie, outbox e sync. O executor de sessão e o plano semanal
 * chegam na fase 2.
 *
 * A lista vem do Dexie, não da rede: é o que faz o registro funcionar 100%
 * offline e aparecer na tela no mesmo frame.
 */
export function ExercisesPage() {
  const user = useSession((s) => s.user);
  const exercicios = useLiveQuery(() => listar(), [], []);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nome.trim() || !user) return;
    setSalvando(true);
    try {
      // Escrita otimista: grava local, aparece na hora, sobe depois.
      await criar({ nome: nome.trim() }, user.id);
      setNome('');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="mb-sp-4 text-title">Treino</h1>

      <Card className="mb-sp-5">
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-sp-4">
          <TextField
            label="Novo exercício"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Supino inclinado com halteres"
          />
          <Button type="submit" disabled={salvando || !nome.trim()}>
            Adicionar
          </Button>
        </form>
      </Card>

      {exercicios.length === 0 ? (
        <Card>
          <p className="text-body text-text-secondary">
            Nenhum exercício ainda. O catálogo da planilha entra na fase 2.
          </p>
        </Card>
      ) : (
        <ul aria-label="Exercícios" className="flex flex-col gap-sp-2">
          {exercicios.map((exercicio) => (
            <li key={exercicio.id}>
              <Card className="flex items-center justify-between gap-sp-4 py-sp-4">
                <span className="text-body">{exercicio.nome}</span>
                {exercicio.row_version === 0 ? (
                  <span className="flex items-center gap-sp-1 text-caption text-text-muted">
                    <span aria-hidden="true">↑</span> não enviado
                  </span>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
