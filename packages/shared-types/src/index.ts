/**
 * Tipos da API, gerados do OpenAPI do FastAPI.
 *
 *   1. suba a API      → uvicorn app.main:app
 *   2. gere os tipos   → npm run gen:types
 *
 * Não escreva tipo de API à mão: o schema do servidor é a fonte da verdade.
 * `openapi.d.ts` entra no repo como placeholder e é sobrescrito pelo gerador.
 */
export type { components, operations, paths } from './openapi';
