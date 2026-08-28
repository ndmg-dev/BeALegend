const MAX_PHOTO_BYTES = 750_000;

/**
 * Mantém a foto disponível offline sem introduzir um serviço de storage na v1.
 * O data URL sincroniza junto do log; o limite evita explodir IndexedDB/outbox.
 */
export function photoToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Escolha uma imagem.'));
  if (file.size > MAX_PHOTO_BYTES) {
    return Promise.reject(new Error('A foto deve ter no máximo 750 KB.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Formato de foto inválido.'));
    };
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
    reader.readAsDataURL(file);
  });
}
