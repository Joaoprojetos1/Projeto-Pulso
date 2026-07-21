import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { Sql } from './db';
import type { CompanyRow } from './http';

/**
 * Autenticação do dono (login de verdade).
 *
 * Senha: guardada só como hash scrypt ('salt:derivado' em hex). Nunca em texto.
 * Token de sessão: um valor aleatório entregue ao aparelho; no banco guardamos
 * só o sha256 dele — se o banco vazar, os tokens não servem.
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = scryptSync(password, salt, expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Descobre a empresa do dono logado a partir do cabeçalho Authorization.
 * Retorna null quando não há token válido — quem chama responde 401.
 */
export async function companyFromRequest(
  sql: Sql,
  req: FastifyRequest,
): Promise<CompanyRow | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const [row] = await sql`
    SELECT c.id, c.name, c.cnpj, c.niche, c.declared_fixed_cost_cents, c.created_at
    FROM auth_tokens t
    JOIN users u     ON u.id = t.user_id
    JOIN companies c ON c.id = u.company_id
    WHERE t.token_hash = ${hashToken(token)}`;
  return (row as CompanyRow | undefined) ?? null;
}
