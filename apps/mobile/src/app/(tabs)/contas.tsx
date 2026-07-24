/**
 * Contas — a camada de PLANEJAMENTO do dono (a receber e a pagar).
 *
 * Tudo aqui é PREVISÃO: o dono cadastra o que espera receber/pagar. Nada disto
 * é o "realizado" (extrato) — uma conta só vira verdade quando o dono confirma
 * que aconteceu (graduação). O app não calcula nada: só cadastra e desenha.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  confirmarConta,
  criarConta,
  editarConta,
  excluirConta,
  fetchContas,
  type ContaJson,
  type ContaKind,
} from '@/lib/api';
import { textoParaCents } from '@/components/money-input';
import { toqueSucesso } from '@/lib/haptic';
import { brl, dataBR, hojeISO } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

// categorias neutras (público indefinido, sem termos de setor)
const CATEGORIAS: Record<ContaKind, string[]> = {
  receivable: ['cliente', 'cartão', 'pix/boleto', 'outro'],
  payable: ['fornecedor', 'aluguel', 'equipe', 'outro'],
};

const PRAZOS: Array<{ rotulo: string; dias: number }> = [
  { rotulo: 'Hoje', dias: 0 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '15 dias', dias: 15 },
  { rotulo: '30 dias', dias: 30 },
  { rotulo: '45 dias', dias: 45 },
  { rotulo: '60 dias', dias: 60 },
];

function emIso(diasAFrente: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return hojeISO(d); // data LOCAL do aparelho (não UTC): "Hoje" não pula à noite
}

function reaisParaCents(txt: string): number | null {
  // conversão por STRING (regra do projeto: dinheiro é centavo inteiro, nunca float)
  const cents = textoParaCents(txt);
  return cents && cents > 0 ? cents : null;
}

/** Máscara de data ao digitar: só dígitos, "25102026" vira "25/10/2026". */
function mascaraData(txt: string): string {
  const d = txt.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Data livre digitada (DD/MM/AAAA) para ISO; null se inválida. */
function ddmmParaIso(txt: string): string | null {
  const m = txt.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCDate() !== Number(d) || dt.getUTCMonth() + 1 !== Number(mo)) return null;
  return iso;
}
function isoParaDDMM(iso: string): string {
  const [y, mo, d] = iso.split('-');
  return `${d}/${mo}/${y}`;
}
function centsParaCampo(cents: number): string {
  // por string, sem float: "123456" → "1234,56"
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, '0');
  return `${reais},${c}`;
}

const rotuloStatus: Record<ContaJson['status'], string> = {
  prevista: 'Prevista',
  vencida: 'Venceu, confirmar?',
  realizada: 'Aconteceu',
};
const corStatus: Record<ContaJson['status'], string> = {
  prevista: colors.cinza,
  vencida: colors.alerta,
  realizada: colors.okEscuro,
};

export default function Contas() {
  const { token } = usePulso();
  const [visao, setVisao] = useState<ContaKind>('receivable');
  const [contas, setContas] = useState<ContaJson[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<ContaJson | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      setContas(await fetchContas(token, visao));
    } catch {
      setErro('Não consegui carregar suas contas agora.');
    } finally {
      setCarregando(false);
    }
  }, [token, visao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // sem login (demonstração): as contas ficam na conta de verdade
  if (!token) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.tituloSozinho}>Contas</Text>
        <View style={styles.vazio}>
          <Ionicons name="receipt-outline" size={30} color={colors.cinza} />
          <Text style={styles.vazioTexto}>
            O cadastro de contas fica guardado na sua conta. Entre ou crie a sua para começar a
            planejar o que tem a receber e a pagar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>Contas</Text>
        <View style={styles.previsaoTag}>
          <Text style={styles.previsaoTagTexto}>PLANEJAMENTO · PREVISÃO</Text>
        </View>
      </View>

      {/* alternador a receber / a pagar */}
      <View style={styles.abas}>
        <Aba ativo={visao === 'receivable'} onPress={() => setVisao('receivable')} texto="A receber" />
        <Aba ativo={visao === 'payable'} onPress={() => setVisao('payable')} texto="A pagar" />
      </View>

      <ScrollView
        contentContainerStyle={styles.lista}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      >
        {(mostrarForm || editando) && (
          <ContaForm
            visao={visao}
            token={token}
            conta={editando ?? undefined}
            onPronto={() => {
              setMostrarForm(false);
              setEditando(null);
              void carregar();
            }}
            onCancelar={() => {
              setMostrarForm(false);
              setEditando(null);
            }}
          />
        )}

        {!mostrarForm && !editando && (
          <Pressable
            style={({ pressed }) => [styles.novo, pressed && styles.pressionado]}
            onPress={() => setMostrarForm(true)}
          >
            <Ionicons name="add" size={18} color={colors.papel} />
            <Text style={styles.novoTexto}>
              Nova conta {visao === 'receivable' ? 'a receber' : 'a pagar'}
            </Text>
          </Pressable>
        )}

        {erro && <Text style={styles.erro}>{erro}</Text>}

        {!carregando && contas.length === 0 && !erro && (
          <Text style={styles.semContas}>
            Nada cadastrado ainda. Adicione o que você {visao === 'receivable' ? 'espera receber' : 'tem a pagar'} para o Pulso projetar seu caixa.
          </Text>
        )}

        {contas.map((c) => (
          <ContaCard
            key={c.id}
            conta={c}
            token={token}
            onMudou={carregar}
            onEditar={(alvo) => {
              setMostrarForm(false);
              setEditando(alvo);
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Aba({ ativo, onPress, texto }: { ativo: boolean; onPress: () => void; texto: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.aba, ativo && styles.abaAtiva]}>
      <Text style={[styles.abaTexto, ativo && styles.abaTextoAtivo]}>{texto}</Text>
    </Pressable>
  );
}

function ContaCard({
  conta,
  token,
  onMudou,
  onEditar,
}: {
  conta: ContaJson;
  token: string;
  onMudou: () => void;
  onEditar: (c: ContaJson) => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setOcupado(true);
    try {
      await confirmarConta(token, conta.id);
      toqueSucesso();
      onMudou();
    } catch {
      setOcupado(false);
    }
  }
  async function excluir() {
    setOcupado(true);
    try {
      await excluirConta(token, conta.id);
      onMudou();
    } catch {
      setOcupado(false);
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.card}>
      <View style={styles.cardTopo}>
        <Text style={styles.cardValor}>{brl(conta.amountCents)}</Text>
        <View style={[styles.chipStatus, { borderColor: corStatus[conta.status] }]}>
          <Text style={[styles.chipStatusTexto, { color: corStatus[conta.status] }]}>
            {rotuloStatus[conta.status]}
          </Text>
        </View>
      </View>

      <Text style={styles.cardQuem}>
        {conta.counterparty ?? (conta.kind === 'receivable' ? 'Cliente não informado' : 'Fornecedor não informado')}
      </Text>
      <Text style={styles.cardDetalhe}>
        {conta.status === 'realizada' && conta.confirmedOn
          ? `Confirmada em ${dataBR(conta.confirmedOn)} · prevista ${dataBR(conta.dueOn)}`
          : `Prevista para ${dataBR(conta.dueOn)}`}
        {conta.category ? ` · ${conta.category}` : ''}
        {conta.natureza === 'recorrente' ? ' · recorrente' : ''}
      </Text>

      {conta.status !== 'realizada' && (
        <View style={styles.cardAcoes}>
          <Pressable
            style={({ pressed }) => [styles.confirmar, pressed && styles.pressionado]}
            onPress={confirmar}
            disabled={ocupado}
          >
            {ocupado ? (
              <ActivityIndicator color={colors.papel} size="small" />
            ) : (
              <Text style={styles.confirmarTexto}>
                {conta.kind === 'receivable' ? 'Confirmar que recebi' : 'Confirmar que paguei'}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={() => onEditar(conta)} hitSlop={8} disabled={ocupado} style={styles.excluir}>
            <Ionicons name="pencil-outline" size={18} color={colors.cinza} />
          </Pressable>
          <Pressable onPress={excluir} hitSlop={8} disabled={ocupado} style={styles.excluir}>
            <Ionicons name="trash-outline" size={18} color={colors.cinza} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

function ContaForm({
  visao,
  token,
  conta,
  onPronto,
  onCancelar,
}: {
  visao: ContaKind;
  token: string;
  conta?: ContaJson;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const editando = !!conta;
  const [valor, setValor] = useState(conta ? centsParaCampo(conta.amountCents) : '');
  const [quem, setQuem] = useState(conta?.counterparty ?? '');
  const [categoria, setCategoria] = useState<string | null>(conta?.category ?? null);
  const [prazoDias, setPrazoDias] = useState(30);
  const [dataManual, setDataManual] = useState(conta ? isoParaDDMM(conta.dueOn) : '');
  const [recorrente, setRecorrente] = useState(conta?.recurrence === 'monthly');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cents = reaisParaCents(valor);
  // a data digitada (se válida) vence os atalhos de prazo
  const isoManual = dataManual.trim() ? ddmmParaIso(dataManual) : null;
  const dataManualInvalida = dataManual.trim().length > 0 && isoManual === null;
  const dueOn = isoManual ?? emIso(prazoDias);
  const pode = cents !== null && !dataManualInvalida && !salvando;

  async function salvar() {
    if (cents === null) {
      setErro('Informe um valor válido.');
      return;
    }
    if (dataManualInvalida) {
      setErro('Data inválida. Use o formato DD/MM/AAAA.');
      return;
    }
    setSalvando(true);
    setErro(null);
    const dados = {
      amountCents: cents,
      dueOn,
      counterparty: quem.trim() || undefined,
      category: categoria ?? undefined,
      recurrence: (recorrente ? 'monthly' : 'none') as 'monthly' | 'none',
    };
    try {
      if (conta) await editarConta(token, conta.id, dados);
      else await criarConta(token, { kind: visao, ...dados });
      onPronto();
    } catch {
      setErro('Não consegui salvar agora. Tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.form}>
      <Text style={styles.formTitulo}>
        {editando
          ? 'Editar conta'
          : `Nova conta ${visao === 'receivable' ? 'a receber' : 'a pagar'}`}
      </Text>

      <Text style={styles.label}>VALOR (R$)</Text>
      <TextInput
        style={styles.input}
        value={valor}
        onChangeText={setValor}
        placeholder="0,00"
        placeholderTextColor={colors.cinza}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>{visao === 'receivable' ? 'CLIENTE' : 'FORNECEDOR'}</Text>
      <TextInput
        style={styles.input}
        value={quem}
        onChangeText={setQuem}
        placeholder={visao === 'receivable' ? 'Ex.: Cliente Silva' : 'Ex.: Distribuidora Alfa'}
        placeholderTextColor={colors.cinza}
      />

      <Text style={styles.label}>CATEGORIA</Text>
      <View style={styles.chipsLinha}>
        {CATEGORIAS[visao].map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategoria((a) => (a === cat ? null : cat))}
            style={[styles.chip, categoria === cat && styles.chipAtivo]}
          >
            <Text style={[styles.chipTexto, categoria === cat && styles.chipTextoAtivo]}>{cat}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>DATA PREVISTA</Text>
      <View style={styles.chipsLinha}>
        {PRAZOS.map((p) => (
          <Pressable
            key={p.rotulo}
            onPress={() => setPrazoDias(p.dias)}
            style={[styles.chip, prazoDias === p.dias && styles.chipAtivo]}
          >
            <Text style={[styles.chipTexto, prazoDias === p.dias && styles.chipTextoAtivo]}>
              {p.rotulo}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={[styles.input, { marginTop: 8 }, dataManualInvalida && styles.inputErro]}
        value={dataManual}
        onChangeText={(t) => setDataManual(mascaraData(t))}
        placeholder="ou digite uma data: DD/MM/AAAA"
        placeholderTextColor={colors.cinza}
        keyboardType="number-pad"
        maxLength={10}
      />
      <Text style={styles.dataEscolhida}>
        {dataManualInvalida ? 'Data inválida — use DD/MM/AAAA' : `Data prevista: ${dataBR(dueOn)}`}
      </Text>

      <Pressable style={styles.natureza} onPress={() => setRecorrente((v) => !v)}>
        <Ionicons
          name={recorrente ? 'checkbox' : 'square-outline'}
          size={20}
          color={recorrente ? colors.vivo : colors.cinza}
        />
        <Text style={styles.naturezaTexto}>
          Repete todo mês (recorrente). Ex.: aluguel, folha
        </Text>
      </Pressable>

      {erro && <Text style={styles.erro}>{erro}</Text>}

      <View style={styles.formAcoes}>
        <Pressable onPress={onCancelar} style={styles.cancelar} hitSlop={6}>
          <Text style={styles.cancelarTexto}>Cancelar</Text>
        </Pressable>
        <Pressable
          onPress={salvar}
          disabled={!pode}
          style={({ pressed }) => [styles.salvar, (pressed || !pode) && styles.pressionado]}
        >
          {salvando ? (
            <ActivityIndicator color={colors.papel} size="small" />
          ) : (
            <Text style={styles.salvarTexto}>{editando ? 'Salvar alterações' : 'Salvar previsão'}</Text>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
  },
  tituloSozinho: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  previsaoTag: {
    backgroundColor: '#FDF3E3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previsaoTagTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.alerta },

  abas: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  aba: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.branco,
  },
  abaAtiva: { backgroundColor: colors.mata, borderColor: colors.mata },
  abaTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
  abaTextoAtivo: { color: colors.papel },

  lista: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },

  novo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 13,
  },
  novoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.papel },
  pressionado: { opacity: 0.85 },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza, textAlign: 'center' },
  semContas: {
    fontFamily: fonts.corpo,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.cinza,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  erro: { fontFamily: fonts.corpo, fontSize: 13, color: colors.critico, textAlign: 'center' },

  card: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardValor: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.tinta,
    fontVariant: ['tabular-nums'],
  },
  chipStatus: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipStatusTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6 },
  cardQuem: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.tinta },
  cardDetalhe: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  cardAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  confirmar: {
    flex: 1,
    backgroundColor: colors.vivo,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  confirmarTexto: { fontFamily: fonts.displayMedio, fontSize: 14, color: '#06231A' },
  excluir: { padding: 8 },

  form: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  formTitulo: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta, marginBottom: 4 },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.cinza, marginTop: 8 },
  input: {
    backgroundColor: colors.papel,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: colors.tinta,
  },
  inputErro: { borderColor: colors.critico },
  chipsLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.papel,
  },
  chipAtivo: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipTexto: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.cinza },
  chipTextoAtivo: { color: colors.okEscuro },
  dataEscolhida: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, marginTop: 6 },
  natureza: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  naturezaTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13, color: colors.tinta },
  formAcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  cancelar: { paddingVertical: 10, paddingHorizontal: 12 },
  cancelarTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
  salvar: {
    backgroundColor: colors.mata,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  salvarTexto: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.papel },
});
