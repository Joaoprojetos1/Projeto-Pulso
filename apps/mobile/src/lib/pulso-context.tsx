/**
 * Estado global mínimo do app: o dashboard carregado e de onde ele veio
 * (servidor de verdade ou demonstração).
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { fetchCompanies, fetchDashboard, type DashboardJson } from './api';
import { DEMO_DASHBOARD } from './demo';

export type Fonte = 'servidor' | 'demo';

interface PulsoState {
  dashboard: DashboardJson | null;
  fonte: Fonte | null;
  carregando: boolean;
  /** Busca no servidor; se ele não responder, entra a demonstração. */
  carregar: () => Promise<void>;
  sair: () => void;
}

const Ctx = createContext<PulsoState | null>(null);

export function PulsoProvider({ children }: { children: ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardJson | null>(null);
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const companies = await fetchCompanies();
      if (companies.length === 0) throw new Error('sem empresas no servidor');
      const dash = await fetchDashboard(companies[0]!.id);
      setDashboard(dash);
      setFonte('servidor');
    } catch {
      setDashboard(DEMO_DASHBOARD);
      setFonte('demo');
    } finally {
      setCarregando(false);
    }
  }, []);

  const sair = useCallback(() => {
    setDashboard(null);
    setFonte(null);
  }, []);

  const value = useMemo(
    () => ({ dashboard, fonte, carregando, carregar, sair }),
    [dashboard, fonte, carregando, carregar, sair],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePulso(): PulsoState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePulso precisa estar dentro de <PulsoProvider>');
  return ctx;
}
