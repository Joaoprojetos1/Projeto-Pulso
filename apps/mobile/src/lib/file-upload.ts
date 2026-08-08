/**
 * Escolher um arquivo no aparelho e lê-lo como base64, para mandar ao servidor.
 *
 * Usa módulos NATIVOS (expo-document-picker / expo-file-system) — só funciona em
 * app instalado (APK), não por atualização automática. O app segue burro: aqui
 * ele só pega os bytes; quem LÊ o conteúdo é o código do servidor (nunca a IA).
 */

import * as DocumentPicker from 'expo-document-picker';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface ArquivoEscolhido {
  nome: string;
  base64: string;
  tamanhoBytes: number;
}

/** Abre o seletor de arquivos e devolve o arquivo em base64 (ou null se cancelou). */
export async function escolherExtrato(): Promise<ArquivoEscolhido | null> {
  const res = await DocumentPicker.getDocumentAsync({
    // extrato: PDF (Inter/Santander) ou OFX. '*/*' porque OFX às vezes não tem MIME.
    type: ['application/pdf', 'application/x-ofx', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || res.assets.length === 0) return null;
  const asset = res.assets[0]!;
  const base64 = await lerBase64(asset.uri);
  return { nome: asset.name ?? 'extrato', base64, tamanhoBytes: asset.size ?? 0 };
}

/** Abre o seletor aceitando VÁRIOS arquivos (aba Dados). Devolve todos em base64. */
export async function escolherArquivos(): Promise<ArquivoEscolhido[]> {
  const res = await DocumentPicker.getDocumentAsync({
    // qualquer tipo: extrato, planilha, PDF, foto de documento
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (res.canceled || res.assets.length === 0) return [];
  const out: ArquivoEscolhido[] = [];
  for (const asset of res.assets) {
    const base64 = await lerBase64(asset.uri);
    out.push({ nome: asset.name ?? 'arquivo', base64, tamanhoBytes: asset.size ?? 0 });
  }
  return out;
}

async function lerBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('não consegui ler o arquivo'));
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
      r.readAsDataURL(blob);
    });
  }
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}
