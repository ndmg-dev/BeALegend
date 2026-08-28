/**
 * UUIDv7 gerado no cliente (RFC 9562).
 *
 * O cliente escolhe o id no momento da criação e o servidor aceita. Isso
 * elimina a classe inteira de bug de "id temporário virou id real e as
 * referências quebraram" — que é o que mais mata app offline.
 *
 * A versão 7 é ordenável por tempo: as chaves do Dexie saem em ordem de
 * criação, e o índice não fragmenta como faria com UUIDv4.
 */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function bytesAleatorios(tamanho: number): Uint8Array {
  const buffer = new Uint8Array(tamanho);
  crypto.getRandomValues(buffer);
  return buffer;
}

export function uuidv7(agora: number = Date.now()): string {
  const bytes = new Uint8Array(16);

  // 48 bits de timestamp em milissegundos, big-endian.
  const ms = BigInt(agora);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }

  bytes.set(bytesAleatorios(10), 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versão 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122

  const h = (i: number): string => HEX[bytes[i] ?? 0] ?? '00';
  return (
    `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-` +
    `${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`
  );
}

/**
 * Chave de idempotência de uma operação da outbox.
 *
 * Precisa ser estável entre retentativas da *mesma* operação e única entre
 * operações diferentes — é o que faz um retry após timeout não duplicar um
 * lançamento de gasto.
 */
export function idempotencyKey(): string {
  return `idem-${uuidv7()}`;
}
