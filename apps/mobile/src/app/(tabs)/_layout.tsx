import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors, fonts } from '@/theme';

export default function TabsLayout() {
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
        name="chat"
        options={{
          title: 'Conversa',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
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
    </Tabs>
  );
}
