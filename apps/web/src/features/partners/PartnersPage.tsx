import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/data/api/problem';
import {
  acceptPartnerLink,
  declinePartnerLink,
  invitePartner,
  listPartnerLinks,
  partnerSummary,
  revokePartnerLink,
  type PartnerLink,
  type PartnerSummary,
} from '@/data/api/partners';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { StatCard } from '@/ui/StatCard';
import { TextField } from '@/ui/TextField';

/**
 * Progresso do parceiro — vínculo mútuo por convite, sem financas.
 *
 * Ao contrário do resto do app, isto não é dado local: um vínculo é
 * interação em tempo real entre duas contas, então a tela pede rede sempre
 * que abre. Offline, mostra o que já carregou nesta sessão.
 */
export function PartnersPage() {
  const [links, setLinks] = useState<PartnerLink[] | null>(null);
  const [erro, setErro] = useState<string>();

  const recarregar = () => {
    void listPartnerLinks()
      .then(setLinks)
      .catch((cause) => setErro(cause instanceof Error ? cause.message : 'Falha ao carregar.'));
  };

  useEffect(recarregar, []);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-sp-5">
      <header className="flex items-center gap-sp-3">
        <Link
          to="/metas"
          aria-label="Voltar para Metas"
          className="grid min-h-tap min-w-tap place-items-center rounded-md text-text-muted"
        >
          <Icon name="chevron-left" size={24} />
        </Link>
        <div>
          <h1 className="text-title">Parceiro</h1>
          <p className="text-label text-text-muted">Acompanhem o progresso um do outro</p>
        </div>
      </header>

      {erro ? <p role="alert" className="text-label text-danger">⚠ {erro}</p> : null}

      <InviteForm onInvited={recarregar} />

      {links === null ? (
        <div role="status" className="text-text-muted">Carregando…</div>
      ) : links.length === 0 ? (
        <EmptyState title="Nenhum vínculo ainda">
          Convide por e-mail para acompanharem treinos, refeições e hábitos um do outro. Gastos
          nunca são compartilhados.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-sp-3">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} onChanged={recarregar} />
          ))}
        </div>
      )}
    </section>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar() {
    if (!email.trim()) return;
    setEnviando(true);
    setErro(undefined);
    try {
      await invitePartner(email.trim());
      setEmail('');
      onInvited();
    } catch (cause) {
      setErro(cause instanceof ApiError ? cause.problem.detail ?? cause.message : 'Não foi possível convidar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-sp-3 text-heading">Convidar</h2>
      <div className="flex flex-col gap-sp-3">
        <TextField
          label="E-mail da conta"
          type="email"
          icon="mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nome@exemplo.com"
        />
        {erro ? <p role="alert" className="text-label text-danger">⚠ {erro}</p> : null}
        <Button disabled={enviando || !email.trim()} onClick={() => void enviar()}>
          {enviando ? 'Enviando…' : 'Enviar convite'}
        </Button>
      </div>
    </Card>
  );
}

const STATUS_LABEL: Record<PartnerLink['status'], string> = {
  pendente: 'Pendente',
  aceito: 'Ativo',
  recusado: 'Recusado',
};

function LinkCard({ link, onChanged }: { link: PartnerLink; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function responder(acao: 'accept' | 'decline') {
    setBusy(true);
    try {
      await (acao === 'accept' ? acceptPartnerLink(link.id) : declinePartnerLink(link.id));
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function revogar() {
    setBusy(true);
    try {
      await revokePartnerLink(link.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-sp-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold">{link.partner_email}</p>
          <p className="text-caption text-text-muted">
            {STATUS_LABEL[link.status]}
            {link.status === 'pendente' ? (link.direcao === 'enviado' ? ' · aguardando resposta' : ' · convidou você') : ''}
          </p>
        </div>
        {link.status === 'pendente' && link.direcao === 'recebido' ? (
          <div className="flex shrink-0 gap-sp-2">
            <Button variant="ghost" disabled={busy} onClick={() => void responder('decline')}>Recusar</Button>
            <Button disabled={busy} onClick={() => void responder('accept')}>Aceitar</Button>
          </div>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => void revogar()}>
            {link.status === 'aceito' ? 'Desvincular' : 'Cancelar'}
          </Button>
        )}
      </div>

      {link.status === 'aceito' ? <PartnerProgress linkId={link.id} /> : null}
    </Card>
  );
}

function PartnerProgress({ linkId }: { linkId: string }) {
  const [resumo, setResumo] = useState<PartnerSummary | null>(null);

  useEffect(() => {
    let cancelado = false;
    void partnerSummary(linkId).then((data) => {
      if (!cancelado) setResumo(data);
    }).catch(() => undefined);
    return () => { cancelado = true; };
  }, [linkId]);

  if (!resumo) return <p className="mt-sp-3 text-label text-text-muted">Carregando progresso…</p>;

  return (
    <div className="mt-sp-4 grid grid-cols-2 gap-sp-3 border-t border-border-subtle pt-sp-4 sm:grid-cols-4">
      <StatCard label="Treinos" value={resumo.treinos_concluidos} detail="na semana" />
      <StatCard label="Alimentação" value={`${resumo.aderencia_percentual}%`} detail={`${resumo.refeicoes_registradas} refeições`} />
      <StatCard label="Hábitos" value={`${resumo.habitos_concluidos}/${resumo.habitos_previstos}`} detail="check-ins" />
    </div>
  );
}
