import { existsSync } from 'node:fs';

import EmbeddedPostgres from 'embedded-postgres';

/**
 * Sobe um Postgres local para desenvolvimento, sem instalar nada na máquina.
 * Dados ficam em .pgdata/ (fora do git). Ctrl+C para parar.
 */
const pg = new EmbeddedPostgres({
  databaseDir: '.pgdata',
  user: 'pulso',
  password: 'pulso',
  port: 5433,
  persistent: true,
});

if (!existsSync('.pgdata/PG_VERSION')) {
  console.log('Primeira vez: preparando o banco local...');
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('pulso');
} catch {
  // já existe
}

console.log('Banco local no ar: postgres://pulso:pulso@localhost:5433/pulso');
console.log('Use este valor em DATABASE_URL (veja .env.example). Ctrl+C para parar.');

process.on('SIGINT', () => {
  void pg.stop().then(() => process.exit(0));
});
