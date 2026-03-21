import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Menu,
  X,
  LogOut,
  Bell,
  Search,
  User as UserIcon,
  AlertCircle,
  Check,
  Building2,
  Stethoscope,
  Users,
  CheckCircle,
  XCircle,
  Trash2,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { MENU_ITEMS } from '../constants';
import { User, UserRole, Patient } from '../types';
import { supabase } from '../src/lib/supabase';
import { useClinic } from '../src/context/ClinicContext';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  appointments?: any[];
  patients?: Patient[];
  onSelectPatient?: (id: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, activeTab, onTabChange, onLogout, appointments = [], patients = [], onSelectPatient }) => {
  const { clinicSettings, userRole, hasPermission } = useClinic();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // --- Real-time Notifications State ---
  const [dbNotifications, setDbNotifications] = useState<any[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  // Filtra itens de menu de acordo com as permissões do cargo atual
  const visibleMenuItems = useMemo(() => {
    return MENU_ITEMS.filter(item => hasPermission(item.path));
  }, [hasPermission]);

  const searchResults = useMemo(() => {
    if (!searchQuery) return { patients: [], protocols: [] };
    const lowerQuery = searchQuery.toLowerCase();
    return {
      patients: patients.filter(p =>
        p.name.toLowerCase().includes(lowerQuery) ||
        (p.cpf && p.cpf.toLowerCase().includes(lowerQuery)) ||
        (p.notes && p.notes.toLowerCase().includes(lowerQuery))
      ),
      protocols: [],
    };
  }, [searchQuery, patients]);

  // --- Supabase Notifications Fetch & Realtime ---
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          setDbNotifications(data);
          const unreadCount = data.filter(n => !n.isRead && !n.is_read).length;
          setHasUnread(unreadCount > 0);
        }
      } catch (err) {
        console.error("Erro ao buscar notificações", err);
      }
    };

    fetchNotifications();

    const channelName = 'notifications_layout_' + Math.random().toString(36).substring(7);
    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
        console.log('[Supabase Realtime] Notificação Nova!', payload);
        const newNotif = payload.new;
        setDbNotifications(prev => {
            // Previne duplicação na renderização do array
            if (prev.some(n => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev].slice(0, 50);
        });
        setHasUnread(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const markAsRead = async () => {
    setHasUnread(false);
  };

  const clearAllNotifications = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDbNotifications([]);
    setHasUnread(false);
    try {
      await supabase.from('notifications').delete().neq('id', 'uuid-invalido-apagar-todos');
    } catch (err) {
      console.error('Erro ao limpar notificações:', err);
    }
  };

  // ── Aprovação direto pelo sininho ─────────────────────────────────────────
  const [approvingNotifId, setApprovingNotifId] = useState<string | null>(null);

  const handleApproveFromNotif = async (notif: any) => {
    setApprovingNotifId(notif.id);
    try {
      if (notif.pending_user_id) {
        await supabase
          .from('profiles')
          .update({ pending: false, role: notif.pending_user_role || 'receptionist' })
          .eq('id', notif.pending_user_id);

        await supabase.from('notifications').insert({
          title: `✅ Acesso Aprovado: ${notif.pending_user_name || 'Usuário'}`,
          message: `${notif.pending_user_name || 'Usuário'} foi aprovado e já pode acessar o sistema.`,
          is_read: false,
        });
      }
      // Remove a notificação de solicitação da lista local
      setDbNotifications(prev => prev.filter(n => n.id !== notif.id));
      await supabase.from('notifications').delete().eq('id', notif.id);
    } catch (err) {
      console.error('Erro ao aprovar via notificação:', err);
    } finally {
      setApprovingNotifId(null);
    }
  };

  const handleRejectFromNotif = async (notif: any) => {
    setApprovingNotifId(notif.id);
    try {
      if (notif.pending_user_id) {
        await supabase
          .from('profiles')
          .update({ pending: false, role: 'rejected' })
          .eq('id', notif.pending_user_id);
      }
      setDbNotifications(prev => prev.filter(n => n.id !== notif.id));
      await supabase.from('notifications').delete().eq('id', notif.id);
    } catch (err) {
      console.error('Erro ao recusar via notificação:', err);
    } finally {
      setApprovingNotifId(null);
    }
  };

  const getRoleLabel = () => {
    switch (userRole) {
      case UserRole.ADMIN: return 'Gestor Admin';
      case UserRole.RECEPTIONIST: return 'Recepcionista';
      case UserRole.PROFESSIONAL: return 'Profissional';
      default: return 'Colaborador';
    }
  };

  const getRoleIcon = () => {
    switch (userRole) {
      case UserRole.ADMIN: return <ShieldCheck size={12} className="text-[var(--primary-color)]" />;
      case UserRole.RECEPTIONIST: return <Users size={12} className="text-[var(--primary-color)]" />;
      case UserRole.PROFESSIONAL: return <Stethoscope size={12} className="text-[var(--primary-color)]" />;
      default: return <Building2 size={12} className="text-[var(--primary-color)]" />;
    }
  };

  const getRoleBadgeClass = () => {
    return 'text-[var(--primary-color)]';
  };

  // Usa logo e nome da clínica do banco (ou defaults)
  const clinicLogoSrc = clinicSettings.logo_url || 'https://placehold.co/400x400/00a5b5/ffffff.png?text=Logo';
  const clinicName = clinicSettings.clinic_name || 'GestãoEstética';

  return (
    <div className="min-h-screen flex bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transition-transform duration-300 transform 
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center gap-3">
            <div className="bg-[var(--primary-color)] w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shadow-sm shrink-0">
              <img src={clinicLogoSrc} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div className="text-left min-w-0">
              <h1 className="font-black text-sm text-gray-800 leading-tight truncate">{clinicName}</h1>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Digital Health</p>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto scrollbar-hide">
            {visibleMenuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  onTabChange(item.path);
                  setIsSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 group
                  ${activeTab === item.path
                    ? 'text-[var(--primary-color)] font-black bg-transparent border-l-4 border-[var(--primary-color)]'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-[var(--primary-color)] border-l-4 border-transparent'}
                `}
              >
                <span className={activeTab === item.path ? 'text-[var(--primary-color)]' : 'text-gray-400 group-hover:text-[var(--primary-color)]'}>
                  {item.icon}
                </span>
                <span className="text-left text-sm">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-xl object-cover border border-white shadow-sm" />
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border border-white shadow-sm" style={{ color: 'var(--primary-color)', backgroundColor: 'color-mix(in srgb, var(--primary-color) 20%, white)' }}>
                  {user.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[11px] font-black text-gray-800 truncate leading-tight">{user.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {getRoleIcon()}
                  <p className={`text-[9px] uppercase font-black tracking-tighter ${getRoleBadgeClass()}`}>
                    {getRoleLabel()}
                  </p>
                </div>
              </div>
              <button onClick={onLogout} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 bg-white border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-gray-500">
              <Menu size={24} />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Busca inteligente (pacientes, protocolos...)"
                className="pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-[20px] text-sm font-medium focus:ring-4 focus:ring-cyan-500/10 focus:bg-white focus:border-cyan-200 w-64 md:w-96 transition-all outline-none text-slate-700"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setIsSearchOpen(true); }}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => setTimeout(() => setIsSearchOpen(false), 200)}
              />

              {isSearchOpen && searchQuery && (
                <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="max-h-[400px] overflow-y-auto p-2 scrollbar-hide">
                    {searchResults.patients.length > 0 && (
                      <div className="mb-2">
                        <p className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pacientes & Agenda</p>
                        {searchResults.patients.map(p => (
                          <button key={p.id} onClick={() => {
                            if (onSelectPatient) {
                              onSelectPatient(p.id);
                              setIsSearchOpen(false);
                              setSearchQuery('');
                            } else {
                              onTabChange('pacientes');
                            }
                          }} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 flex items-center gap-3 transition-colors group">
                            <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:bg-cyan-100 transition-colors shrink-0">
                              <UserIcon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-700 truncate">{p.name}</p>
                              <p className="text-[10px] font-medium text-slate-400 truncate">{p.status}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {searchResults.patients.length === 0 && (
                      <div className="p-6 text-center">
                        <Search className="mx-auto text-gray-200 mb-2" size={24} />
                        <p className="text-sm font-bold text-slate-700">Nenhum resultado</p>
                        <p className="text-xs font-medium text-slate-400 mt-1">Tente buscar por outro termo.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <div onClick={() => { setIsNotifOpen(!isNotifOpen); markAsRead(); }} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-all cursor-pointer relative">
                <Bell size={20} />
                {hasUnread && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>}
              </div>

              {isNotifOpen && (
                <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-black text-slate-800">Notificações</h3>
                    {dbNotifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        className="text-xs font-bold flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={12} /> Limpar Tudo
                      </button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto p-2 scrollbar-hide">
                    {dbNotifications.length > 0 ? (
                      dbNotifications.map(n => {
                        const isSolicitacao = n.title?.includes('Solicitação de Acesso');
                        const isAproved = n.title?.includes('Aprovado') || n.title?.includes('aprovado');
                        const isCancel = n.title?.toLowerCase().includes('cancela');
                        const isConfirm = n.title?.toLowerCase().includes('confirmado');
                        const isApproving = approvingNotifId === n.id;

                        let colorClass = 'text-orange-500';
                        let bgClass = 'bg-orange-50/50';

                        if (isSolicitacao) { colorClass = 'text-amber-500'; bgClass = 'bg-amber-50 border border-amber-100'; }
                        else if (isAproved) { colorClass = 'text-emerald-500'; bgClass = 'bg-emerald-50/50'; }
                        else if (isCancel) { colorClass = 'text-red-500'; bgClass = 'bg-red-50/50'; }
                        else if (isConfirm) { colorClass = 'text-green-500'; bgClass = 'bg-green-50/50'; }

                        return (
                          <div key={n.id} className={`p-3.5 rounded-xl mb-1.5 ${bgClass} transition-colors`}>
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 shrink-0">
                                {isSolicitacao ? <AlertCircle size={15} className={colorClass} /> :
                                  isAproved ? <CheckCircle size={15} className={colorClass} /> :
                                  isCancel ? <XCircle size={15} className={colorClass} /> :
                                  isConfirm ? <CheckCircle size={15} className="text-green-500" /> :
                                  <AlertCircle size={15} className={colorClass} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 mb-0.5 leading-tight">{n.title}</p>
                                <p className="text-[11px] font-medium text-slate-500 leading-relaxed">{n.message}</p>

                                {/* Botões de aprovação inline nas notificações de solicitação */}
                                {isSolicitacao && n.pending_user_id && userRole === UserRole.ADMIN && (
                                  <div className="flex gap-2 mt-2.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRejectFromNotif(n); }}
                                      disabled={isApproving}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50"
                                    >
                                      {isApproving ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Recusar
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleApproveFromNotif(n); }}
                                      disabled={isApproving}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm disabled:opacity-50"
                                    >
                                      {isApproving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3} />} Aceitar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-6 text-center text-slate-500">
                        <p className="text-sm font-medium">Nenhuma notificação</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="w-px h-6 bg-gray-200 mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <p className={`text-[10px] font-black uppercase tracking-widest ${getRoleBadgeClass()}`}>{getRoleLabel()}</p>
                <p className="text-sm font-black text-gray-800 tracking-tight">{user.name.split(' ')[0]}</p>
              </div>
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-full object-cover border 
border-gray-200 shadow-sm" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-600 font-bold text-sm border border-cyan-100 shadow-sm">
                  {user.name.charAt(0)}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50">
          {children}
        </main>
      </div>

      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
    </div>
  );
};
