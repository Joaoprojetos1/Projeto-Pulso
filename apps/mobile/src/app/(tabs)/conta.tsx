/**
 * Conta. Sem checkout dentro do app — nem botão, nem link clicável de
 * pagamento (regra do KICKOFF: a assinatura acontece no site; é isso que
 * mantém a comissão da loja fora do ticket).
 */

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function Conta() {
  const { dashboard, fonte, sair } = usePulso();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titulo}>Conta</Text>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>NEGÓCIO</Text>
          <Text style={styles.nome}>{dashboard?.company.name ?? '—'}</Text>
          <Text style={styles.detalhe}>
            {fonte === 'demo' ? 'Modo demonstração · dados fictícios' : 'Conectada ao servidor do Pulso'}
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>PLANO</Text>
          <Text style={styles.nome}>Piloto</Text>
          <Text style={styles.detalhe}>
            Você faz parte da turma que está construindo o Pulso com a gente. A assinatura, quando
            chegar, acontece no site do Pulso — nada de pagamento por aqui.
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>AVISOS NO WHATSAPP</Text>
          <View style={styles.linhaAviso}>
            <Text style={styles.nome}>Alertas de caixa</Text>
            <View style={styles.selo}>
              <Text style={styles.seloTexto}>EM BREVE</Text>
            </View>
          </View>
          <Text style={styles.detalhe}>
            Quando o aviso pelo WhatsApp estiver ligado, os alertas sérios (como o caixa perto de
            zerar) chegam direto no seu número, uma vez por dia. Por enquanto você acompanha tudo aqui
            no app e no painel.
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>SEUS DADOS</Text>
          <Text style={styles.detalhe}>
            Os lançamentos do seu negócio ficam guardados no servidor do Pulso, protegidos e usados só
            para calcular seus indicadores. Nenhum dado seu treina IA nem é compartilhado.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.sair, pressed && styles.pressionado]}
          onPress={() => {
            sair();
            router.replace('/');
          }}
        >
          <Text style={styles.sairTexto}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 18, gap: 12 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  cartao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    gap: 5,
  },
  rotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  nome: { fontFamily: fonts.display, fontSize: 17, color: colors.tinta, letterSpacing: -0.2 },
  detalhe: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza },
  linhaAviso: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selo: {
    backgroundColor: '#F0FBF6',
    borderWidth: 1,
    borderColor: colors.vivo,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  seloTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.okEscuro },

  sair: {
    borderWidth: 1.5,
    borderColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  pressionado: { opacity: 0.7 },
  sairTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
});
