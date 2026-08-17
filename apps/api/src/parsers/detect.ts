/**
 * Detector de formato de EXTRATO BANCÁRIO → escolhe o leitor certo.
 *
 * O dono sobe um arquivo; aqui decidimos, pelo CONTEÚDO (não pela extensão, que
 * mente), qual parser roda. Escopo: extrato bancário (Inter PDF, Santander PDF,
 * OFX de qualquer banco). Relatório de sistema (Microvix) e outros formatos são
 * recusados com mensagem clara — têm outro caminho.
 */

import { parseInterStatement } from './inter-pdf';
import { parseOfx } from './ofx';
import { parseSantanderStatement } from './santander-pdf';
import { parseBankSpreadsheet } from './statement-table';
import { extractPdfText } from './pdf-text';
import { ParseError, type BankStatementResult } from './types';

export async function detectAndParseBankStatement(
  filename: string,
  buf: Buffer,
): Promise<BankStatementResult> {
  const head = buf.subarray(0, 2048).toString('latin1');

  if (head.startsWith('%PDF')) {
    const text = await extractPdfText(buf);
    if (/banco inter|\binter\b.*ag[êe]ncia|Saldo do dia:/i.test(text)) {
      return parseInterStatement(text);
    }
    if (/santander|internet banking empresarial|Conta Corrente > Extrato/i.test(text)) {
      return parseSantanderStatement(text);
    }
    throw new ParseError(
      'PDF de banco não reconhecido. Hoje leio extrato do Inter e do Santander; ' +
        'para outros bancos, envie o arquivo OFX.',
    );
  }

  // .xlsx é um ZIP (assinatura "PK"): extrato em Excel → leitor de planilha.
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (isZip) {
    return parseBankSpreadsheet(buf);
  }

  // não-PDF, não-ZIP: OFX é texto (ASCII/latin-1). HTML seria relatório de sistema.
  const text = buf.toString('utf8');
  if (/<OFX>|OFXHEADER/i.test(text)) {
    return parseOfx(text);
  }
  if (/^\s*<html/i.test(text) || /<table[\s>]/i.test(text)) {
    throw new ParseError(
      'Isto parece um relatório do sistema de gestão (planilha/HTML), não um extrato ' +
        'bancário. Esse tipo de arquivo entra por outro caminho.',
    );
  }
  // CSV: extrato bancário em planilha de texto → leitor de planilha.
  if (/[;,\t]/.test(text.split(/\r?\n/)[0] ?? '')) {
    return parseBankSpreadsheet(buf);
  }
  throw new ParseError(
    `Formato não reconhecido${filename ? ` ("${filename}")` : ''}. ` +
      'Envie um extrato bancário em CSV, Excel (.xlsx), OFX ou PDF (Inter/Santander).',
  );
}
