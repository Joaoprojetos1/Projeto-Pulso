/**
 * Promove um usuário a admin (papel 'admin').
 *
 * O admin não se cadastra por um fluxo especial: é um dono que ganhou o papel.
 * Rode uma vez para cada operador (João e Marco), pelo e-mail com que se
 * cadastraram no app.
 *
 * Uso:  DATABASE_URL=... pnpm --filter @pulso/api promote-admin joao@exemplo.com
 */

import { createSql } from '../src/db';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Informe o e-mail: promote-admin <email>');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL (veja .env.example).');
  process.exit(1);
}

const sql = createSql(url);
const rows = await sql`UPDATE users SET role = 'admin' WHERE email = ${email} RETURNING id`;
if (rows.length === 0) {
  console.error(`Nenhum usuário com o e-mail ${email}. Cadastre-se no app primeiro.`);
} else {
  console.log(`OK: ${email} agora é admin.`);
}
await sql.end();
