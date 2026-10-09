/**
 * Bancada do especialista (operação). É onde o consultor ensina o Ivo sem
 * depender de publicar código:
 *
 *  - Orientações: o que recomendar em cada situação (geral, por estágio, por
 *    aviso). Tem rascunho, publicação, histórico e desfazer.
 *  - Testar: perguntar ao Ivo como se fosse o dono de uma empresa e corrigir a
 *    resposta ("eu diria assim"), que vira exemplo.
 *  - Exemplos: as respostas corrigidas, que o Ivo consulta em perguntas parecidas.
 *
 * App burro: os seletores, rótulos e limites vêm do servidor. Quando uma
 * orientação entra, o que o fiscal barra e o que vale para cada empresa é
 * decidido lá. Aqui só se escreve texto e se desenha a resposta.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

import { MarkdownLite } from '@/components/markdown-lite';
import {
  criarExemplo,
  criarOrientacao,
  desligarOrientacao,
  ensaiarEspecialista,
  excluirExemplo,
  excluirOrientacao,
  fetchEspecialista,
  fetchVersoesOrientacao,
  publicarOrientacao,
  restaurarOrientacao,
  salvarExemplo,
  salvarOrientacao,
  type EspecialistaBancada,
  type EspecialistaEmpresa,
  type EspecialistaEnsaio,
  type EspecialistaEscopo,
  type EspecialistaExemplo,
  type EspecialistaOrientacao,
  type EspecialistaVersao,
} from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

type Aba = 'orientacoes' | 'testar' | 'exemplos';

const ABAS: Array<{ id: Aba; label: string }> = [
  { id: 'orientacoes', label: 'Orientações' },
  { id: 'testar', label: 'Testar' },
  { id: 'exemplos', label: 'Exemplos' },
];

const ESCOPOS: Array<{ id: EspecialistaEscopo; label: string; dica: string }> = [
  { id: 'geral', label: 'Sempre', dica: 'Entra em toda conversa do Ivo IA.' },
  {
    id: 'estagio',
    label: 'Em um estágio',
    dica: 'Entra na conversa e no texto do momento, quando a empresa está nesse estágio.',
  },
  {
    id: 'aviso',
    label: 'Em um aviso',
    dica: 'Entra na conversa e no texto do aviso, quando esse aviso está ativo.',
  },
];

const mensagemDe = (e: unknown, reserva: string) => (e instanceof Error && e.message ? e.message : reserva);

function dataCurta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Especialista() {
  const { token, ehAdmin } = usePulso();
  const [aba, setAba] = useState<Aba>('orientacoes');
  const [dados, setDados] = useState<EspecialistaBancada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      setDados(await fetchEspecialista(token));
      setErro(null);
    } catch (e) {
      setErro(mensagemDe(e, 'Não consegui abrir a bancada.'));
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const avisar = useCallback(
    (m: string) => {
      setMsg(m);
      void carregar();
    },
    [carregar],
  );

  if (!ehAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>Área restrita à operação.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Bancada do especialista</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.abas}>
        {ABAS.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => {
              setAba(a.id);
              setMsg(null);
            }}
            style={[styles.aba, aba === a.id && styles.abaOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: aba === a.id }}>
            <Text style={[styles.abaTexto, aba === a.id && styles.abaTextoOn]}>
              {a.label}
              {dados && a.id === 'orientacoes' ? ` (${dados.guidance.length})` : ''}
              {dados && a.id === 'exemplos' ? ` (${dados.examples.length})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
          {msg && (
            <View style={styles.aviso}>
              <Text style={styles.avisoTexto}>{msg}</Text>
            </View>
          )}
          {erro && (
            <View style={styles.avisoErro}>
              <Text style={styles.avisoErroTexto}>{erro}</Text>
            </View>
          )}

          {dados === null && !erro ? (
            <ActivityIndicator color={colors.mata} style={{ marginTop: space.section }} />
          ) : dados === null ? null : aba === 'orientacoes' ? (
            <AbaOrientacoes dados={dados} token={token!} avisar={avisar} />
          ) : aba === 'testar' ? (
            <AbaTestar dados={dados} token={token!} avisar={avisar} />
          ) : (
            <AbaExemplos dados={dados} token={token!} avisar={avisar} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface AbaProps {
  dados: EspecialistaBancada;
  token: string;
  avisar: (m: string) => void;
}

// ---------------------------------------------------------------------------
// Orientações
// ---------------------------------------------------------------------------

function AbaOrientacoes({ dados, token, avisar }: AbaProps) {
  return (
    <>
      <Text style={styles.explica}>
        Escreva o que o Ivo deve recomendar em cada situação. O que você salva fica em rascunho; só vale para os
        clientes depois de publicar. Você ajusta o que o Ivo recomenda e como ele fala. As contas e os avisos
        continuam vindo do motor.
      </Text>

      <NovaOrientacao dados={dados} token={token} avisar={avisar} />

      {dados.guidance.length === 0 ? (
        <Text style={styles.vazioLista}>Nenhuma orientação ainda. A primeira que você publicar já vale na conversa seguinte.</Text>
      ) : (
        dados.guidance.map((g) => (
          <OrientacaoCard key={g.id} orientacao={g} token={token} avisar={avisar} limite={dados.options.limits.body} />
        ))
      )}
    </>
  );
}

function NovaOrientacao({ dados, token, avisar }: AbaProps) {
  const [aberto, setAberto] = useState(false);
  const [escopo, setEscopo] = useState<EspecialistaEscopo>('geral');
  const [chave, setChave] = useState('');
  const [segmento, setSegmento] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const opcoes = escopo === 'estagio' ? dados.options.stages : escopo === 'aviso' ? dados.options.rules : [];
  const limite = dados.options.limits.body;

  async function salvar() {
    if (escopo !== 'geral' && !chave) return setErro('Escolha a situação em que a orientação vale.');
    if (!titulo.trim()) return setErro('Dê um título curto, para você achar depois.');
    if (!texto.trim()) return setErro('Escreva a orientação.');
    setErro(null);
    setSalvando(true);
    try {
      await criarOrientacao(token, {
        scope: escopo,
        scopeKey: escopo === 'geral' ? '' : chave,
        niche: segmento,
        title: titulo.trim(),
        body: texto.trim(),
      });
      setTitulo('');
      setTexto('');
      setChave('');
      setAberto(false);
      avisar('Rascunho salvo. Teste na aba Testar e publique quando estiver bom.');
    } catch (e) {
      setErro(mensagemDe(e, 'Não consegui salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <Pressable onPress={() => setAberto(true)} style={({ pressed }) => [styles.botaoNovo, pressed && styles.pressionado]}>
        <Ionicons name="add" size={18} color={colors.mata} />
        <Text style={styles.botaoNovoTexto}>Nova orientação</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.novoTitulo}>Nova orientação</Text>

      <Text style={styles.rotulo}>Quando ela vale</Text>
      <View style={styles.chips}>
        {ESCOPOS.map((e) => (
          <Chip
            key={e.id}
            label={e.label}
            ativo={escopo === e.id}
            onPress={() => {
              setEscopo(e.id);
              setChave('');
            }}
          />
        ))}
      </View>
      <Text style={styles.dica}>{ESCOPOS.find((e) => e.id === escopo)!.dica}</Text>

      {opcoes.length > 0 && (
        <>
          <Text style={styles.rotulo}>{escopo === 'estagio' ? 'Qual estágio' : 'Qual aviso'}</Text>
          <View style={styles.chips}>
            {opcoes.map((o) => (
              <Chip key={o.key} label={o.label} ativo={chave === o.key} onPress={() => setChave(o.key)} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.rotulo}>Para qual segmento</Text>
      <View style={styles.chips}>
        <Chip label="Todos" ativo={segmento === null} onPress={() => setSegmento(null)} />
        {dados.options.niches.map((n) => (
          <Chip key={n.key} label={n.label} ativo={segmento === n.key} onPress={() => setSegmento(n.key)} />
        ))}
      </View>

      <Text style={styles.rotulo}>Título (só para você se achar)</Text>
      <TextInput
        style={styles.input}
        value={titulo}
        onChangeText={setTitulo}
        maxLength={dados.options.limits.title}
        placeholder="Ex.: Primeiro passo quando o caixa aperta"
        placeholderTextColor={colors.cinza}
      />

      <Text style={styles.rotulo}>O que o Ivo deve recomendar</Text>
      <TextInput
        style={[styles.input, styles.inputAlto]}
        value={texto}
        onChangeText={setTexto}
        maxLength={limite}
        multiline
        textAlignVertical="top"
        placeholder="Escreva como você orientaria um cliente nessa situação."
        placeholderTextColor={colors.cinza}
      />
      <Text style={styles.contador}>
        {texto.length} de {limite}
      </Text>

      {erro && <Text style={styles.erroCampo}>{erro}</Text>}

      <View style={styles.acoes}>
        <Botao label="Salvar rascunho" onPress={salvar} ocupado={salvando} />
        <BotaoLeve label="Cancelar" onPress={() => setAberto(false)} />
      </View>
    </View>
  );
}

function OrientacaoCard({
  orientacao: g,
  token,
  avisar,
  limite,
}: {
  orientacao: EspecialistaOrientacao;
  token: string;
  avisar: (m: string) => void;
  limite: number;
}) {
  const [titulo, setTitulo] = useState(g.title);
  const [texto, setTexto] = useState(g.body);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [versoes, setVersoes] = useState<EspecialistaVersao[] | null>(null);

  // quando o servidor devolve a orientação atualizada, a tela acompanha
  useEffect(() => {
    setTitulo(g.title);
    setTexto(g.body);
  }, [g.title, g.body]);

  const mudou = titulo.trim() !== g.title || texto.trim() !== g.body;
  // tem algo na tela (salvo ou não) que ainda não está no ar
  const porPublicar = mudou || g.status !== 'publicada';

  async function rodar(nome: string, fn: () => Promise<unknown>, ok: string) {
    setErro(null);
    setOcupado(nome);
    try {
      await fn();
      avisar(ok);
    } catch (e) {
      setErro(mensagemDe(e, 'Não consegui concluir.'));
    } finally {
      setOcupado(null);
    }
  }

  const salvar = () => salvarOrientacao(token, g.id, { title: titulo.trim(), body: texto.trim() });

  async function abrirHistorico() {
    if (versoes) return setVersoes(null);
    try {
      setVersoes(await fetchVersoesOrientacao(token, g.id));
    } catch (e) {
      setErro(mensagemDe(e, 'Não consegui abrir o histórico.'));
    }
  }

  const selo =
    g.status === 'publicada'
      ? { texto: 'No ar', estilo: styles.seloOn, estiloTexto: styles.seloOnTexto }
      : g.status === 'alterada'
        ? { texto: 'No ar, com mudança por publicar', estilo: styles.seloMeio, estiloTexto: styles.seloMeioTexto }
        : { texto: 'Rascunho', estilo: styles.seloOff, estiloTexto: styles.seloOffTexto };

  return (
    <View style={styles.card}>
      <View style={styles.cardTopo}>
        <Text style={styles.cardEscopo}>
          {g.scopeLabel}
          {g.nicheLabel ? ` · ${g.nicheLabel}` : ''}
        </Text>
        <View style={[styles.selo, selo.estilo]}>
          <Text style={[styles.seloTexto, selo.estiloTexto]}>{selo.texto}</Text>
        </View>
      </View>

      <TextInput
        style={[styles.input, styles.inputTitulo]}
        value={titulo}
        onChangeText={setTitulo}
        accessibilityLabel="Título da orientação"
      />
      <TextInput
        style={[styles.input, styles.inputAlto]}
        value={texto}
        onChangeText={setTexto}
        maxLength={limite}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Texto da orientação"
      />
      <Text style={styles.contador}>
        {texto.length} de {limite}
        {g.publishedAt ? ` · publicada em ${dataCurta(g.publishedAt)}` : ''}
      </Text>

      {erro && <Text style={styles.erroCampo}>{erro}</Text>}

      <View style={styles.acoes}>
        {porPublicar && (
          <Botao
            label={mudou ? 'Salvar e publicar' : 'Publicar'}
            ocupado={ocupado === 'publicar'}
            onPress={() =>
              rodar(
                'publicar',
                async () => {
                  if (mudou) await salvar();
                  await publicarOrientacao(token, g.id);
                },
                'Publicada. Já vale na próxima conversa do Ivo.',
              )
            }
          />
        )}
        {mudou && (
          <BotaoLeve
            label="Salvar rascunho"
            ocupado={ocupado === 'salvar'}
            onPress={() => rodar('salvar', salvar, 'Rascunho salvo. O que está no ar não mudou.')}
          />
        )}
        {g.status !== 'rascunho' && (
          <BotaoLeve
            label="Tirar do ar"
            ocupado={ocupado === 'desligar'}
            onPress={() => rodar('desligar', () => desligarOrientacao(token, g.id), 'Saiu do ar. O texto continua guardado.')}
          />
        )}
        <BotaoLeve label={versoes ? 'Fechar histórico' : 'Histórico'} onPress={abrirHistorico} />
        {!confirmaExcluir && <BotaoLeve label="Excluir" perigo onPress={() => setConfirmaExcluir(true)} />}
      </View>

      {confirmaExcluir && (
        <View style={styles.confirma}>
          <Text style={styles.confirmaTexto}>Excluir de vez? O histórico vai junto e não dá para desfazer.</Text>
          <View style={styles.acoes}>
            <BotaoLeve
              label="Sim, excluir"
              perigo
              ocupado={ocupado === 'excluir'}
              onPress={() => rodar('excluir', () => excluirOrientacao(token, g.id), 'Orientação excluída.')}
            />
            <BotaoLeve label="Manter" onPress={() => setConfirmaExcluir(false)} />
          </View>
        </View>
      )}

      {versoes && (
        <View style={styles.historico}>
          {versoes.length === 0 ? (
            <Text style={styles.dica}>Ainda não foi publicada nenhuma vez.</Text>
          ) : (
            versoes.map((v, i) => (
              <View key={v.id} style={styles.versao}>
                <Text style={styles.versaoData}>
                  {dataCurta(v.publishedAt)}
                  {i === 0 && g.status !== 'rascunho' ? ' · no ar' : ''}
                </Text>
                <Text style={styles.versaoTexto}>{v.body}</Text>
                {v.body !== g.body && (
                  <BotaoLeve
                    label="Voltar a este texto"
                    ocupado={ocupado === v.id}
                    onPress={() =>
                      rodar(
                        v.id,
                        () => restaurarOrientacao(token, g.id, v.id),
                        'O texto antigo voltou para o rascunho. Confira e publique para valer.',
                      )
                    }
                  />
                )}
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Testar: perguntar ao Ivo e corrigir a resposta
// ---------------------------------------------------------------------------

function AbaTestar({ dados, token, avisar }: AbaProps) {
  const comDados = dados.companies.filter((c) => c.hasData);
  const [empresa, setEmpresa] = useState<EspecialistaEmpresa | null>(comDados[0] ?? null);
  const [pergunta, setPergunta] = useState('');
  const [comRascunhos, setComRascunhos] = useState(true);
  const [perguntando, setPerguntando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ pergunta: string; empresa: EspecialistaEmpresa; ensaio: EspecialistaEnsaio } | null>(null);

  async function perguntar() {
    if (!empresa) return setErro('Escolha uma empresa.');
    if (!pergunta.trim()) return setErro('Escreva a pergunta, do jeito que um dono faria.');
    setErro(null);
    setPerguntando(true);
    setResultado(null);
    try {
      const ensaio = await ensaiarEspecialista(token, {
        companyId: empresa.id,
        question: pergunta.trim(),
        includeDrafts: comRascunhos,
      });
      setResultado({ pergunta: pergunta.trim(), empresa, ensaio });
    } catch (e) {
      setErro(mensagemDe(e, 'Não consegui perguntar agora.'));
    } finally {
      setPerguntando(false);
    }
  }

  return (
    <>
      <Text style={styles.explica}>
        Pergunte ao Ivo como se você fosse o dono de uma das empresas. Ele responde com os números reais dela e com o
        que você já ensinou. Nada fica gravado na conversa do cliente.
      </Text>

      {!dados.options.aiAvailable && (
        <View style={styles.avisoErro}>
          <Text style={styles.avisoErroTexto}>A IA não está ligada neste servidor, então o teste devolve só o aviso padrão.</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.rotulo}>Responder como o dono de</Text>
        {comDados.length === 0 ? (
          <Text style={styles.dica}>Nenhuma empresa tem números calculados ainda. Sem isso o Ivo não tem o que responder.</Text>
        ) : (
          <View style={styles.chips}>
            {comDados.map((c) => (
              <Chip
                key={c.id}
                label={`${c.name}${c.stageLabel ? ` · ${c.stageLabel}` : ''}`}
                ativo={empresa?.id === c.id}
                onPress={() => setEmpresa(c)}
              />
            ))}
          </View>
        )}

        <Text style={styles.rotulo}>Pergunta</Text>
        <TextInput
          style={[styles.input, styles.inputMedio]}
          value={pergunta}
          onChangeText={setPergunta}
          maxLength={dados.options.limits.question}
          multiline
          textAlignVertical="top"
          placeholder="Ex.: Vale a pena antecipar o que tenho a receber?"
          placeholderTextColor={colors.cinza}
        />

        <Pressable onPress={() => setComRascunhos((v) => !v)} style={styles.caixaLinha} accessibilityRole="checkbox" accessibilityState={{ checked: comRascunhos }}>
          <Ionicons name={comRascunhos ? 'checkbox' : 'square-outline'} size={20} color={comRascunhos ? colors.vivo : colors.cinza} />
          <Text style={styles.caixaTexto}>Usar também os meus rascunhos (testar antes de publicar)</Text>
        </Pressable>

        {erro && <Text style={styles.erroCampo}>{erro}</Text>}

        <View style={styles.acoes}>
          <Botao label="Perguntar ao Ivo" onPress={perguntar} ocupado={perguntando} />
        </View>
      </View>

      {resultado && (
        <Resultado
          key={resultado.pergunta + resultado.empresa.id + resultado.ensaio.reply}
          resultado={resultado}
          dados={dados}
          token={token}
          avisar={avisar}
        />
      )}
    </>
  );
}

function Resultado({
  resultado,
  dados,
  token,
  avisar,
}: {
  resultado: { pergunta: string; empresa: EspecialistaEmpresa; ensaio: EspecialistaEnsaio };
  dados: EspecialistaBancada;
  token: string;
  avisar: (m: string) => void;
}) {
  const { ensaio, empresa, pergunta } = resultado;
  const [corrigindo, setCorrigindo] = useState(false);
  // resposta barrada começa em branco: a "segura" não é ponto de partida para ensinar
  const [correcao, setCorrecao] = useState(ensaio.blocked ? '' : ensaio.reply);
  const temSegmentoProprio = empresa.niche !== 'geral' && empresa.nicheLabel != null;
  const [soDoSegmento, setSoDoSegmento] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!correcao.trim()) return setErro('Escreva como você responderia.');
    setErro(null);
    setSalvando(true);
    try {
      await criarExemplo(token, {
        question: pergunta,
        answer: correcao.trim(),
        originalAnswer: ensaio.reply,
        niche: soDoSegmento ? empresa.niche : null,
        stage: ensaio.stage,
      });
      setCorrigindo(false);
      avisar('Exemplo salvo. O Ivo passa a consultar em perguntas parecidas.');
    } catch (e) {
      setErro(mensagemDe(e, 'Não consegui salvar o exemplo.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardEscopo}>
        {empresa.name}
        {ensaio.stageLabel ? ` · ${ensaio.stageLabel}` : ''}
      </Text>
      <Text style={styles.perguntaFeita}>{pergunta}</Text>

      <View style={styles.resposta}>
        <MarkdownLite texto={ensaio.reply} style={styles.respostaTexto} />
      </View>

      {ensaio.blocked && (
        <View style={styles.avisoAmbar}>
          <Text style={styles.avisoAmbarTexto}>
            A resposta da IA foi barrada e o cliente receberia o texto seguro acima.
            {ensaio.blocked.numbers.length > 0
              ? ` Ela citou número que não está nos dados da empresa: ${ensaio.blocked.numbers.map((n) => n.toLocaleString('pt-BR')).join(', ')}.`
              : ''}
            {ensaio.blocked.claims.length > 0
              ? ` Ela fez um juízo que os dados não sustentam (${ensaio.blocked.claims.join(', ')}).`
              : ''}
          </Text>
        </View>
      )}

      <Text style={styles.rotulo}>O que entrou nesta resposta</Text>
      {ensaio.applied.guidance.length === 0 && ensaio.applied.examples.length === 0 ? (
        <Text style={styles.dica}>Nenhuma orientação ou exemplo seu se aplicou. O Ivo respondeu só com as regras de fábrica.</Text>
      ) : (
        <>
          {ensaio.applied.guidance.map((g) => (
            <Text key={g.id} style={styles.aplicado}>
              • {g.title} <Text style={styles.aplicadoLeve}>({g.scopeLabel})</Text>
            </Text>
          ))}
          {ensaio.applied.examples.map((e) => (
            <Text key={e.id} style={styles.aplicado}>
              • Exemplo: <Text style={styles.aplicadoLeve}>{e.question}</Text>
            </Text>
          ))}
        </>
      )}

      {!corrigindo ? (
        <View style={styles.acoes}>
          <Botao label="Eu diria assim" onPress={() => setCorrigindo(true)} />
        </View>
      ) : (
        <>
          <Text style={styles.rotulo}>Como você responderia</Text>
          <TextInput
            style={[styles.input, styles.inputAlto]}
            value={correcao}
            onChangeText={setCorrecao}
            maxLength={dados.options.limits.answer}
            multiline
            textAlignVertical="top"
            placeholder="Reescreva a resposta do jeito certo."
            placeholderTextColor={colors.cinza}
          />
          <Text style={styles.contador}>
            {correcao.length} de {dados.options.limits.answer}
          </Text>
          <Text style={styles.dica}>
            O Ivo aprende o raciocínio e o tom. Os números do exemplo são desta empresa e ele não os repete para outra.
          </Text>
          {temSegmentoProprio && (
            <Pressable onPress={() => setSoDoSegmento((v) => !v)} style={styles.caixaLinha} accessibilityRole="checkbox" accessibilityState={{ checked: soDoSegmento }}>
              <Ionicons name={soDoSegmento ? 'checkbox' : 'square-outline'} size={20} color={soDoSegmento ? colors.vivo : colors.cinza} />
              <Text style={styles.caixaTexto}>Vale só para o segmento {empresa.nicheLabel}</Text>
            </Pressable>
          )}
          {erro && <Text style={styles.erroCampo}>{erro}</Text>}
          <View style={styles.acoes}>
            <Botao label="Salvar como exemplo" onPress={salvar} ocupado={salvando} />
            <BotaoLeve label="Cancelar" onPress={() => setCorrigindo(false)} />
          </View>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Exemplos
// ---------------------------------------------------------------------------

function AbaExemplos({ dados, token, avisar }: AbaProps) {
  return (
    <>
      <Text style={styles.explica}>
        As respostas que você corrigiu. Quando um cliente faz uma pergunta parecida, o Ivo consulta até três delas
        como referência. Um exemplo novo nasce na aba Testar, no botão "Eu diria assim".
      </Text>
      {dados.examples.length === 0 ? (
        <Text style={styles.vazioLista}>Nenhum exemplo ainda.</Text>
      ) : (
        dados.examples.map((e) => (
          <ExemploCard key={e.id} exemplo={e} token={token} avisar={avisar} limite={dados.options.limits.answer} />
        ))
      )}
    </>
  );
}

function ExemploCard({
  exemplo: e,
  token,
  avisar,
  limite,
}: {
  exemplo: EspecialistaExemplo;
  token: string;
  avisar: (m: string) => void;
  limite: number;
}) {
  const [resposta, setResposta] = useState(e.answer);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verAntes, setVerAntes] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);

  useEffect(() => {
    setResposta(e.answer);
  }, [e.answer]);

  const mudou = resposta.trim() !== e.answer;

  async function rodar(nome: string, fn: () => Promise<unknown>, ok: string) {
    setErro(null);
    setOcupado(nome);
    try {
      await fn();
      avisar(ok);
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui concluir.'));
    } finally {
      setOcupado(null);
    }
  }

  const etiquetas = [e.stageLabel, e.nicheLabel, dataCurta(e.createdAt)].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, !e.active && styles.cardInativo]}>
      <View style={styles.cardTopo}>
        <Text style={styles.cardEscopo}>{etiquetas}</Text>
        <Pressable
          onPress={() =>
            rodar(
              'ativo',
              () => salvarExemplo(token, e.id, { active: !e.active }),
              e.active ? 'Exemplo desligado. O Ivo deixa de consultar.' : 'Exemplo ligado de novo.',
            )
          }
          style={[styles.selo, e.active ? styles.seloOn : styles.seloOff]}
          accessibilityRole="switch"
          accessibilityState={{ checked: e.active }}>
          <Text style={[styles.seloTexto, e.active ? styles.seloOnTexto : styles.seloOffTexto]}>
            {ocupado === 'ativo' ? '...' : e.active ? 'Em uso' : 'Desligado'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.perguntaFeita}>{e.question}</Text>

      <TextInput
        style={[styles.input, styles.inputAlto]}
        value={resposta}
        onChangeText={setResposta}
        maxLength={limite}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Resposta aprovada"
      />

      {verAntes && e.originalAnswer && (
        <View style={styles.historico}>
          <Text style={styles.versaoData}>O que o Ivo tinha respondido</Text>
          <Text style={styles.versaoTexto}>{e.originalAnswer}</Text>
        </View>
      )}

      {erro && <Text style={styles.erroCampo}>{erro}</Text>}

      <View style={styles.acoes}>
        {mudou && (
          <Botao
            label="Salvar"
            ocupado={ocupado === 'salvar'}
            onPress={() => rodar('salvar', () => salvarExemplo(token, e.id, { answer: resposta.trim() }), 'Exemplo atualizado.')}
          />
        )}
        {e.originalAnswer && <BotaoLeve label={verAntes ? 'Esconder o antes' : 'Ver o antes'} onPress={() => setVerAntes((v) => !v)} />}
        {!confirmaExcluir && <BotaoLeve label="Excluir" perigo onPress={() => setConfirmaExcluir(true)} />}
      </View>

      {confirmaExcluir && (
        <View style={styles.confirma}>
          <Text style={styles.confirmaTexto}>Excluir este exemplo de vez?</Text>
          <View style={styles.acoes}>
            <BotaoLeve
              label="Sim, excluir"
              perigo
              ocupado={ocupado === 'excluir'}
              onPress={() => rodar('excluir', () => excluirExemplo(token, e.id), 'Exemplo excluído.')}
            />
            <BotaoLeve label="Manter" onPress={() => setConfirmaExcluir(false)} />
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, ativo && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: ativo }}>
      <Text style={[styles.chipTexto, ativo && styles.chipTextoOn]}>{label}</Text>
    </Pressable>
  );
}

function Botao({ label, onPress, ocupado }: { label: string; onPress: () => void; ocupado?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={ocupado} style={({ pressed }) => [styles.botao, (pressed || ocupado) && styles.pressionado]}>
      {ocupado ? <ActivityIndicator color={colors.branco} size="small" /> : <Text style={styles.botaoTexto}>{label}</Text>}
    </Pressable>
  );
}

function BotaoLeve({ label, onPress, ocupado, perigo }: { label: string; onPress: () => void; ocupado?: boolean; perigo?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={ocupado} style={({ pressed }) => [styles.botaoLeve, (pressed || ocupado) && styles.pressionado]}>
      {ocupado ? (
        <ActivityIndicator color={colors.mata} size="small" />
      ) : (
        <Text style={[styles.botaoLeveTexto, perigo && styles.botaoPerigoTexto]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center' },
  vazioLista: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center', paddingVertical: space.section },
  conteudo: { padding: 16, gap: space.item, paddingBottom: space.block, width: '100%', maxWidth: 760, alignSelf: 'center' },

  abas: { flexDirection: 'row', marginHorizontal: 16, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.branco, maxWidth: 728, alignSelf: 'center', width: '100%' },
  aba: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  abaOn: { backgroundColor: colors.mata },
  abaTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.cinza },
  abaTextoOn: { color: colors.branco },

  explica: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.tinta },
  dica: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza, marginTop: 4 },

  aviso: { backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 12, padding: 12 },
  avisoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.okEscuro },
  avisoErro: { backgroundColor: '#FDF1EF', borderWidth: 1, borderColor: colors.critico, borderRadius: 12, padding: 12 },
  avisoErroTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.criticoTexto },
  avisoAmbar: { backgroundColor: '#FDF6E9', borderWidth: 1, borderColor: colors.alerta, borderRadius: 12, padding: 12, marginTop: space.tight },
  avisoAmbarTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, lineHeight: 19, color: colors.alertaTexto },

  card: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, gap: 4 },
  cardInativo: { opacity: 0.6 },
  cardTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  cardEscopo: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza },
  novoTitulo: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta, marginBottom: 4 },

  selo: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  seloTexto: { fontFamily: fonts.corpoMedio, fontSize: 11.5 },
  seloOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  seloOnTexto: { color: colors.okEscuro },
  seloMeio: { borderColor: colors.alerta, backgroundColor: '#FDF6E9' },
  seloMeioTexto: { color: colors.alertaTexto },
  seloOff: { borderColor: colors.linha, backgroundColor: colors.papel },
  seloOffTexto: { color: colors.cinza },

  rotulo: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza, marginTop: space.tight },
  input: { borderWidth: 1, borderColor: colors.linha, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontFamily: fonts.corpo, fontSize: 15, lineHeight: 21, color: colors.tinta, backgroundColor: colors.papel, marginTop: 4 },
  inputTitulo: { fontFamily: fonts.corpoForte },
  inputMedio: { minHeight: 72 },
  inputAlto: { minHeight: 128 },
  contador: { fontFamily: fonts.corpo, fontSize: 11.5, color: colors.cinza, textAlign: 'right', marginTop: 2 },
  erroCampo: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.criticoTexto, marginTop: space.tight },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: colors.papel },
  chipOn: { borderColor: colors.mata, backgroundColor: colors.mata },
  chipTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },
  chipTextoOn: { color: colors.branco },

  caixaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.item },
  caixaTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13.5, color: colors.tinta },

  acoes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: space.item },
  botao: { backgroundColor: colors.mata, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', minWidth: 120 },
  botaoTexto: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.branco },
  botaoLeve: { borderWidth: 1, borderColor: colors.linha, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', backgroundColor: colors.branco },
  botaoLeveTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.mata },
  botaoPerigoTexto: { color: colors.criticoTexto },
  botaoNovo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.mata, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, backgroundColor: colors.branco },
  botaoNovoTexto: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.mata },
  pressionado: { opacity: 0.7 },

  confirma: { borderTopWidth: 1, borderTopColor: colors.linha, marginTop: space.item, paddingTop: space.tight },
  confirmaTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.criticoTexto },

  historico: { borderTopWidth: 1, borderTopColor: colors.linha, marginTop: space.item, paddingTop: space.tight, gap: space.item },
  versao: { gap: 4, alignItems: 'flex-start' },
  versaoData: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza },
  versaoTexto: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 19, color: colors.tinta },

  perguntaFeita: { fontFamily: fonts.corpoForte, fontSize: 15, lineHeight: 21, color: colors.tinta },
  resposta: { backgroundColor: colors.papel, borderRadius: 12, padding: 12, marginTop: space.tight },
  respostaTexto: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: colors.tinta },
  aplicado: { fontFamily: fonts.corpoMedio, fontSize: 13, lineHeight: 19, color: colors.tinta, marginTop: 2 },
  aplicadoLeve: { fontFamily: fonts.corpo, color: colors.cinza },
});
