import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';

/** Tipos de imagem aceitos e limite de tamanho (a foto já vem reduzida a 256px). */
const MIMES = ['image/jpeg', 'image/png'] as const;
const MAX_BYTES = 400 * 1024; // 400 KB — folga confortável para 256px

/**
 * Tipo REAL pelos bytes mágicos (não confia no mime declarado pelo cliente).
 * PNG: 89 50 4E 47 ; JPEG: FF D8 FF. Qualquer outra coisa é rejeitada.
 */
function tipoReal(bytes: Buffer): 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

const avatarBodySchema = {
  type: 'object',
  required: ['dataBase64', 'mime'],
  additionalProperties: false,
  properties: {
    dataBase64: { type: 'string', minLength: 1 },
    mime: { type: 'string', enum: MIMES },
  },
} as const;

/**
 * Foto do avatar do negócio.
 *
 * O app manda a imagem já reduzida (256px) em base64; guardamos os bytes ligados
 * à empresa do dono logado (escopado pelo token, nunca por id na URL). Na leitura
 * devolvemos como data URI para o app só desenhar — sem lógica no cliente.
 */
export function registerAvatar(app: FastifyInstance, sql: Sql) {
  // envia/atualiza a foto
  app.post<{ Body: { dataBase64: string; mime: string } }>(
    '/me/avatar',
    { schema: { body: avatarBodySchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login para mudar a foto.' });

      let bytes: Buffer;
      try {
        bytes = Buffer.from(req.body.dataBase64, 'base64');
      } catch {
        return reply.code(400).send({ error: 'Imagem inválida.' });
      }
      if (bytes.length === 0) return reply.code(400).send({ error: 'Imagem vazia.' });
      if (bytes.length > MAX_BYTES) {
        return reply.code(413).send({ error: 'Imagem muito grande.' });
      }
      // tipo REAL pelos bytes: barra arquivo disfarçado de imagem (mime spoofado)
      const real = tipoReal(bytes);
      if (!real || real !== req.body.mime) {
        return reply.code(400).send({ error: 'Imagem inválida (o tipo do arquivo não confere).' });
      }

      await sql`
        UPDATE companies
        SET avatar_data = ${bytes}, avatar_mime = ${req.body.mime}
        WHERE id = ${company.id}`;
      return reply.code(200).send({ saved: true });
    },
  );

  // lê a foto atual (data URI) ou null se não houver
  app.get('/me/avatar', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });

    const [row] = await sql`
      SELECT avatar_data, avatar_mime FROM companies WHERE id = ${company.id}`;
    const data = row?.avatar_data as Buffer | null | undefined;
    const mime = row?.avatar_mime as string | null | undefined;
    if (!data || !mime) return reply.code(200).send({ dataUri: null });

    return reply.code(200).send({
      dataUri: `data:${mime};base64,${Buffer.from(data).toString('base64')}`,
    });
  });

  // remove a foto (volta para as iniciais)
  app.delete('/me/avatar', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    await sql`
      UPDATE companies SET avatar_data = NULL, avatar_mime = NULL WHERE id = ${company.id}`;
    return reply.code(200).send({ removed: true });
  });
}
