import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs, type Href } from 'expo-router';
import { useEffect } from 'react';

import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  const { ehAdmin, assinatura, fonte, logado, cadastroCompleto } = usePulso();

  // O reset de navegação por logout vive no AuthGate (raiz). Aqui fica só o gate
  // da assinatura: quem está logado e PENDENTE não usa as abas — cai na tela
  // de planos. Fail-open: só bloqueia com 'pendente' explícito (erro, carregando,
  // ativa e demonstração passam, para nunca trancar quem já é ativo).
  useEffect(() => {
    if (logado && fonte === 'servidor' && assinatura?.status === 'pendente') {
      router.replace('/assinar' as Href);
    }
  }, [logado, fonte, assinatura?.status]);

  // TRANCA DO ONBOARDING OBRIGATÓRIO (Bloco 1): sem o cadastro da empresa (CNPJ +
  // segmento) o dono não usa as abas — vai para o onboarding. Ponto único de
  // controle: pega quem se cadastrou e pulou, e quem já pulou em sessões antigas.
  // Fail-open: só bloqueia com FALSE explícito (null = ainda carregando; admin e
  // demonstração passam sempre, para não prender operador nem a demo).
  if (logado && fonte === 'servidor' && !ehAdmin && cadastroCompleto === false) {
    return <Redirect href={'/onboarding' as Href} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // troca de aba com um leve fade em vez de corte seco
        animation: 'fade',
        tabBarActiveTintColor: colors.vivo,
        tabBarInactiveTintColor: colors.cinza,
        tabBarStyle: {
          backgroundColor: colors.branco,
          borderTopColor: colors.linha,
        },
        tabBarLabelStyle: { fontFamily: fonts.corpoMedio, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.papel },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="relatorios"
        options={{
          title: 'Relatórios',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Contas (cadastro manual a pagar/receber): removida da barra por decisão
          de produto — o dono não digita; os dados a pagar/receber virão prontos do
          sistema da clínica. href null só ESCONDE a aba: a tela e o motor de
          previstas seguem intactos (a projeção ainda os considera se existirem), é
          só religar a aba quando a fonte automática entrar. */}
      <Tabs.Screen
        name="contas"
        options={{
          title: 'Contas',
          href: null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'IA Pulso',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dados"
        options={{
          title: 'Dados',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-open-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="conta"
        options={{
          title: 'Conta',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Operação: só aparece para operadores (admin). Para os demais o href é
          null, então a aba nem existe. A tela também se protege ao abrir. */}
      <Tabs.Screen
        name="operacao"
        options={{
          title: 'Operação',
          href: ehAdmin ? ('/operacao' as Href) : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
