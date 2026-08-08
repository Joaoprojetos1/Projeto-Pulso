/**
 * Aba Dados (itens 2.5 e 2.6): o dono envia quantos arquivos quiser, de quantos
 * meses quiser, cada um CLASSIFICADO por tipo, e vê a lista do que já enviou —
 * a transparência do insumo: o cliente vê exatamente o que o motor considera.
 *
 * O app segue burro: pega os bytes e manda ao servidor com o tipo. Quem LÊ é o
 * código do servidor. Hoje o leitor cobre o extrato bancário; os demais ficam
 * "recebidos" (guardados) até o leitor existir.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  deleteMyImport,
  fetchMyImports,
  importFile,
  type DocType,
  type ImportItem,
} from '@/lib/api';
import { escolherArquivos } from '@/lib/file-upload';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

const TIPOS: Array<{ id: DocType; label: string; hint: string }> = [
  { id: 'bank_statement', label: 'Extrato bancário', hint: 'Lido automaticamente (PDF ou OFX)' },
  { id: 'card_acquirer', label: 'Maquininha de cartão', hint: 'Vendas e agenda de recebíveis' },
  { id: 'inventory', label: 'Relatório de estoque', hint: 'Estoque / giro' },
  { id: 'management', label: 'Relatório gerencial', hint: 'Faturamento, movimento' },
  { id: 'services', label: 'Relatório de serviços', hint: 'Atendimentos / agenda' },
  { id: 'accounting', label: 'Documento contábil', hint: 'Balanço, DRE, balancete' },
  { id: 'other', label: 'Outro', hint: 'O motor avalia se é útil' },
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.id, t.label]));

function labelTipo(docType: string): string {
  return TIPO_LABEL[docType] ?? 'Extrato bancário';
}

function dataBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '—';
}

function periodo(a: string | null, b: string | null): string {
  if (!a && !b) return 'Período a apurar';
  if (a && b) return `${dataBR(a)} a ${dataBR(b)}`;
  return dataBR(a ?? b);
}

const SITUACAO: Record<string, { texto: string; cor: string }> = {
  processed: { texto: 'Processado', cor: colors.vivo },
  received: { texto: 'Recebido', cor: colors.alerta },
  error: { texto: 'Não consegui ler', cor: colors.critico },
};

export default function Dados() {
  const { token } = usePulso();
  const [tipo, setTipo] = useState<DocType>('bank_statement');
  const [itens, setItens] = useState<ImportItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!token) return;
    try {
      setItens(await fetchMyImports(token));
    } catch {
      // lista vazia é aceitável; não trava a tela
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function enviar() {
    if (!token || enviando) return;
    setErro('');
    setAviso('');
    let arquivos;
    try {
      arquivos = await escolherArquivos();
    } catch {
      setErro('Não consegui abrir seus arquivos. Tente de novo.');
      return;
    }
    if (arquivos.length === 0) return;

    setEnviando(true);
    let ok = 0;
    let falhas = 0;
    for (const arq of arquivos) {
      try {
        await importFile(token, arq.nome, arq.base64, tipo);
        ok += 1;
      } catch (e) {
        falhas += 1;
        setErro(e instanceof Error ? e.message : 'Um arquivo não pôde ser lido.');
      }
    }
    setEnviando(false);
    if (ok > 0) {
      setAviso(
        tipo === 'bank_statement'
          ? `${ok} arquivo(s) enviado(s) e lido(s). Seu painel foi atualizado.`
          : `${ok} arquivo(s) recebido(s). Vamos considerar assim que o leitor deste tipo entrar.`,
      );
    }
    if (falhas > 0 && ok === 0) setAviso('');
    await recarregar();
  }

  async function remover(id: string) {
    if (!token) return;
    setRemovendo(id);
    setConfirmar(null);
    try {
      await deleteMyImport(token, id);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui remover.');
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Seus dados</Text>
        <Text style={styles.sub}>
          Envie quantos arquivos quiser, de quantos meses precisar. Diga o tipo de cada um — assim o
          Pulso sabe o que fazer com ele.
        </Text>

        <Text style={styles.rotulo}>Tipo do arquivo</Text>
        <View style={styles.tipos}>
          {TIPOS.map((t) => {
            const on = tipo === t.id;
            return (
              <Pressable key={t.id} style={[styles.tipo, on && styles.tipoOn]} onPress={() => setTipo(t.id)}>
                <Text style={[styles.tipoLabel, on && styles.tipoLabelOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.tipoHint}>{TIPOS.find((t) => t.id === tipo)?.hint}</Text>

        <Pressable
          style={({ pressed }) => [styles.botao, enviando && styles.botaoOff, pressed && styles.pressionado]}
          onPress={enviar}
          disabled={enviando}
        >
          {enviando ? (
            <ActivityIndicator color="#06231A" />
          ) : (
            <Text style={styles.botaoTexto}>Escolher arquivos e enviar</Text>
          )}
        </Pressable>

        {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        {/* fim da digitação: o custo fixo vem por confirmação do que o motor
            identificou nos arquivos, não digitado em branco */}
        <Pressable
          style={({ pressed }) => [styles.custoFixo, pressed && styles.pressionado]}
          onPress={() => router.push('/custo-fixo' as Href)}
        >
          <Ionicons name="repeat-outline" size={20} color={colors.mata} />
          <View style={{ flex: 1 }}>
            <Text style={styles.custoFixoTitulo}>Custos fixos</Text>
            <Text style={styles.custoFixoDesc}>Revise os gastos que se repetem todo mês (o Pulso identifica dos seus arquivos).</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.cinza} />
        </Pressable>

        <Text style={styles.rotuloLista}>Arquivos enviados</Text>
        {carregando ? (
          <ActivityIndicator color={colors.vivo} style={{ marginTop: 16 }} />
        ) : itens.length === 0 ? (
          <View style={styles.vazio}>
            <Ionicons name="cloud-upload-outline" size={26} color={colors.cinza} />
            <Text style={styles.vazioTexto}>
              Nenhum arquivo ainda. O que você enviar aparece aqui, com a situação de cada um.
            </Text>
          </View>
        ) : (
          <View style={styles.lista}>
            {itens.map((it) => {
              const sit = SITUACAO[it.status] ?? SITUACAO.received!;
              return (
                <View key={it.id} style={styles.item}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.itemTipo}>{labelTipo(it.docType)}</Text>
                    {it.filename ? <Text style={styles.itemArquivo} numberOfLines={1}>{it.filename}</Text> : null}
                    <Text style={styles.itemMeta}>
                      {periodo(it.periodStart, it.periodEnd)} · enviado {dataBR(it.importedAt)}
                      {it.rowCount > 0 ? ` · ${it.rowCount} lançamentos` : ''}
                    </Text>
                    <View style={[styles.badge, { borderColor: sit.cor }]}>
                      <Text style={[styles.badgeTexto, { color: sit.cor }]}>{sit.texto}</Text>
                    </View>
                  </View>
                  {confirmar === it.id ? (
                    <View style={styles.confirma}>
                      <Pressable onPress={() => remover(it.id)}>
                        <Text style={styles.confirmaSim}>Remover</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirmar(null)}>
                        <Text style={styles.confirmaNao}>Cancelar</Text>
                      </Pressable>
                    </View>
                  ) : removendo === it.id ? (
                    <ActivityIndicator color={colors.cinza} />
                  ) : (
                    <Pressable onPress={() => setConfirmar(it.id)} hitSlop={10} accessibilityLabel="Remover arquivo">
                      <Ionicons name="trash-outline" size={20} color={colors.cinza} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 20, paddingBottom: 40, gap: 6 },
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.corpo, fontSize: 14.5, lineHeight: 21, color: colors.cinza, marginBottom: 6 },
  rotulo: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta, marginTop: 8 },
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tipo: { borderWidth: 1.5, borderColor: colors.linha, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: colors.branco },
  tipoOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  tipoLabel: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  tipoLabelOn: { color: colors.mata, fontFamily: fonts.corpoMedio },
  tipoHint: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, marginTop: 8 },

  botao: { backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  botaoOff: { opacity: 0.6 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15.5, color: '#06231A' },
  pressionado: { opacity: 0.85 },
  aviso: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.mata, marginTop: 10 },
  erro: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.critico, marginTop: 8 },

  custoFixo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderLeftWidth: 4,
    borderLeftColor: colors.vivo,
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
  },
  custoFixoTitulo: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  custoFixoDesc: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, lineHeight: 18 },
  rotuloLista: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta, marginTop: 22 },
  vazio: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza, textAlign: 'center', maxWidth: 260, lineHeight: 20 },

  lista: { gap: 10, marginTop: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    padding: 12,
  },
  itemTipo: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  itemArquivo: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  itemMeta: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeTexto: { fontFamily: fonts.corpoMedio, fontSize: 11 },
  confirma: { alignItems: 'flex-end', gap: 6 },
  confirmaSim: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.critico },
  confirmaNao: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
});
