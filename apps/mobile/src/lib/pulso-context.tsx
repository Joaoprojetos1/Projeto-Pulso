/**
 * Estado global do app: o painel carregado, de onde ele veio (servidor de
 * verdade ou demonstração), a sessão do dono (login de verdade) e se ele
 * continua logado.
 *
 * Login de verdade: o dono se cadastra/entra, recebemos um token, guardamos no
 * aparelho e usamos nas rotas /me. O app segue burro — só busca e desenha.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  authLogin,
  authLogout,
  authSignup,
  AuthError,
  fetchMyDashboard,
  fetchMySubscription,
  type DashboardJson,
  type MySubscription,
  type UserRole,
} from './api';
import { DEMO_DASHBOARD } from './demo';
import { registrarParaAvisos } from './push';

export type Fonte = 'servidor' | 'demo';

const CHAVE_TOKEN = 'pulso.token';
const CHAVE_CACHE = 'pulso.cache.dashboard';

interface PulsoState {
  dashboard: DashboardJson | null;
  fonte: Fonte | null;
  companyId: string | null;
  /** Token da sessão (rotas /me). Null em demonstração. */
  token: string | null;
  /** Papel do dono logado. 'owner' por padrão; 'admin' vê a área de operação. */
  role: UserRole | null;
  /** Atalho: o dono logado é operador (admin) e NÃO está em demonstração. */
  ehAdmin: boolean;
  carregando: boolean;
  /** Mensagem de erro da última tentativa (login/carga), ou null. */
  erro: string | null;
  /** Enquanto verifica se havia sessão salva (abertura do app). */
  restaurando: boolean;
  /** O dono já entrou. */
  logado: boolean;
  /** O dashboard na tela veio do cache local (offline); o refresh ainda não substituiu. */
  mostrandoCache: boolean;
  /** Assinatura do dono logado (null = ainda não carregou / demo). */
  assinatura: MySubscription | null;
  /** Re-consulta a assinatura (usado pelo "Já paguei, atualizar"). */
  atualizarAssinatura: () => Promise<MySubscription | null>;
  /** Cria a conta (autocadastro). Retorna true se entrou. */
  cadastrar: (businessName: string, email: string, password: string) => Promise<boolean>;
  /** Entra com e-mail e senha. Retorna true se entrou. */
  entrar: (email: string, password: string) => Promise<boolean>;
  /** Recarrega o painel do dono logado (pull-to-refresh / tentar de novo). */
  carregar: () => Promise<boolean>;
  /** Entra no modo demonstração (dados fictícios rotulados). */
  entrarDemo: () => void;
  sair: () => void;
}

const Ctx = createContext<PulsoState | null>(null);

export function PulsoProvider({ children }: { children: ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardJson | null>(null);
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const [logado, setLogado] = useState(false);
  const [mostrandoCache, setMostrandoCache] = useState(false);
  const [assinatura, setAssinatura] = useState<MySubscription | null>(null);

  // ref para o carregar() sempre enxergar o token atual sem recriar a função
  const tokenRef = useRef<string | null>(null);
  const guardarToken = useCallback(async (t: string) => {
    tokenRef.current = t;
    setToken(t);
    await AsyncStorage.setItem(CHAVE_TOKEN, t);
  }, []);

  const limparSessao = useCallback(async () => {
    tokenRef.current = null;
    setToken(null);
    setRole(null);
    setDashboard(null);
    setFonte(null);
    setCompanyId(null);
    setLogado(false);
    setMostrandoCache(false);
    setAssinatura(null);
    await AsyncStorage.multiRemove([CHAVE_TOKEN, CHAVE_CACHE]);
  }, []);

  /** Re-consulta a assinatura (o "Já paguei, atualizar" chama isto). */
  const atualizarAssinatura = useCallback(async (): Promise<MySubscription | null> => {
    const t = tokenRef.current;
    if (!t) return null;
    try {
      const s = await fetchMySubscription(t);
      setAssinatura(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  /** Guarda o último dashboard de servidor, para abrir offline depois. */
  const salvarCache = useCallback(async (id: string, dash: DashboardJson) => {
    try {
      await AsyncStorage.setItem(CHAVE_CACHE, JSON.stringify({ companyId: id, dashboard: dash }));
    } catch {
      // cache é conforto, nunca pode quebrar o app
    }
  }, []);

  /** Busca o painel do dono logado. Usa o token guardado (ou o passado). */
  const carregar = useCallback(async (tok?: string): Promise<boolean> => {
    const t = tok ?? tokenRef.current;
    if (!t) return false;
    setCarregando(true);
    setErro(null);
    try {
      const { dashboard: dash, companyId: id, role: papel } = await fetchMyDashboard(t);
      setDashboard(dash);
      setCompanyId(id);
      setRole(papel);
      setFonte('servidor');
      setLogado(true);
      setMostrandoCache(false); // dado fresco do servidor substitui o cache
      // assinatura (para o gate). Fail-open: o gate só bloqueia com 'pendente' explícito.
      try {
        setAssinatura(await fetchMySubscription(t));
      } catch {
        /* não trava o login se a consulta falhar */
      }
      if (dash) void salvarCache(id, dash); // guarda p/ abrir offline na próxima
      // registra este celular para receber os avisos (escopado pelo token; silencioso se falhar)
      void registrarParaAvisos(t);
      return true;
    } catch (e) {
      if (e instanceof AuthError && e.tipo === 'credenciais') {
        await limparSessao();
        setErro('Sua sessão expirou. Entre de novo.');
      } else {
        setErro('Não consegui falar com o servidor agora.');
      }
      return false;
    } finally {
      setCarregando(false);
    }
  }, [limparSessao, salvarCache]);

  const entrar = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await authLogin(email, password);
        await guardarToken(r.token);
        return await carregar(r.token);
      } catch (e) {
        setErro(e instanceof AuthError ? e.message : 'Não consegui entrar agora.');
        setCarregando(false);
        return false;
      }
    },
    [carregar, guardarToken],
  );

  const cadastrar = useCallback(
    async (businessName: string, email: string, password: string): Promise<boolean> => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await authSignup(businessName, email, password);
        await guardarToken(r.token);
        return await carregar(r.token);
      } catch (e) {
        setErro(e instanceof AuthError ? e.message : 'Não consegui criar a conta agora.');
        setCarregando(false);
        return false;
      }
    },
    [carregar, guardarToken],
  );

  const entrarDemo = useCallback(() => {
    setDashboard(DEMO_DASHBOARD);
    setFonte('demo');
    setCompanyId(null);
    setRole(null); // demonstração nunca é admin
    setErro(null);
    setLogado(true);
    setMostrandoCache(false); // demonstração não é cache de servidor
  }, []);

  const sair = useCallback(() => {
    const t = tokenRef.current;
    if (t) void authLogout(t);
    void limparSessao();
    // reset de navegação: sair de QUALQUER tela volta à porta de entrada.
    // dismissAll fecha modais abertos (alerta) antes de trocar a raiz.
    if (router.canDismiss?.()) router.dismissAll();
    router.replace('/');
  }, [limparSessao]);

  // abertura do app: se havia token salvo, entra direto (mantém logado)
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const salvo = await AsyncStorage.getItem(CHAVE_TOKEN);
        if (vivo && salvo) {
          tokenRef.current = salvo;
          setToken(salvo);
          // mostra o último dashboard conhecido NA HORA — app financeiro não abre vazio
          try {
            const bruto = await AsyncStorage.getItem(CHAVE_CACHE);
            if (vivo && bruto) {
              const guardado = JSON.parse(bruto) as { companyId: string; dashboard: DashboardJson };
              if (guardado?.dashboard) {
                setDashboard(guardado.dashboard);
                setCompanyId(guardado.companyId);
                setFonte('servidor');
                setLogado(true);
                setMostrandoCache(true);
              }
            }
          } catch {
            // cache inválido: ignora e segue direto para o fetch
          }
          // busca o dado novo por trás; se falhar (offline), o cache continua na tela
          await carregar(salvo);
        }
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

  const value = useMemo(
    () => ({
      dashboard,
      fonte,
      companyId,
      token,
      role,
      ehAdmin: role === 'admin' && fonte === 'servidor',
      carregando,
      erro,
      restaurando,
      logado,
      mostrandoCache,
      assinatura,
      atualizarAssinatura,
      cadastrar,
      entrar,
      carregar: () => carregar(),
      entrarDemo,
      sair,
    }),
    [
      dashboard,
      fonte,
      companyId,
      token,
      role,
      carregando,
      erro,
      restaurando,
      logado,
      mostrandoCache,
      assinatura,
      atualizarAssinatura,
      cadastrar,
      entrar,
      carregar,
      entrarDemo,
      sair,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePulso(): PulsoState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePulso precisa estar dentro de <PulsoProvider>');
  return ctx;
}
