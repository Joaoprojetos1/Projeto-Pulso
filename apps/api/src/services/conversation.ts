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

import type { ClaimPermission } from '@pulso/core';

import {
  askPulso,
  CHAT_FALLBACK_VERSION,
  DEFAULT_CHAT_HISTORY_N,
  NO_DATA_REPLY,
  type ChatContext,
  type ChatModel,
  type ChatReply,
  type ChatTurn,
} from '../ai/chat';
import { recordAiUsage, type AiCallUsage } from '../ai/usage';
import type { Sql } from '../db';
import { findCompany, type CompanyRow } from '../http';
import { assertWithinChatQuota } from '../quota';
import { EMPTY_SPECIALIST, loadSpecialistContext, type SpecialistContext } from './specialist';

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

/**
 * Higieniza a mensagem do dono antes de chegar ao modelo (defesa em profundidade
 * contra prompt injection): tira bytes nulos e caracteres de controle (mantém
 * quebra de linha e tab), colapsa espaços em excesso e impõe um teto duro de
 * tamanho — mesmo que o schema mude. A defesa principal continua sendo o system
 * prompt (papéis separados) + o fiscal de grounding sobre números.
 */
export function sanitizeUserMessage(raw: string): string {
  // remove bytes nulos e caracteres de controle (mantem quebra de linha e tab)
  const controle = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');
  return raw.replace(controle, ' ').replace(/[ \t]{4,}/g, '   ').trim().slice(0, 2000);
}

/** A empresa não existe (id inválido). A casca do canal decide o código HTTP. */
export class CompanyNotFoundError extends Error {
  constructor(public readonly companyId: string) {
    super('company_not_found');
    this.name = 'CompanyNotFoundError';
  }
}

interface SnapshotRow {
  id: string;
  as_of: string;
  payload: unknown;
  diagnosis: unknown;
}

type StoredDiagnosis = {
  stage: string;
  facts?: unknown;
  drivers?: unknown;
  text?: { title?: string | null; body?: string | null } | null;
  permissions?: ClaimPermission[];
} | null;

async function latestSnapshot(sql: Sql, companyId: string): Promise<SnapshotRow | undefined> {
  const [snapshot] = await sql`
    SELECT id, as_of::text AS as_of, payload, diagnosis
    FROM indicator_snapshots
    WHERE company_id = ${companyId}
    ORDER BY as_of DESC
    LIMIT 1`;
  return snapshot as SnapshotRow | undefined;
}

/**
 * Monta o RETRATO da empresa para a conversa: indicadores, alertas, diagnóstico
 * atual e anterior, permissões de juízo e cadastro. Fonte única, usada pela
 * conversa do dono e pela bancada de teste do especialista (assim o que ele
 * testa é exatamente o que o dono recebe).
 */
async function loadChatContext(
  sql: Sql,
  company: CompanyRow,
  snapshot: SnapshotRow,
): Promise<{ context: ChatContext; stage: string | null; ruleKeys: string[] }> {
  const companyId = company.id;

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
  const diagCurrent = snapshot.diagnosis as StoredDiagnosis;
  // requisitos de juízo gravados no snapshot: a conversa não pode adjetivar o
  // que a cobertura não autoriza (mesmo fiscal dos alertas/diagnóstico).
  const permissions = diagCurrent?.permissions ?? [];
  const [prevSnap] = await sql`
    SELECT as_of::text AS as_of, diagnosis
    FROM indicator_snapshots
    WHERE company_id = ${companyId} AND as_of < ${snapshot.as_of}
    ORDER BY as_of DESC
    LIMIT 1`;
  const diagPrevious = (prevSnap?.diagnosis as StoredDiagnosis) ?? null;

  // dados CADASTRAIS (do CNPJ): contexto qualitativo para a IA saber com quem
  // fala. Só texto (razão social, situação, ramo, sócios) — nenhum número
  // financeiro, então não afrouxa o fiscal de grounding.
  const socios = Array.isArray(company.quadro_societario)
    ? (company.quadro_societario as Array<{ nome?: string; qualificacao?: string | null }>)
        .map((soc) => (soc.qualificacao ? `${soc.nome} (${soc.qualificacao})` : soc.nome))
        .filter((x): x is string => Boolean(x && x.trim()))
        .slice(0, 10)
    : [];
  const temCadastro =
    Boolean(company.razao_social || company.situacao_cadastral || company.cnae_descricao) ||
    socios.length > 0;
  const cadastro = temCadastro
    ? {
        razaoSocial: company.razao_social ?? null,
        situacao: company.situacao_cadastral ?? null,
        ramo: company.cnae_descricao ?? null,
        socios,
      }
    : null;

  const context: ChatContext = {
    profile: { name: company.name, niche: company.niche },
    cadastro,
    asOf: snapshot.as_of,
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
          asOf: snapshot.as_of,
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
    permissions,
  };

  return {
    context,
    stage: diagCurrent?.stage ?? null,
    ruleKeys: alertRows.map((a) => a.rule_key as string),
  };
}

export async function converse(deps: ConversationDeps, input: ConverseInput): Promise<ConverseResult> {
  const { sql, chatModel } = deps;
  const { companyId } = input;
  // defesa em profundidade contra prompt injection nos campos que chegam ao modelo
  const userMessage = sanitizeUserMessage(input.userMessage);
  // `channel` fica reservado: hoje app e whatsapp compartilham o mesmo cérebro,
  // sem diferença de comportamento (item de arquitetura, não de conteúdo).

  const company = await findCompany(sql, companyId);
  if (!company) throw new CompanyNotFoundError(companyId);

  const snapshot = await latestSnapshot(sql, companyId);
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

  const { context, stage, ruleKeys } = await loadChatContext(sql, company, snapshot);

  // o que o especialista ensinou para esta situação (só o PUBLICADO). Best-effort:
  // se a leitura falhar, a conversa segue como antes, sem orientação.
  let specialist: SpecialistContext = EMPTY_SPECIALIST;
  try {
    specialist = await loadSpecialistContext(sql, {
      niche: company.niche,
      stage,
      ruleKeys,
      question: userMessage,
    });
  } catch {
    // orientar não pode quebrar responder
  }

  const aiUsage: AiCallUsage[] = [];
  const answer = await askPulso(chatModel, { ...context, specialist }, history, (u) => aiUsage.push(u));

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

// ---------------------------------------------------------------
// Bancada do especialista: perguntar ao Ivo "como se fosse" o dono
// ---------------------------------------------------------------

export interface SpecialistTrialInput {
  companyId: string;
  question: string;
  /** Usa os rascunhos no lugar do publicado, para testar antes de valer. */
  includeDrafts: boolean;
}

export interface SpecialistTrialResult {
  reply: string;
  modelVersion: string;
  /** Há retrato calculado para esta empresa? Sem ele, o Ivo não responde. */
  hasData: boolean;
  stage: string | null;
  /** O que cada fiscal pegou, quando a resposta do modelo foi trocada pela segura. */
  blocked: ChatReply['blocked'] | null;
  /** As orientações e os exemplos que entraram nesta resposta. */
  applied: SpecialistContext;
}

/**
 * Ensaio do especialista: a MESMA montagem de contexto e os MESMOS fiscais da
 * conversa do dono, mas sem efeito colateral. Não grava na memória da empresa,
 * não conta na cota dela e não entra na medição de consumo (o volume é mínimo:
 * só operadores chegam aqui). A pergunta é respondida sem histórico, para o
 * resultado depender só do retrato e do que foi ensinado.
 */
export async function converseAsSpecialist(
  deps: ConversationDeps,
  input: SpecialistTrialInput,
): Promise<SpecialistTrialResult> {
  const { sql, chatModel } = deps;
  const question = sanitizeUserMessage(input.question);

  const company = await findCompany(sql, input.companyId);
  if (!company) throw new CompanyNotFoundError(input.companyId);

  const snapshot = await latestSnapshot(sql, input.companyId);
  if (!snapshot) {
    return {
      reply: NO_DATA_REPLY,
      modelVersion: CHAT_FALLBACK_VERSION,
      hasData: false,
      stage: null,
      blocked: null,
      applied: EMPTY_SPECIALIST,
    };
  }

  const { context, stage, ruleKeys } = await loadChatContext(sql, company, snapshot);
  const specialist = await loadSpecialistContext(sql, {
    niche: company.niche,
    stage,
    ruleKeys,
    question,
    includeDrafts: input.includeDrafts,
  });

  const answer = await askPulso(chatModel, { ...context, specialist }, [
    { role: 'user', content: question },
  ]);

  return {
    reply: answer.text,
    modelVersion: answer.modelVersion,
    hasData: true,
    stage,
    blocked: answer.blocked ?? null,
    applied: specialist,
  };
}
