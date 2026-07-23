import type { FastifyReply, FastifyRequest } from 'fastify';

import { userFromRequest, type AuthedUser } from '../../auth';
import type { Sql } from '../../db';

/**
 * Segurança da área de operação (admin).
 *
 * Princípios:
 *  - O admin é um PAPEL do usuário (users.role), resolvido no banco a cada
 *    requisição. Não existe token de admin separado.
 *  - Para não-admin, tudo sob /admin responde 404 (não 403): não revelamos
 *    sequer que a área existe.
 *  - Toda ação de ESCRITA do admin é registrada em admin_audit.
 *  - As rotas /admin têm rate limit simples em memória (defesa contra abuso;
 *    o Render free roda uma instância só, então memória basta).
 */

/** 404 padrão — a mesma resposta para "não existe" e "você não é admin". */
export function notFound(reply: FastifyReply): FastifyReply {
  reply.code(404).send({ error: 'Não encontrado.' });
  return reply;
}

/**
 * Exige papel admin. Devolve o usuário admin quando ok; devolve null e já
 * respondeu 404 quando não é admin (ou não está logado). Quem chama faz:
 *   const admin = await requireAdmin(sql, req, reply);
 *   if (!admin) return reply;
 */
export async function requireAdmin(
  sql: Sql,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthedUser | null> {
  const user = await userFromRequest(sql, req);
  if (!user || user.role !== 'admin') {
    notFound(reply);
    return null;
  }
  return user;
}

/** Registra uma ação de escrita do admin. Best-effort: auditar não pode
 *  derrubar a operação, mas a operação também não deveria acontecer sem trilha —
 *  então gravamos ANTES de responder sucesso. */
export async function recordAudit(
  sql: Sql,
  adminUserId: string,
  action: string,
  target: { type: string; id: string | null },
  payload: unknown,
): Promise<void> {
  await sql`
    INSERT INTO admin_audit (admin_user_id, action, target_type, target_id, payload)
    VALUES (${adminUserId}, ${action}, ${target.type}, ${target.id},
            ${payload == null ? null : sql.json(payload as never)})`;
}

/**
 * Rate limit em memória, janela fixa. Chave = token (ou IP como reserva).
 * Simples de propósito: a área tem pouquíssimos usuários (operadores).
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(req: FastifyRequest, reply: FastifyReply): boolean {
  const header = req.headers.authorization ?? '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : req.ip;
  const now = Date.now();
  const slot = hits.get(key);

  if (!slot || slot.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  slot.count += 1;
  if (slot.count > MAX_PER_WINDOW) {
    reply.code(429).send({ error: 'Muitas requisições. Tente em instantes.' });
    return true;
  }
  return false;
}

/** Limpa o mapa de rate limit (uso em teste). */
export function _resetRateLimit(): void {
  hits.clear();
}
