import { hashPassword, hashToken, newToken } from '../src/auth';
import type { Sql } from '../src/db';

/**
 * Cria um operador (usuário com papel admin) e devolve um token de sessão CRU,
 * pronto para o cabeçalho Authorization: Bearer <token>.
 *
 * As rotas de operação e ingestão (/companies/:id/*) exigem papel admin — só o
 * operador carrega/recalcula dados de uma empresa por id. O dono usa /me/*.
 * Os testes e o seed autenticam-se por aqui para usar essa superfície.
 */
export async function seedAdminToken(
  sql: Sql,
  email = 'operador@pulso.teste',
): Promise<string> {
  const token = newToken();
  await sql.begin(async (tx) => {
    const [c] = await tx`
      INSERT INTO companies (name) VALUES ('Operação Pulso') RETURNING id`;
    const [u] = await tx`
      INSERT INTO users (email, password_hash, company_id, role)
      VALUES (${email}, ${hashPassword('operador-teste-123')}, ${c.id}, 'admin')
      RETURNING id`;
    await tx`INSERT INTO auth_tokens (token_hash, user_id) VALUES (${hashToken(token)}, ${u.id})`;
  });
  return token;
}

/** Cabeçalho de autenticação Bearer para um token cru. */
export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
