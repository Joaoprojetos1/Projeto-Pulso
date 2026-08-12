/**
 * EnvioArquivos — upload de vários arquivos, classificados por tipo, com
 * progresso INDIVIDUAL por arquivo, e a lista do que já foi enviado (com remoção).
 *
 * Reusado no ONBOARDING (tela /enviar) e na ABA DADOS — a mesma experiência nos
 * dois lugares (itens 2.5/2.6). O app é burro: pega os bytes e manda com o tipo;
 * quem LÊ é o servidor. Hoje o leitor cobre o extrato bancário; os demais tipos
 * ficam "recebidos" até o leitor existir.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
  { id: 'payroll', label: 'Folha de pagamento', hint: 'Salários e encargos (custo fixo)' },
  { id: 'other', label: 'Outro', hint: 'O motor avalia se é útil' },
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.id, t.label]));
const labelTipo = (d: string) => TIPO_LABEL[d] ?? 'Extrato bancário';

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

type ProgressoArquivo = { nome: string; status: 'enviando' | 'ok' | 'erro'; msg?: string };

export function EnvioArquivos({ aoConcluir }: { aoConcluir?: () => void }) {
  const { token, carregar } = usePulso();
  const [tipo, setTipo] = useState<DocType>('bank_statement');
  const [itens, setItens] = useState<ImportItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoArquivo[]>([]);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!token) return;
    try {
      setItens(await fetchMyImports(token));
    } catch {
      /* lista vazia é aceitável */
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function enviar() {
    if (!token || enviando) return;
    setProgresso([]);
    let arquivos;
    try {
      arquivos = await escolherArquivos();
    } catch {
      setProgresso([{ nome: 'Arquivos', status: 'erro', msg: 'Não consegui abrir seus arquivos.' }]);
      return;
    }
    if (arquivos.length === 0) return;

    setEnviando(true);
    // progresso INDIVIDUAL: cada arquivo começa "enviando" e vira ok/erro
    setProgresso(arquivos.map((a) => ({ nome: a.nome, status: 'enviando' as const })));
    for (let i = 0; i < arquivos.length; i++) {
      const arq = arquivos[i]!;
      try {
        const r = await importFile(token, arq.nome, arq.base64, tipo);
        const msg = r.alreadyImported
          ? 'já tinha sido enviado'
          : tipo === 'bank_statement'
            ? `lido (${r.rowsImported ?? 0} lançamentos)`
            : 'recebido (leitura automática em breve)';
        setProgresso((p) => p.map((x, j) => (j === i ? { ...x, status: 'ok', msg } : x)));
      } catch (e) {
        setProgresso((p) =>
          p.map((x, j) => (j === i ? { ...x, status: 'erro', msg: e instanceof Error ? e.message : 'não deu' } : x)),
        );
      }
    }
    setEnviando(false);
    await recarregar();
    await carregar(); // atualiza o painel (o motor recalculou com os arquivos lidos)
    aoConcluir?.();
  }

  async function remover(id: string) {
    if (!token) return;
    setRemovendo(id);
    setConfirmar(null);
    try {
      await deleteMyImport(token, id);
      await recarregar();
      await carregar();
    } catch {
      /* silencioso */
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <View style={{ gap: 6 }}>
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
      <Text style={styles.multiNota}>Pode escolher vários de uma vez, de meses diferentes.</Text>

      {/* progresso por arquivo */}
      {progresso.length > 0 && (
        <View style={styles.progresso}>
          {progresso.map((p, i) => (
            <View key={i} style={styles.progItem}>
              {p.status === 'enviando' ? (
                <ActivityIndicator size="small" color={colors.cinza} />
              ) : (
                <Ionicons
                  name={p.status === 'ok' ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                  color={p.status === 'ok' ? colors.vivo : colors.critico}
                />
              )}
              <Text style={styles.progNome} numberOfLines={1}>{p.nome}</Text>
              {p.msg ? <Text style={styles.progMsg} numberOfLines={1}>{p.msg}</Text> : null}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.rotuloLista}>Arquivos enviados</Text>
      {carregando ? (
        <ActivityIndicator color={colors.vivo} style={{ marginTop: 12 }} />
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  multiNota: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza, textAlign: 'center', marginTop: 6 },

  progresso: { gap: 6, marginTop: 12, backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, padding: 12 },
  progItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progNome: { flex: 1, fontFamily: fonts.corpo, fontSize: 13, color: colors.tinta },
  progMsg: { fontFamily: fonts.corpo, fontSize: 11.5, color: colors.cinza },

  rotuloLista: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta, marginTop: 22 },
  vazio: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza, textAlign: 'center', maxWidth: 260, lineHeight: 20 },

  lista: { gap: 10, marginTop: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, padding: 12 },
  itemTipo: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  itemArquivo: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  itemMeta: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeTexto: { fontFamily: fonts.corpoMedio, fontSize: 11 },
  confirma: { alignItems: 'flex-end', gap: 6 },
  confirmaSim: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.critico },
  confirmaNao: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
});
