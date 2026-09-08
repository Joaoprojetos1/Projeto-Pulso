/**
 * Onboarding — a esteira completa, do cadastro ao primeiro arquivo.
 *
 * Ordem acordada com o especialista (05/09/2026), do começo ao fim:
 *
 *   1. Criar conta        (tela boas-vindas, antes de chegar aqui)
 *   2. CNPJ               → a base pública traz empresa e sócios
 *   3. Segmento           → sugerido pelo CNAE, o dono confirma
 *   4. Sistemas           → o que ele usa (orienta o parser)
 *   5. Diagnóstico        → as 15 perguntas, ANTES de pedir arquivo: o motor
 *                           passa a saber que tipo de arquivo esperar e qual o
 *                           nível de controle da casa
 *   6. Demonstração       → precisa existir algo de graça antes de pedir dinheiro
 *   7. Plano              → DEPOIS dos dados, nunca antes: quem desiste aqui já
 *                           deixou tudo salvo e segue como lead
 *   8. Arquivos           → vários de uma vez, de meses diferentes
 *
 * A numeração dos passos é DERIVADA desta lista (nunca escrita à mão), para a
 * tela e o número nunca mais saírem de sincronia.
 *
 * O app segue burro: manda o CNPJ, o servidor consulta e grava. Validação
 * aparece NO CAMPO, nunca em alerta genérico nem em silêncio.
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

import { Demonstracao } from '@/components/demonstracao';
import { DiagnosticoGestao } from '@/components/diagnostico-gestao';
import { EnvioArquivos } from '@/components/envio-arquivos';
import { PulsoLogo } from '@/components/logo';
import { Planos, TarjaModoTeste, useModoTeste } from '@/components/planos';
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

/** A esteira inteira. O índice + 1 É o número do passo — não repetir número à mão. */
const PASSOS = [
  'Criar conta',
  'CNPJ',
  'Segmento',
  'Sistemas',
  'Diagnóstico',
  'Demonstração',
  'Plano',
  'Arquivos',
] as const;
const TOTAL = PASSOS.length;

// nomes dos passos que esta tela conduz (o 1 acontece em boas-vindas)
const P_CNPJ = 2;
const P_SEGMENTO = 3;
const P_SISTEMAS = 4;
const P_DIAGNOSTICO = 5;
const P_DEMO = 6;
const P_PLANO = 7;
const P_ARQUIVOS = 8;

/**
 * Lista FECHADA (decisão do especialista), com uma saída honesta: quem não é de
 * nenhum dos três escolhe "Outro tipo de negócio" e recebe os indicadores
 * universais — nunca os de um setor que não é o dele.
 */
const SEGMENTOS: Array<{ id: string; label: string; desc: string }> = [
  { id: 'clinica', label: 'Clínica / consultório', desc: 'Saúde, convênios, agenda' },
  { id: 'varejo', label: 'Varejo de roupa', desc: 'Loja, estoque, vendas' },
  { id: 'restaurante', label: 'Restaurante', desc: 'Salão, delivery, insumos' },
  {
    id: 'geral',
    label: 'Outro tipo de negócio',
    desc: 'Caixa, margem, recebimento e os demais indicadores que valem para qualquer negócio',
  },
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
  const {
    token,
    carregar,
    marcarCadastroCompleto,
    assinatura,
    sair,
    onboardingPasso,
    salvarOnboardingPasso,
    concluirOnboarding,
  } = usePulso();
  // retoma de onde parou (o passo fica guardado no aparelho); começa no CNPJ.
  const [passo, definirPasso] = useState(() => {
    const salvo = onboardingPasso ?? P_CNPJ;
    return salvo >= P_CNPJ && salvo <= P_ARQUIVOS ? salvo : P_CNPJ;
  });

  /** Avança (ou volta) na esteira guardando o passo, para poder retomar depois. */
  function setPasso(n: number) {
    definirPasso(n);
    salvarOnboardingPasso(n);
  }
  const testMode = useModoTeste();
  // fallback: quando a consulta pública do CNPJ falha, libera seguir à mão SEM
  // furar a exigência (só aparece com um CNPJ válido já digitado).
  const [permitirManual, setPermitirManual] = useState(false);

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

  const assinaturaAtiva = assinatura?.active ?? false;

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
      marcarCadastroCompleto(); // o CNPJ já ficou gravado no servidor
      setPasso(P_SEGMENTO);
    } catch (e) {
      // erro visível NO CAMPO (não encontrado / inválido / falha) + permite tentar de novo
      consultadoRef.current = '';
      setCnpjErro(e instanceof CampoError ? e.message : 'Não consegui consultar agora. Tente de novo.');
      // libera o caminho à mão (o CNPJ digitado será gravado ao confirmar o segmento)
      setPermitirManual(true);
    } finally {
      setConsultando(false);
    }
  }

  async function confirmarSegmento() {
    if (!token || !segmento) return;
    setSalvando(true);
    try {
      // fallback: sem dados do lookup mas com CNPJ válido digitado → grava o CNPJ
      // junto com o segmento, para o cadastro contar como completo.
      const patch: { niche: string; cnpj?: string } = { niche: segmento };
      if (!dados && cnpjValido(cnpj)) patch.cnpj = soDigitos(cnpj);
      await patchMyCompany(token, patch);
      if (dados || patch.cnpj) marcarCadastroCompleto();
      setPasso(P_SISTEMAS);
    } catch {
      // segmento é da lista fixa; falha só por rede — segue mesmo assim
      setPasso(P_SISTEMAS);
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
      setPasso(P_DIAGNOSTICO);
    } catch {
      setPasso(P_DIAGNOSTICO);
    } finally {
      setSalvando(false);
    }
  }

  function setSistema(purpose: SystemPurpose, patch: Partial<CompanySystem>) {
    setSistemas((s) => ({ ...s, [purpose]: { ...s[purpose], ...patch } }));
  }

  function irParaPainel() {
    concluirOnboarding(); // esteira cumprida: não retomar mais
    void carregar();
    router.replace('/(tabs)');
  }

  // O diagnóstico tem rolagem própria (é uma pergunta por tela): fica FORA do
  // ScrollView desta tela, senão viram duas rolagens aninhadas.
  const conteudoRolaSozinho = passo === P_DIAGNOSTICO;

  const corpo = (
    <>
      {passo === P_CNPJ && (
        <View style={styles.etapa}>
          <Text style={styles.titulo}>Vamos começar pelo seu CNPJ</Text>
          <Text style={styles.corpo}>
            Com ele o Ivo já traz o nome da empresa, o endereço, a atividade e os sócios — você
            não precisa digitar. É rápido.
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

          <Text style={styles.ajuda}>
            O CNPJ é obrigatório: é por ele que o Ivo conhece a sua empresa e os sócios.
          </Text>

          {/* fallback: só quando a consulta falhou E há um CNPJ válido digitado.
              Segue à mão, mas o CNPJ digitado é gravado ao confirmar o segmento. */}
          {permitirManual && cnpjValido(cnpj) ? (
            <Pressable onPress={() => { setPermitirManual(false); setPasso(P_SEGMENTO); }}>
              <Text style={styles.pular}>Não consegui buscar agora — informar o segmento à mão</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {passo === P_SEGMENTO && (
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

      {passo === P_SISTEMAS && (
        <View style={styles.etapa}>
          <Text style={styles.titulo}>Quais sistemas você usa?</Text>
          <Text style={styles.corpo}>
            Isso ajuda o Ivo a saber o que esperar de cada arquivo. Não sabe algum? Pode deixar
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
          <Text style={styles.ajuda}>
            Não sabe algum? Pode deixar em branco e seguir — dá para completar depois.
          </Text>
        </View>
      )}

      {passo === P_DEMO && (
        <View style={styles.etapa}>
          <Demonstracao segmento={segmento} />
          <Pressable
            style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            onPress={() => setPasso(P_PLANO)}
          >
            <Text style={styles.botaoTexto}>Quero isso no meu negócio</Text>
          </Pressable>
        </View>
      )}

      {passo === P_PLANO && (
        <View style={styles.etapa}>
          <Text style={styles.titulo}>{assinaturaAtiva ? 'Seu plano está ativo' : 'Escolha seu plano'}</Text>
          <Text style={styles.corpo}>
            {assinaturaAtiva
              ? 'Tudo certo com a assinatura. Vamos ao último passo: os seus arquivos.'
              : 'A cobrança acontece no site, sem comissão de loja. Seus dados já estão salvos — se preferir decidir depois, é só voltar aqui.'}
          </Text>

          {assinaturaAtiva ? (
            <Pressable
              style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
              onPress={() => setPasso(P_ARQUIVOS)}
            >
              <Text style={styles.botaoTexto}>Continuar</Text>
            </Pressable>
          ) : (
            <>
              <Planos aoAtivar={() => setPasso(P_ARQUIVOS)} />
              <Pressable onPress={sair} hitSlop={8} style={styles.sair}>
                <Text style={styles.sairTexto}>Decidir depois e sair</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {passo === P_ARQUIVOS && (
        <View style={styles.etapa}>
          <Text style={styles.titulo}>Agora os seus arquivos</Text>
          <Text style={styles.corpo}>
            Tem vários documentos, de meses diferentes? Envie todos de uma vez. Diga o tipo de cada
            um — o Ivo lê o que sabe ler e guarda o resto.
          </Text>

          <EnvioArquivos />

          <Pressable
            style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            onPress={irParaPainel}
          >
            <Text style={styles.botaoTexto}>Ir para o meu painel</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {testMode && passo === P_PLANO && <TarjaModoTeste />}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topo}>
          <PulsoLogo size={26} />
          <Passos atual={passo} />
        </View>

        {conteudoRolaSozinho ? (
          <View style={styles.flex}>
            <DiagnosticoGestao
              aoConcluir={() => setPasso(P_DEMO)}
              rotuloConcluir="Continuar"
              introExtra="Leva uns 3 minutos e vem antes dos arquivos de propósito: assim o Ivo já sabe o que esperar do seu controle e quais documentos pedir. No fim você vê onde está mais forte, onde está mais frágil e o que atacar primeiro."
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {corpo}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Barra de passos. O número e o rótulo saem da lista PASSOS — mudar a ordem da
 * esteira renumera tudo sozinho (foi o defeito apontado no teste: a tela mudou
 * de posição e o número continuou o antigo).
 */
function Passos({ atual }: { atual: number }) {
  const rotulo = PASSOS[atual - 1] ?? '';
  const progresso = Math.min(Math.max(atual / TOTAL, 0), 1);
  return (
    <View style={styles.passos}>
      <View style={styles.passoLinha}>
        <Text style={styles.passoContador}>
          PASSO {atual} DE {TOTAL}
        </Text>
        <Text style={styles.passoRotulo}>{rotulo}</Text>
      </View>
      <View style={styles.passoBarraFundo}>
        <View style={[styles.passoBarraCheia, { width: `${Math.round(progresso * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  flex: { flex: 1 },
  topo: { paddingHorizontal: 24, paddingTop: 12, gap: 14 },
  scroll: { padding: 24, paddingTop: 12, paddingBottom: 40 },
  etapa: { gap: space.group ?? 16 },

  passos: { gap: 6 },
  passoLinha: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  passoContador: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1.2, color: colors.cinza },
  passoRotulo: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },
  passoBarraFundo: { height: 4, backgroundColor: colors.linha, borderRadius: 2 },
  passoBarraCheia: { height: 4, backgroundColor: colors.vivo, borderRadius: 2 },

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
  campoErro: { fontFamily: fonts.corpo, fontSize: 13, color: colors.criticoTexto },
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
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: '#FFFFFF' },
  pular: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center', paddingVertical: 6, textDecorationLine: 'underline' },
  ajuda: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.cinza, textAlign: 'center' },
  sair: { alignSelf: 'center', paddingVertical: 12 },
  sairTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
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
});
