/**
 * Alimentar o Pulso — o "hub" de entrada de dados.
 *
 * Reúne as formas de abastecer o motor: cada fonte (extrato, maquininha, DRE)
 * preenche uma "premissa" do cálculo. Ligados: EXTRATO bancário (sobe o arquivo →
 * /me/import lê no servidor → motor gira) e a entrada MANUAL (/configurar).
 * Maquininha e DRE seguem "Em breve".
 *
 * ⚠️ NÃO PUBLICAR POR OTA: o seletor de arquivo usa módulo NATIVO
 * (expo-document-picker / expo-file-system). Só funciona em APK NOVO — mandar
 * este JS por atualização automática ao APK atual quebraria o app. Vai junto do
 * próximo APK (o do push/Firebase).
 *
 * Regra de ouro: quem lê o arquivo é o CÓDIGO, nunca a IA. O app é burro: aqui
 * ele só apresenta os caminhos e navega.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { escolherExtrato } from '@/lib/file-upload';
import { importFile } from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Fonte {
  chave: string;
  icone: IconName;
  titulo: string;
  descricao: string;
  disponivel: boolean;
  rota?: Href;
}

const FONTES: Fonte[] = [
  {
    chave: 'arquivos',
    icone: 'document-text-outline',
    titulo: 'Enviar arquivos',
    descricao:
      'Vários de uma vez, de meses diferentes: extrato bancário, relatórios, documentos contábeis. Você classifica cada um; o Pulso lê o que sabe ler e recalcula.',
    disponivel: true,
    rota: '/enviar' as Href,
  },
  {
    chave: 'maquininha',
    icone: 'card-outline',
    titulo: 'Maquininha de cartão',
    descricao:
      'O que você já vendeu e ainda vai receber: o dinheiro preso que o extrato não mostra.',
    disponivel: false,
  },
  {
    chave: 'dre',
    icone: 'reader-outline',
    titulo: 'DRE ou balancete',
    descricao:
      'O resumo do mês do seu contador: receita, custos, margem e custo fixo.',
    disponivel: false,
  },
  {
    chave: 'manual',
    icone: 'create-outline',
    titulo: 'Informar à mão',
    descricao:
      'Sem arquivo agora? Informe o caixa de hoje e o custo fixo do mês. O motor liga na hora.',
    disponivel: true,
    rota: '/configurar' as Href,
  },
];

export default function Alimentar() {
  const { token, carregar } = usePulso();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function subirExtrato() {
    if (!token) {
      setErro('Entre na sua conta para enviar um arquivo.');
      return;
    }
    setErro(null);
    let arquivo;
    try {
      arquivo = await escolherExtrato();
    } catch {
      setErro('Não consegui abrir seus arquivos. Tente de novo.');
      return;
    }
    if (!arquivo) return; // o dono cancelou a escolha

    setOcupado(true);
    try {
      await importFile(token, arquivo.nome, arquivo.base64);
      await carregar();
      router.replace('/(tabs)');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui importar o arquivo.');
    } finally {
      setOcupado(false);
    }
  }

  function aoTocar(f: Fonte) {
    if (ocupado) return;
    if (f.rota) router.push(f.rota);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.voltar}>
          <Ionicons name="chevron-back" size={22} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Alimentar o Pulso</Text>
        <View style={styles.voltar} />
      </View>

      <ScrollView contentContainerStyle={styles.corpo}>
        <Animated.View entering={FadeInDown.duration(220)}>
          <Text style={styles.titulo}>Por onde o Pulso vai conhecer o seu caixa?</Text>
          <Text style={styles.subtitulo}>
            Quanto mais o Pulso souber do seu negócio, melhor ele prevê o caixa. Escolha por
            onde começar; dá para juntar mais de uma fonte.
          </Text>
        </Animated.View>

        {erro && (
          <View style={styles.erroBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.critico} />
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        <View style={styles.lista}>
          {FONTES.map((f, i) => (
            <Animated.View key={f.chave} entering={FadeInDown.duration(240).delay(60 + i * 40)}>
              <FonteCard
                fonte={f}
                ocupado={ocupado && f.chave === 'extrato'}
                onPress={() => aoTocar(f)}
              />
            </Animated.View>
          ))}
        </View>

        <View style={styles.nota}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.okEscuro} />
          <Text style={styles.notaTexto}>
            Quem lê o seu arquivo é o código do Pulso, nunca a IA — e o Pulso nunca inventa um
            número: tudo que ele mostra vem do seu arquivo.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FonteCard({
  fonte,
  ocupado,
  onPress,
}: {
  fonte: Fonte;
  ocupado: boolean;
  onPress: () => void;
}) {
  const ativo = fonte.disponivel;
  return (
    <Pressable
      disabled={!ativo || ocupado}
      onPress={onPress}
      style={({ pressed }) => [styles.card, !ativo && styles.cardOff, pressed && ativo && styles.pressionado]}
    >
      <View style={[styles.icone, ativo && styles.iconeAtivo]}>
        <Ionicons name={fonte.icone} size={22} color={ativo ? colors.okEscuro : colors.cinza} />
      </View>

      <View style={styles.cardTexto}>
        <Text style={styles.cardTitulo}>{fonte.titulo}</Text>
        <Text style={styles.cardDescricao}>{fonte.descricao}</Text>
        <View style={[styles.selo, ativo ? styles.seloAtivo : styles.seloEmBreve]}>
          <Text style={[styles.seloTexto, ativo ? styles.seloTextoAtivo : styles.seloTextoEmBreve]}>
            {ativo ? 'Disponível' : 'Em breve'}
          </Text>
        </View>
      </View>

      {ocupado ? (
        <ActivityIndicator color={colors.okEscuro} />
      ) : (
        ativo && <Text style={styles.seta}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.tinta },
  corpo: { paddingHorizontal: 20, paddingBottom: space.block },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: colors.tinta,
    letterSpacing: -0.4,
    marginTop: space.tight,
  },
  subtitulo: {
    fontFamily: fonts.corpo,
    fontSize: 14,
    lineHeight: 21,
    color: colors.cinza,
    marginTop: space.tight,
  },
  lista: { gap: space.item, marginTop: space.section },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.item,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 14,
  },
  cardOff: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  pressionado: { opacity: 0.6 },
  icone: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDECEA',
  },
  iconeAtivo: { backgroundColor: '#F0FBF6' },
  cardTexto: { flex: 1, gap: 5 },
  cardTitulo: { fontFamily: fonts.display, fontSize: 15.5, color: colors.tinta, letterSpacing: -0.2 },
  cardDescricao: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza },
  selo: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, marginTop: 2 },
  seloAtivo: { backgroundColor: '#DDF6EA' },
  seloEmBreve: { backgroundColor: '#EDECEA' },
  seloTexto: { fontFamily: fonts.corpoForte, fontSize: 10.5, letterSpacing: 0.3 },
  seloTextoAtivo: { color: colors.okEscuro },
  seloTextoEmBreve: { color: colors.cinza },
  seta: { fontFamily: fonts.display, fontSize: 22, color: colors.cinza },
  nota: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#F0FBF6',
    borderRadius: 12,
    padding: 12,
    marginTop: space.section,
  },
  notaTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.tinta },
  erroBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FDEDEA',
    borderRadius: 12,
    padding: 12,
    marginTop: space.section,
  },
  erroTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.critico },
});
