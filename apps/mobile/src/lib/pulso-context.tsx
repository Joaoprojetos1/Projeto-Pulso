/**
 * Estado global mínimo do app: o dashboard carregado, de onde ele veio
 * (servidor de verdade ou demonstração) e se o dono continua logado.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchCompanies, fetchDashboard, type DashboardJson } from './api';
import { DEMO_DASHBOARD } from './demo';
import { registrarParaAvisos } from './push';

export type Fonte = 'servidor' | 'demo';

const CHAVE_SESSAO = 'pulso.logado';

interface PulsoState {
  dashboard: DashboardJson | null;
  fonte: Fonte | null;
  companyId: string | null;
  carregando: boolean;
  /** O servidor não respondeu na última tentativa (mostra erro em vez de entrar vazio). */
  erro: boolean;
  /** Enquanto verifica se havia sessão salva (abertura do app). */
  restaurando: boolean;
  /** O dono já entrou e a sessão está guardada. */
  logado: boolean;
  /** Busca no servidor. Retorna true se conseguiu; false marca `erro` e NÃO entra. */
  carregar: () => Promise<boolean>;
  /** Entra no modo demonstração de propósito (dados fictícios rotulados). */
  entrarDemo: () => void;
  sair: () => void;
}

const Ctx = createContext<PulsoState | null>(null);

export function PulsoProvider({ children }: { children: ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardJson | null>(null);
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [restaurando, setRestaurando] = useState(true);
  const [logado, setLogado] = useState(false);

  const carregar = useCallback(async (): Promise<boolean> => {
    setCarregando(true);
    setErro(false);
    try {
      const companies = await fetchCompanies();
      if (companies.length === 0) throw new Error('sem empresas no servidor');
      const id = companies[0]!.id;
      const dash = await fetchDashboard(id);
      setDashboard(dash);
      setFonte('servidor');
      setCompanyId(id);
      // registra este celular para receber os avisos (silencioso se falhar)
      void registrarParaAvisos(id);
      setLogado(true);
      void AsyncStorage.setItem(CHAVE_SESSAO, 'sim');
      return true;
    } catch {
      // NÃO entra vazio: sinaliza o erro para a tela mostrar "tentar de novo".
      setErro(true);
      return false;
    } finally {
      setCarregando(false);
    }
  }, []);

  const entrarDemo = useCallback(() => {
    setDashboard(DEMO_DASHBOARD);
    setFonte('demo');
    setCompanyId(null);
    setErro(false);
    setLogado(true);
    void AsyncStorage.setItem(CHAVE_SESSAO, 'sim');
  }, []);

  // na abertura do app: se havia sessão salva, entra direto (sem pedir login)
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const salvo = await AsyncStorage.getItem(CHAVE_SESSAO);
        if (vivo && salvo === 'sim') await carregar();
      } catch {
        // sem sessão salva: segue para a tela de login normalmente
      } finally {
        if (vivo) setRestaurando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [carregar]);

  const sair = useCallback(() => {
    setDashboard(null);
    setFonte(null);
    setCompanyId(null);
    setErro(false);
    setLogado(false);
    void AsyncStorage.removeItem(CHAVE_SESSAO);
  }, []);

  const value = useMemo(
    () => ({
      dashboard,
      fonte,
      companyId,
      carregando,
      erro,
      restaurando,
      logado,
      carregar,
      entrarDemo,
      sair,
    }),
    [dashboard, fonte, companyId, carregando, erro, restaurando, logado, carregar, entrarDemo, sair],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePulso(): PulsoState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePulso precisa estar dentro de <PulsoProvider>');
  return ctx;
}
