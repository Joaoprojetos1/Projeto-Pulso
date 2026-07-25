import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Rate limit em memória, janela fixa. Simples de propósito: o Render free roda
 * uma instância só, então memória basta. Defesa contra abuso em login, cadastro,
 * recuperação de senha e conversa (força bruta, enumeração, custo de IA).
 *
 * A chave padrão é o IP; rotas autenticadas podem chavear pelo token.
 */
export interface RateLimiter {
  /** true = bloqueado (já respondeu 429). false = pode seguir. */
  check(req: FastifyRequest, reply: FastifyReply): boolean;
  reset(): void;
}

export function makeRateLimiter(opts: {
  windowMs: number;
  max: number;
  name: string;
  keyFn?: (req: FastifyRequest) => string;
}): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const keyFn = opts.keyFn ?? ((req) => req.ip);

  return {
    check(req, reply) {
      const key = keyFn(req);
      const now = Date.now();
      const slot = hits.get(key);

      if (!slot || slot.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
        return false;
      }
      slot.count += 1;
      if (slot.count > opts.max) {
        req.log?.warn?.({ rota: opts.name }, 'rate limit atingido');
        reply.code(429).send({ error: 'Muitas tentativas. Aguarde um instante e tente de novo.' });
        return true;
      }
      return false;
    },
    reset() {
      hits.clear();
    },
  };
}

/** Chave por token Bearer (rotas autenticadas), com o IP como reserva. */
export function keyByToken(req: FastifyRequest): string {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : req.ip;
}
