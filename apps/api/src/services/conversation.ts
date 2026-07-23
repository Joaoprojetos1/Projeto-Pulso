/**
 * O CÉREBRO da conversa — independente de canal.
 *
 * Um só lugar monta o contexto (snapshot + memória + alertas + diagnóstico),
 * aplica a cota, chama askPulso (com o fiscal), grava o histórico e mede o
 * consumo. O app e, no futuro, o WhatsApp são apenas CANAIS que chamam
 * `converse` — nunca uma segunda IA. Mudar o transporte não muda o cérebro.
 *
 * Extraído de routes/chat.ts sem mudar comportamento.
 */

import {
  askPulso,
  CHAT_FALLBACK_VERSION,
  DEFAULT_CHAT_HISTORY_N,
  NO_DATA_REPLY,
  type ChatModel,
  type ChatTurn,
} from '../ai/chat';
import { recordAiUsage, type AiCallUsage } from '../ai/usage';
import type { Sql } from '../db';
import { findCompany } from '../http';
import { assertWithinChatQuota } from '../quota';

export type ConversationChannel = 'app' | 'whatsapp';

export interface ConverseInput {
  companyId: string;
  userMessage: string;
  channel: ConversationChannel;
}

export interface ConverseResult {
  reply: string;
  modelVersion: string;
}

export interface ConversationDeps {
  sql: Sql;
  chatModel: ChatModel | null;
}

/** A empresa não existe (id inválido). A casca do canal decide o código HTTP. */
export class CompanyNotFoundError extends Error {
  constructor(public readonly companyId: string) {
    super('company_not_found');
    this.name = 'CompanyNotFoundError';
  }
}

export async function converse(deps: ConversationDeps, input: ConverseInput): Promise<ConverseResult> {
  const { sql, chatModel } = deps;
  const { companyId, userMessage } = input;
  // `channel` fica reservado: hoje app e whatsapp compartilham o mesmo cérebro,
  // sem diferença de comportamento (item de arquitetura, não de conteúdo).

  const company = await findCompany(sql, companyId);
  if (!company) throw new CompanyNotFoundError(companyId);

  const [snapshot] = await sql`
    SELECT id, as_of::text AS as_of, payload, diagnosis
    FROM indicator_snapshots
    WHERE company_id = ${companyId}
    ORDER BY as_of DESC
    LIMIT 1`;

  if (!snapshot) {
    return { reply: NO_DATA_REPLY, modelVersion: CHAT_FALLBACK_VERSION };
  }

  // cota mensal: estourou → lança QuotaExceededError (a casca devolve 402) e a IA
  // nunca é chamada.
  await assertWithinChatQuota(sql, companyId);

  // MEMÓRIA — grava a nova pergunta ANTES de carregar o histórico
  await sql`
    INSERT INTO chat_messages (company_id, role, content)
    VALUES (${companyId}, 'user', ${userMessage})`;

  // (a) últimas N mensagens da conversa (o servidor é a fonte da memória)
  const histRows = await sql`
    SELECT role, content
    FROM chat_messages
    WHERE company_id = ${companyId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${DEFAULT_CHAT_HISTORY_N}`;
  const history: ChatTurn[] = histRows
    .reverse()
    .map((r) => ({ role: r.role as ChatTurn['role'], content: r.content as string }));

  const alertRows = await sql`
    SELECT rule_key, severity::text AS severity, facts, text_title, text_body
    FROM alerts
    WHERE snapshot_id = ${snapshot.id}
    ORDER BY CASE severity::text WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END`;

  // (b) últimos 3 alertas ENVIADOS (de qualquer snapshot)
  const recentAlertRows = await sql`
    SELECT rule_key, severity::text AS severity, facts, text_title, text_body
    FROM alerts
    WHERE company_id = ${companyId}
    ORDER BY created_at DESC
    LIMIT 3`;

  // (c) diagnóstico atual (deste snapshot) e o anterior
  const diagCurrent = snapshot.diagnosis as {
    stage: string;
    facts?: unknown;
    drivers?: unknown;
    text?: { title?: string | null; body?: string | null } | null;
  } | null;
  const [prevSnap] = await sql`
    SELECT as_of::text AS as_of, diagnosis
    FROM indicator_snapshots
    WHERE company_id = ${companyId} AND as_of < ${snapshot.as_of}
    ORDER BY as_of DESC
    LIMIT 1`;
  const diagPrevious = (prevSnap?.diagnosis as typeof diagCurrent) ?? null;

  const aiUsage: AiCallUsage[] = [];
  const answer = await askPulso(
    chatModel,
    {
      profile: { name: company.name, niche: company.niche },
      asOf: snapshot.as_of as string,
      indicators: snapshot.payload,
      alerts: alertRows.map((a) => ({
        ruleKey: a.rule_key,
        severity: a.severity,
        facts: a.facts,
        title: a.text_title,
        body: a.text_body,
      })),
      recentAlerts: recentAlertRows.map((a) => ({
        ruleKey: a.rule_key as string,
        severity: a.severity as string,
        facts: a.facts,
        title: (a.text_title as string | null) ?? null,
        body: (a.text_body as string | null) ?? null,
      })),
      diagnosisCurrent: diagCurrent
        ? {
            asOf: snapshot.as_of as string,
            stage: diagCurrent.stage,
            facts: diagCurrent.facts,
            drivers: diagCurrent.drivers,
            text: diagCurrent.text ?? null,
          }
        : null,
      diagnosisPrevious: diagPrevious
        ? {
            asOf: (prevSnap?.as_of as string | undefined) ?? null,
            stage: diagPrevious.stage,
            facts: diagPrevious.facts,
            drivers: diagPrevious.drivers,
            text: diagPrevious.text ?? null,
          }
        : null,
    },
    history,
    (u) => aiUsage.push(u),
  );

  // MEMÓRIA — grava a resposta do Pulso
  await sql`
    INSERT INTO chat_messages (company_id, role, content)
    VALUES (${companyId}, 'assistant', ${answer.text})`;

  // medição do consumo da IA (best-effort): nunca derruba a conversa
  try {
    await recordAiUsage(sql, companyId, 'chat', aiUsage);
  } catch {
    // medir não pode quebrar responder
  }

  return { reply: answer.text, modelVersion: answer.modelVersion };
}
