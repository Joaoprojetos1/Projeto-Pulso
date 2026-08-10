/**
 * Novo onboarding (item 2.3+): logo após o cadastro, montamos o retrato da
 * empresa antes de qualquer número.
 *
 *   1. CNPJ  → o servidor consulta a base pública e traz razão social, CNAE etc.
 *   2. Segmento → sugerido pelo CNAE, o dono confirma ou corrige.
 *   3. Sistemas → o que usa para contas, estoque, serviços e banco (orienta o parser).
 *   4. Diagnóstico + envio de dados.
 *
 * O app segue burro: manda o CNPJ, o servidor consulta e grava. Validação
 * aparece NO CAMPO (item 2.2), nunca em alerta genérico nem em silêncio.
 */

import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulsoLogo } from '@/components/logo';
import {
  CampoError,
  lookupMyCnpj,
  patchMyCompany,
  saveMyCompanySystems,
  type CnpjLookupResult,
  type CompanySystem,
  type ExportFormat,
  type SystemPurpose,
} from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

const PASSOS = ['CNPJ', 'Segmento', 'Sistemas', 'Dados'] as const;

const SEGMENTOS: Array<{ id: string; label: string; desc: string }> = [
  { id: 'clinica', label: 'Clínica / consultório', desc: 'Saúde, convênios, agenda' },
  { id: 'varejo', label: 'Varejo de roupa', desc: 'Loja, estoque, vendas' },
  { id: 'restaurante', label: 'Restaurante', desc: 'Salão, delivery, insumos' },
];

const FINALIDADES: Array<{
  purpose: SystemPurpose;
  label: string;
  hint: string;
  sugestoes: Partial<Record<string, string[]>>;
}> = [
  {
    purpose: 'payables_receivables',
    label: 'Contas a pagar e receber',
    hint: 'Onde você controla o que entra e sai',
    sugestoes: {
      clinica: ['iClinic', 'Feegow', 'Amplimed'],
      varejo: ['Bling', 'Tiny', 'Omie'],
      restaurante: ['Consumer', 'Colibri'],
    },
  },
  {
    purpose: 'inventory',
    label: 'Controle de estoque',
    hint: 'Onde você acompanha a mercadoria',
    sugestoes: {
      varejo: ['Linx Microvix', 'Bling'],
      restaurante: ['Colibri', 'Consumer'],
      clinica: ['Planilha', 'Não uso'],
    },
  },
  {
    purpose: 'services',
    label: 'Controle de serviços / agenda',
    hint: 'Onde você registra atendimentos',
    sugestoes: {
      clinica: ['iClinic', 'Feegow', 'Amplimed'],
      varejo: ['Não uso'],
      restaurante: ['Sistema do PDV'],
    },
  },
  {
    purpose: 'bank',
    label: 'Banco',
    hint: 'Onde fica a conta do negócio',
    sugestoes: {
      clinica: ['Itaú', 'Bradesco', 'Inter'],
      varejo: ['Inter', 'Nubank', 'Santander'],
      restaurante: ['Inter', 'Caixa', 'Itaú'],
    },
  },
];

const FORMATOS: Array<{ id: ExportFormat; label: string }> = [
  { id: 'pdf', label: 'PDF' },
  { id: 'excel_csv', label: 'Excel/CSV' },
  { id: 'photo', label: 'Foto' },
  { id: 'none', label: 'Não tem' },
];

/* -------- máscara + validação de CNPJ (no app, antes de bater no servidor) -------- */

function soDigitos(s: string): string {
  return s.replace(/\D/g, '').slice(0, 14);
}
function mascaraCnpj(s: string): string {
  const d = soDigitos(s);
  let out = d;
  if (d.length > 2) out = `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length > 5) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 8) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 12) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return out;
}
function cnpjValido(raw: string): boolean {
  const c = soDigitos(raw);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string): number => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = calc(c.slice(0, 12));
  const dv2 = calc(c.slice(0, 12) + String(dv1));
  return c.endsWith(`${dv1}${dv2}`);
}

export default function Onboarding() {
  const { token } = usePulso();
  const [passo, setPasso] = useState(1);

  // dados que atravessam as etapas
  const [cnpj, setCnpj] = useState('');
  const [cnpjErro, setCnpjErro] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [dados, setDados] = useState<CnpjLookupResult | null>(null);
  const [segmento, setSegmento] = useState<string | null>(null);
  const [sistemas, setSistemas] = useState<Record<SystemPurpose, CompanySystem>>({
    payables_receivables: { purpose: 'payables_receivables', systemName: null, exportFormat: null },
    inventory: { purpose: 'inventory', systemName: null, exportFormat: null },
    services: { purpose: 'services', systemName: null, exportFormat: null },
    bank: { purpose: 'bank', systemName: null, exportFormat: null },
  });
  const [salvando, setSalvando] = useState(false);
  // último CNPJ (dígitos) já consultado, para a consulta AUTOMÁTICA não repetir.
  const consultadoRef = useRef<string>('');

  async function consultarCnpj(valor?: string) {
    const alvo = valor ?? cnpj;
    const digs = soDigitos(alvo);
    if (!token) {
      setCnpjErro('Sua sessão expirou. Saia e entre de novo.');
      return;
    }
    if (!cnpjValido(alvo)) {
      setCnpjErro('CNPJ incompleto ou inválido. Confira os números.');
      return;
    }
    if (consultando || consultadoRef.current === digs) return; // já em curso / já consultado
    consultadoRef.current = digs;
    setCnpjErro('');
    setConsultando(true);
    try {
      const r = await lookupMyCnpj(token, alvo);
      setDados(r);
      setSegmento(r.suggestedNiche ?? null);
      setPasso(2);
    } catch (e) {
      // erro visível NO CAMPO (não encontrado / inválido / falha) + permite tentar de novo
      consultadoRef.current = '';
      setCnpjErro(e instanceof CampoError ? e.message : 'Não consegui consultar agora. Tente de novo.');
    } finally {
      setConsultando(false);
    }
  }

  async function confirmarSegmento() {
    if (!token || !segmento) return;
    setSalvando(true);
    try {
      await patchMyCompany(token, { niche: segmento });
      setPasso(3);
    } catch {
      // segmento é da lista fixa; falha só por rede — segue mesmo assim
      setPasso(3);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarSistemas() {
    if (!token) return;
    setSalvando(true);
    try {
      // só manda o que o dono tocou (nome ou formato preenchido)
      const lista = Object.values(sistemas).filter((s) => s.systemName || s.exportFormat);
      if (lista.length > 0) await saveMyCompanySystems(token, lista);
      setPasso(4);
    } catch {
      setPasso(4);
    } finally {
      setSalvando(false);
    }
  }

  function setSistema(purpose: SystemPurpose, patch: Partial<CompanySystem>) {
    setSistemas((s) => ({ ...s, [purpose]: { ...s[purpose], ...patch } }));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topo}>
          <PulsoLogo size={26} />
          <Passos atual={passo} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {passo === 1 && (
            <View style={styles.etapa}>
              <Text style={styles.titulo}>Vamos começar pelo seu CNPJ</Text>
              <Text style={styles.corpo}>
                Com ele o Pulso já traz o nome da empresa, o endereço e a atividade — você não
                precisa digitar. É rápido.
              </Text>

              <Text style={styles.rotulo}>CNPJ</Text>
              <TextInput
                style={[styles.input, cnpjErro ? styles.inputErro : null]}
                value={cnpj}
                onChangeText={(t) => {
                  const m = mascaraCnpj(t);
                  setCnpj(m);
                  if (cnpjErro) setCnpjErro('');
                  // CONSULTA AUTOMÁTICA: ao completar 14 dígitos válidos, já busca
                  // (o dono não precisa achar nem tocar o botão).
                  if (soDigitos(m).length === 14 && cnpjValido(m)) void consultarCnpj(m);
                }}
                onBlur={() => {
                  if (cnpj.length > 0 && !cnpjValido(cnpj)) {
                    setCnpjErro('CNPJ incompleto ou inválido. Confira os números.');
                  }
                }}
                placeholder="00.000.000/0000-00"
                placeholderTextColor={colors.cinza}
                keyboardType="number-pad"
                maxLength={18}
                editable={!consultando}
              />
              {cnpjErro ? <Text style={styles.campoErro}>{cnpjErro}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.botao,
                  (consultando || soDigitos(cnpj).length !== 14) && styles.botaoOff,
                  pressed && styles.pressionado,
                ]}
                onPress={() => consultarCnpj()}
                disabled={consultando || soDigitos(cnpj).length !== 14}
              >
                <Text style={styles.botaoTexto}>{consultando ? 'Consultando…' : 'Consultar CNPJ'}</Text>
              </Pressable>

              <Pressable onPress={() => setPasso(2)}>
                <Text style={styles.pular}>Não tenho agora, escolher o segmento à mão</Text>
              </Pressable>
            </View>
          )}

          {passo === 2 && (
            <View style={styles.etapa}>
              {dados ? (
                <View style={styles.cartaoEmpresa}>
                  <Text style={styles.empresaNome}>
                    {dados.company.nomeFantasia ?? dados.company.razaoSocial ?? 'Empresa'}
                  </Text>
                  {dados.company.razaoSocial ? (
                    <Text style={styles.empresaLinha}>{dados.company.razaoSocial}</Text>
                  ) : null}
                  {dados.company.cnaeDescricao ? (
                    <Text style={styles.empresaLinha}>Atividade: {dados.company.cnaeDescricao}</Text>
                  ) : null}
                  {dados.company.endereco?.municipio ? (
                    <Text style={styles.empresaLinha}>
                      {dados.company.endereco.municipio}
                      {dados.company.endereco.uf ? ` · ${dados.company.endereco.uf}` : ''}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Text style={styles.titulo}>Qual é o segmento?</Text>
              <Text style={styles.corpo}>
                {dados?.suggestedNiche
                  ? 'Sugeri pelo CNAE. Confirme ou corrija.'
                  : 'Escolha o que mais se parece com o seu negócio.'}
              </Text>

              <View style={styles.opcoes}>
                {SEGMENTOS.map((s) => {
                  const on = segmento === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.opcao, on && styles.opcaoOn]}
                      onPress={() => setSegmento(s.id)}
                    >
                      <Text style={[styles.opcaoTitulo, on && styles.opcaoTituloOn]}>{s.label}</Text>
                      <Text style={styles.opcaoDesc}>{s.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.botao,
                  (!segmento || salvando) && styles.botaoOff,
                  pressed && styles.pressionado,
                ]}
                onPress={confirmarSegmento}
                disabled={!segmento || salvando}
              >
                <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Confirmar'}</Text>
              </Pressable>
            </View>
          )}

          {passo === 3 && (
            <View style={styles.etapa}>
              <Text style={styles.titulo}>Quais sistemas você usa?</Text>
              <Text style={styles.corpo}>
                Isso ajuda o Pulso a saber o que esperar de cada arquivo. Não sabe algum? Pode deixar
                em branco.
              </Text>

              {FINALIDADES.map((f) => {
                const atual = sistemas[f.purpose];
                const sugestoes = (segmento && f.sugestoes[segmento]) || [];
                return (
                  <View key={f.purpose} style={styles.finalidade}>
                    <Text style={styles.finalidadeLabel}>{f.label}</Text>
                    <Text style={styles.finalidadeHint}>{f.hint}</Text>
                    <TextInput
                      style={styles.inputPequeno}
                      value={atual.systemName ?? ''}
                      onChangeText={(t) => setSistema(f.purpose, { systemName: t || null })}
                      placeholder="Nome do sistema"
                      placeholderTextColor={colors.cinza}
                    />
                    {sugestoes.length > 0 ? (
                      <View style={styles.chips}>
                        {sugestoes.map((sug) => (
                          <Pressable
                            key={sug}
                            style={styles.chip}
                            onPress={() => setSistema(f.purpose, { systemName: sug })}
                          >
                            <Text style={styles.chipTexto}>{sug}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.chips}>
                      {FORMATOS.map((fmt) => {
                        const on = atual.exportFormat === fmt.id;
                        return (
                          <Pressable
                            key={fmt.id}
                            style={[styles.chipFmt, on && styles.chipFmtOn]}
                            onPress={() => setSistema(f.purpose, { exportFormat: on ? null : fmt.id })}
                          >
                            <Text style={[styles.chipTexto, on && styles.chipTextoOn]}>{fmt.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <Pressable
                style={({ pressed }) => [styles.botao, salvando && styles.botaoOff, pressed && styles.pressionado]}
                onPress={salvarSistemas}
                disabled={salvando}
              >
                <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Salvar e continuar'}</Text>
              </Pressable>
              <Pressable onPress={() => setPasso(4)}>
                <Text style={styles.pular}>Pular por enquanto</Text>
              </Pressable>
            </View>
          )}

          {passo === 4 && (
            <View style={styles.etapa}>
              <Text style={styles.titulo}>Cadastro pronto! Faltam os números</Text>
              <Text style={styles.corpo}>
                Duas coisas destravam o motor: um diagnóstico rápido de como você controla o negócio
                e o envio dos seus arquivos (extrato, relatórios).
              </Text>

              <Pressable
                style={({ pressed }) => [styles.cartaoAcao, pressed && styles.pressionado]}
                onPress={() => router.push('/questionario' as Href)}
              >
                <Text style={styles.cartaoAcaoTitulo}>Responder o diagnóstico de gestão</Text>
                <Text style={styles.cartaoAcaoDesc}>15 perguntas rápidas. Ajusta o que o Pulso avalia.</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
                onPress={() => router.replace('/enviar' as Href)}
              >
                <Text style={styles.botaoTexto}>Enviar meus dados</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.botaoLinha, pressed && styles.pressionado]} onPress={() => router.replace('/(tabs)')}>
                <Text style={styles.botaoLinhaTexto}>Ver meu painel</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Passos({ atual }: { atual: number }) {
  return (
    <View style={styles.passos}>
      {PASSOS.map((label, i) => {
        const n = i + 1;
        const feito = n < atual;
        const ativo = n === atual;
        return (
          <View key={label} style={styles.passoItem}>
            <View style={[styles.passoBolha, feito && styles.passoFeito, ativo && styles.passoAtivo]}>
              <Text style={[styles.passoNum, (feito || ativo) && styles.passoNumOn]}>{n}</Text>
            </View>
            <Text style={[styles.passoLabel, ativo && styles.passoLabelOn]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { paddingHorizontal: 24, paddingTop: 12, gap: 14 },
  scroll: { padding: 24, paddingTop: 12, paddingBottom: 40 },
  etapa: { gap: space.group ?? 16 },

  passos: { flexDirection: 'row', justifyContent: 'space-between' },
  passoItem: { alignItems: 'center', gap: 4, flex: 1 },
  passoBolha: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.linha,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.branco,
  },
  passoFeito: { backgroundColor: colors.vivo, borderColor: colors.vivo },
  passoAtivo: { borderColor: colors.vivo },
  passoNum: { fontFamily: fonts.mono, fontSize: 12, color: colors.cinza },
  passoNumOn: { color: colors.mata },
  passoLabel: { fontFamily: fonts.corpo, fontSize: 10, color: colors.cinza },
  passoLabelOn: { color: colors.tinta, fontFamily: fonts.corpoMedio },

  titulo: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.tinta, letterSpacing: -0.5 },
  corpo: { fontFamily: fonts.corpo, fontSize: 15.5, lineHeight: 23, color: colors.cinza },

  rotulo: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta, marginTop: 4 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: fonts.mono,
    fontSize: 18,
    color: colors.tinta,
    backgroundColor: colors.branco,
  },
  inputErro: { borderColor: colors.critico },
  campoErro: { fontFamily: fonts.corpo, fontSize: 13, color: colors.critico },
  inputPequeno: {
    borderWidth: 1.5,
    borderColor: colors.linha,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.corpo,
    fontSize: 15,
    color: colors.tinta,
    backgroundColor: colors.branco,
  },

  botao: { backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  botaoOff: { opacity: 0.5 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: '#06231A' },
  botaoLinha: { borderWidth: 1.5, borderColor: colors.linha, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  botaoLinhaTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
  pular: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center', paddingVertical: 6, textDecorationLine: 'underline' },
  pressionado: { opacity: 0.85 },

  cartaoEmpresa: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderLeftWidth: 4,
    borderLeftColor: colors.vivo,
    borderRadius: 14,
    padding: 14,
    gap: 3,
  },
  empresaNome: { fontFamily: fonts.displayMedio, fontSize: 17, color: colors.tinta },
  empresaLinha: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza },

  opcoes: { gap: 10 },
  opcao: { borderWidth: 1.5, borderColor: colors.linha, borderRadius: 14, padding: 14, backgroundColor: colors.branco, gap: 2 },
  opcaoOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  opcaoTitulo: { fontFamily: fonts.displayMedio, fontSize: 16, color: colors.tinta },
  opcaoTituloOn: { color: colors.mata },
  opcaoDesc: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },

  finalidade: { gap: 8, borderTopWidth: 1, borderTopColor: colors.linha, paddingTop: 14 },
  finalidadeLabel: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  finalidadeHint: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, marginTop: -4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.branco },
  chipFmt: { borderWidth: 1.5, borderColor: colors.linha, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.branco },
  chipFmtOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipTexto: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  chipTextoOn: { color: colors.mata, fontFamily: fonts.corpoMedio },

  cartaoAcao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  cartaoAcaoTitulo: { fontFamily: fonts.displayMedio, fontSize: 16, color: colors.tinta },
  cartaoAcaoDesc: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza },
});
