
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../../types';
import { Building2, Mail, Lock, UserPlus, AlertCircle, CheckCircle2, Loader2, ChevronDown, Clock, Calendar } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';

// ─── Logo dinâmica (busca clinic_settings do banco) ────────────────────────
const FullLogo: React.FC<{ logoUrl?: string; clinicName?: string }> = ({ logoUrl, clinicName }) => (
  <div className="flex flex-col items-center mb-8">
    <div className="bg-[var(--primary-color)] w-16 h-16 rounded-lg shadow-sm mb-4 flex items-center justify-center overflow-hidden">
      <img
        src={logoUrl || 'https://placehold.co/400x400/00a5b5/ffffff.png?text=Logo'}
        alt="Logo da Clínica"
        className="w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/00a5b5/ffffff.png?text=Logo'; }}
      />
    </div>
    <h1 className="text-2xl font-bold text-[#1e3a5a] tracking-tight">{clinicName || 'GestãoEstética'}</h1>
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 text-center">
      SISTEMA DE GESTÃO PARA CLÍNICAS E ESTÉTICAS
    </p>
  </div>
);

// ─── Toast ─────────────────────────────────────────────────────────────────
interface ToastProps { message: string; type: 'error' | 'success' | 'warning'; }
const Toast: React.FC<ToastProps> = ({ message, type }) => {
  const configs = {
    error: { bg: 'bg-red-50 border-red-200 text-red-700', icon: <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" /> },
    success: { bg: 'bg-green-50 border-green-200 text-green-700', icon: <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-green-500" /> },
    warning: { bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: <Clock size={18} className="shrink-0 mt-0.5 text-amber-500" /> },
  };
  const { bg, icon } = configs[type];
  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl text-sm font-medium animate-in slide-in-from-top-2 duration-300 border ${bg}`}>
      {icon}
      <span>{message}</span>
    </div>
  );
};

interface LoginProps { onLogin: (u: User) => void; }

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [registerRole, setRegisterRole] = useState<'receptionist' | 'professional' | 'admin'>('receptionist');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'warning' } | null>(null);

  // Branding dinâmico da clínica
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | undefined>(undefined);
  const [clinicDisplayName, setClinicDisplayName] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase
      .from('clinic_settings')
      .select('clinic_name, logo_url')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[Login] Erro ao buscar clinic_settings:', error.message);
          return;
        }
        if (data) {
          if (data.clinic_name) setClinicDisplayName(data.clinic_name);
          if (data.logo_url) setClinicLogoUrl(data.logo_url);
        }
      });
  }, []);

  // Set the document title dynamically
  useEffect(() => {
    if (clinicDisplayName) {
      document.title = `${clinicDisplayName} - Plataforma`;
    } else {
      document.title = 'GestãoFisio - Plataforma';
    }
  }, [clinicDisplayName]);

  const showToast = (message: string, type: 'error' | 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 7000);
  };

  const translateError = (error: string): string => {
    if (error.includes('Invalid login credentials')) return 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.';
    if (error.includes('Email not confirmed')) return 'Confirme seu e-mail antes de fazer login. Verifique sua caixa de entrada.';
    if (error.includes('User already registered') || error.includes('already been registered')) return 'Este e-mail já está cadastrado. Tente fazer login.';
    if (error.includes('Password should be')) return 'A senha deve ter pelo menos 6 caracteres.';
    if (error.includes('Unable to validate email')) return 'Formato de e-mail inválido.';
    if (error.includes('rate limit') || error.includes('too many requests')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    return error;
  };

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) { showToast('Preencha o e-mail e a senha.', 'error'); return; }
    setLoading(true);
    setToast(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) { showToast(translateError(error.message), 'error'); return; }

      if (data.user) {
        // ── Verificar pending em tempo real no banco (não no cache do user_metadata) ──
        // Isso garante que após o Admin aprovar, o usuário consegue logar sem precisar
        // de um novo token — consultamos a tabela profiles diretamente.
        const { data: profileData } = await supabase
          .from('profiles')
          .select('pending, role, full_name, avatar_url')
          .eq('id', data.user.id)
          .single();

        // Se o perfil existe e está pendente → bloqueia
        if (profileData?.pending === true) {
          showToast(
            'Seu acesso está aguardando aprovação do administrador. Você receberá uma notificação quando for aprovado.',
            'warning'
          );
          await supabase.auth.signOut();
          return;
        }

        // Role: usa o do banco (mais atualizado) ou cai no user_metadata como fallback
        const metaRole = (profileData?.role || data.user.user_metadata?.role) as string;
        const resolvedRole =
          metaRole === 'receptionist' ? UserRole.RECEPTIONIST
          : metaRole === 'professional' ? UserRole.PROFESSIONAL
          : UserRole.ADMIN;

        const meta = data.user.user_metadata;
        const user: User = {
          id: data.user.id,
          name: profileData?.full_name || meta?.name || data.user.email?.split('@')[0] || 'Usuário',
          email: data.user.email || email,
          role: resolvedRole,
          clinicId: undefined as any,
          avatar: profileData?.avatar_url || meta?.avatar_url || '',
          ...(metaRole ? { metaRole } as any : {}),
        } as any;

        localStorage.setItem('fisiopro_user', JSON.stringify(user));
        onLogin(user);
        window.location.hash = '#home';
      }
    } catch (err) {
      showToast('Ocorreu um erro inesperado. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── REGISTRO ───────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!name || !email || !password) { showToast('Preencha todos os campos.', 'error'); return; }
    if (password.length < 6) { showToast('A senha deve ter pelo menos 6 caracteres.', 'error'); return; }

    setLoading(true);
    setToast(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role: registerRole,
            pending: true,   // Todos os novos cadastros ficam pendentes de aprovação
          },
        },
      });

      if (error) { showToast(translateError(error.message), 'error'); return; }

      if (data.user) {
        // Criar notificação para o Admin no banco
        const roleLabel = registerRole === 'receptionist' ? 'Recepcionista'
          : registerRole === 'professional' ? 'Profissional'
          : 'Administrador';

        await supabase.from('notifications').insert({
          title: '🆕 Nova Solicitação de Acesso',
          message: `${name} (${email}) solicitou acesso como ${roleLabel}. Aprovação pendente no painel Admin.`,
          is_read: false,
          pending_user_id: data.user.id,
          pending_user_name: name,
          pending_user_role: registerRole,
        });

        // Cadastro sempre exige aprovação — nunca loga direto
        showToast(
          `Cadastro recebido! Sua solicitação de acesso como ${roleLabel} foi enviada ao administrador. Aguarde a aprovação.`,
          'success'
        );
        setTimeout(() => switchMode('login'), 3000);
      }
    } catch (err) {
      showToast('Ocorreu um erro inesperado. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') mode === 'login' ? handleLogin() : handleRegister();
  };

  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setToast(null);
    setEmail('');
    setPassword('');
    setName('');
    setRegisterRole('receptionist');
  };

  const getRoleSelectLabel = () => {
    if (registerRole === 'receptionist') return 'Recepcionista';
    if (registerRole === 'professional') return 'Profissional / Colaborador';
    return 'Administrador';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa] p-4">
      <div className="w-full max-w-[440px] bg-white rounded-[40px] shadow-2xl p-8 md:p-12 border border-gray-100 animate-in zoom-in-95 duration-500 text-left">

        <FullLogo logoUrl={clinicLogoUrl} clinicName={clinicDisplayName} />

        {/* Toast de Feedback */}
        {toast && (
          <div className="mb-6">
            <Toast message={toast.message} type={toast.type} />
          </div>
        )}

        <div className="space-y-5" onKeyDown={handleKeyDown}>

          {/* Campo Nome (Registro) */}
          {mode === 'register' && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-bold text-gray-800 ml-1">Nome Completo</label>
              <div className="relative">
                <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-800 focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] outline-none transition-all font-medium text-sm"
                  placeholder="Seu nome completo"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Campo E-mail */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-800 ml-1">Email Profissional</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-800 focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] outline-none transition-all font-medium text-sm"
                placeholder="exemplo@estetica.com"
                autoFocus={mode === 'login'}
              />
            </div>
          </div>

          {/* Campo Senha */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-800 ml-1">Senha de Acesso</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-800 focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] outline-none transition-all font-medium text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Seletor de Cargo (Registro) */}
          {mode === 'register' && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
              <label className="text-xs font-bold text-gray-800 ml-1">Cargo / Função</label>
              <div className="relative">
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                <select
                  value={registerRole}
                  onChange={(e) => setRegisterRole(e.target.value as 'receptionist' | 'professional' | 'admin')}
                  className="w-full pl-4 pr-12 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-800 focus:ring-2 focus:ring-[var(--primary-color)]/20 focus:border-[var(--primary-color)] outline-none transition-all font-medium text-sm appearance-none cursor-pointer"
                >
                  <option value="receptionist">Recepcionista</option>
                  <option value="professional">Profissional / Colaborador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <p className="text-[11px] text-amber-600 font-medium ml-1 flex items-center gap-1">
                <Clock size={11} /> Seu acesso ficará pendente até aprovação do administrador
              </p>
            </div>
          )}

          {/* Botão Principal */}
          <div className="pt-2 space-y-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center mb-2">
              {mode === 'login' ? 'Acesse seu sistema' : 'Criar nova conta'}
            </p>

            <button
              onClick={mode === 'login' ? handleLogin : handleRegister}
              disabled={loading}
              className="w-full group flex items-center gap-4 p-5 bg-white border-2 border-gray-100 hover:border-[var(--primary-color)] rounded-3xl transition-all hover:shadow-xl hover:shadow-cyan-100/50 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-100 disabled:hover:shadow-none"
            >
              <div className="w-14 h-14 bg-cyan-50 text-[var(--primary-color)] rounded-2xl flex items-center justify-center group-hover:bg-[var(--primary-color)] group-hover:text-white transition-colors flex-shrink-0">
                {loading ? <Loader2 size={28} className="animate-spin" /> : mode === 'login' ? <Building2 size={28} /> : <UserPlus size={28} />}
              </div>
              <div className="text-left">
                <p className="font-black text-gray-800 text-lg leading-tight">
                  {loading
                    ? (mode === 'login' ? 'Entrando...' : 'Enviando solicitação...')
                    : mode === 'login' ? 'Acessar Sistema' : 'Solicitar Acesso'
                  }
                </p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  {mode === 'login' ? 'Gestão de Clínica' : 'Aguarda aprovação do Admin'}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Link de alternância */}
        <div className="mt-6 text-center">
          {mode === 'login' ? (
            <p className="text-sm text-gray-500">
              Não tem uma conta?{' '}
              <button onClick={() => switchMode('register')} className="text-[var(--primary-color)] font-bold hover:underline transition-all">
                Solicitar Acesso
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Já tem uma conta?{' '}
              <button onClick={() => switchMode('login')} className="text-[var(--primary-color)] font-bold hover:underline transition-all">
                Fazer Login
              </button>
            </p>
          )}
        </div>

        {/* Botão de Agendamento Público para Clientes */}
        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-center animate-in fade-in duration-500 delay-150">
          <p className="text-xs text-gray-500 mb-3 font-medium">É paciente e deseja avaliar um horário?</p>
          <button 
            type="button"
            onClick={() => window.location.hash = '#agendamento'}
            className="w-full max-w-[280px] flex items-center justify-center gap-2 py-3 px-6 bg-cyan-50 text-[var(--primary-color)] font-bold rounded-2xl border border-cyan-100 hover:bg-cyan-100 hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            <Calendar size={18} />
            Agendar Consulta Online
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.3em]">
            AESTHETICSYSTEM © 2026
          </p>
        </div>
      </div>
    </div>
  );
};
