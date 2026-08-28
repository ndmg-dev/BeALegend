import { z } from 'zod';

/** RFC 7807. Todo erro da API chega neste formato. */
export const problemSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type Problem = z.infer<typeof problemSchema>;

export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }

  get status(): number {
    return this.problem.status;
  }
}

/** Erro de rede — a diferença importa: offline não é falha, é estado. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Sem conexão com o servidor');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}
