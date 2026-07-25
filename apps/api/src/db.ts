import postgres from 'postgres';

/**
 * Conexão com o Postgres.
 *
 * Dinheiro é BIGINT em centavos no banco. O postgres.js devolveria string;
 * aqui convertemos para number com checagem de segurança — se algum valor
 * estourar o inteiro seguro do JS, é melhor falhar alto do que arredondar
 * dinheiro em silêncio.
 */
export function createSql(url: string) {
  // Bancos gerenciados (Neon e afins) exigem conexão TLS; o Postgres local de
  // dev/teste roda sem. Liga o SSL quando o host não é a própria máquina.
  let isLocal = false;
  try {
    const host = new URL(url).hostname;
    isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    isLocal = false;
  }

  return postgres(url, {
    ssl: isLocal ? false : 'require',
    // pool dimensionado e com timeouts: Neon free tem poucas conexões; falhar
    // rápido é melhor do que pendurar a requisição. Ajustável por PGPOOL_MAX.
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idle_timeout: 20, // segundos: fecha conexões ociosas (libera o pool do Neon)
    connect_timeout: 10, // segundos: falha rápido se o banco não responde
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number | bigint) => String(v),
        parse: (v: string) => {
          const n = Number(v);
          if (!Number.isSafeInteger(n)) {
            throw new Error(`Valor bigint fora do intervalo seguro do JS: ${v}`);
          }
          return n;
        },
      },
    },
  });
}

export type Sql = ReturnType<typeof createSql>;
