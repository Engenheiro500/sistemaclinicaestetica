
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  Users, ShieldCheck, Clock, Trash2, Search, Check, X,
  Building2, AlertCircle, Save, Loader2, ToggleLeft, ToggleRight,
  Stethoscope, Palette, Lock, Upload, ImageIcon, CheckCircle,
  XCircle, Bell,
} from 'lucide-react';
import { User as UserType, UserRole, RolePermissions } from '../../types';
import { useAppointments } from '../../src/hooks/useAppointments';
import { supabase } from '../../src/lib/supabase';
import { ConfigHorarios } from '../../src/components/Admin/ConfigHorarios';
import { useClinic } from '../../src/context/ClinicContext';

// ─── Toggle Switch ─────────────────────────────────────────────────────────
const Toggle: React.FC<{
  enabled: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; label: string; description?: string;
}> = ({ enabled, onChange, disabled, label, description }) => (
  <div className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
    disabled ? 'bg-gray-50/50 border-gray-100 opacity-60'
    : enabled ? 'bg-cyan-50/50 border-cyan-100' : 'bg-white border-gray-100 hover:border-gray-200'
  }`}>
    <div>
      <p className="text-sm font-bold text-slate-700">{label}</p>
      {description && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{description}</p>}
    </div>
    <button onClick={() => !disabled && onChange(!enabled)} disabled={disabled} className="transition-transform active:scale-95">
      {enabled
        ? <ToggleRight size={36} className={disabled ? 'text-gray-300' : 'text-[var(--primary-color)]'} />
        : <ToggleLeft size={36} className="text-gray-300" />}
    </button>
  </div>
);

// ─── Permission Panel ──────────────────────────────────────────────────────
const PAGE_META: { key: keyof RolePermissions; label: string; desc: string }[] = [
  { key: 'home', label: 'Visão Geral (Dashboard)', desc: 'Página inicial com KPIs e gráficos' },
  { key: 'crm', label: 'CRM / Funil de Vendas', desc: 'Kanban de leads e oportunidades' },
  { key: 'agenda', label: 'Agenda', desc: 'Visualizar e gerenciar agendamentos' },
  { key: 'pacientes', label: 'Clientes', desc: 'Cadastro e histórico de clientes' },
  { key: 'servicos', label: 'Serviços', desc: 'Catálogo de serviços da clínica' },
  { key: 'relatorios', label: 'Relatórios', desc: 'Análises e relatórios gerenciais' },
  { key: 'financeiro', label: 'Financeiro', desc: 'Fluxo de caixa e transações' },
];

const PermissionPanel: React.FC<{
  title: string; icon: React.ReactNode; accentColor: string;
  permissions: RolePermissions; onChange: (k: keyof RolePermissions, v: boolean) => void; saving: boolean;
}> = ({ title, icon, accentColor, permissions, onChange, saving }) => (
  <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8">
    <div className="flex items-center gap-3 mb-6">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${accentColor}`}>{icon}</div>
      <div className="flex-1">
        <h3 className="font-black text-slate-800 text-base">{title}</h3>
        <p className="text-[11px] text-slate-400 font-medium">Defina quais páginas este cargo pode acessar</p>
      </div>
      {saving && <Loader2 size={16} className="text-slate-400 animate-spin" />}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {PAGE_META.map(({ key, label, desc }) => (
        <Toggle key={key} enabled={permissions[key]} onChange={(v) => onChange(key, v)} label={label} description={desc} />
      ))}
    </div>
    <div className="mt-4 p-4 bg-slate-50 rounded-2xl flex items-start gap-3">
      <Lock size={14} className="text-slate-400 mt-0.5 shrink-0" />
      <p className="text-[11px] text-slate-400 font-medium">
        A página <strong>Admin</strong> é sempre bloqueada para este cargo. Acesso irrestrito apenas para <strong>Gestor Admin</strong>.
      </p>
    </div>
  </div>
);

// ─── Pending User Card ─────────────────────────────────────────────────────
interface PendingUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

// ─── Main Admin ────────────────────────────────────────────────────────────
interface AdminProps { user?: UserType; }

export const Admin: React.FC<AdminProps> = ({ user }) => {
  const { clinicSettings, saveClinicSettings, savingSettings } = useClinic();
  const { appointments } = useAppointments();
  const confirmedCount = appointments.filter(a => a.status === 'CONFIRMADO').length;

  const [dbUsers, setDbUsers] = useState<UserType[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'main' | 'horarios'>('main');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Identity state
  const [clinicName, setClinicName] = useState(clinicSettings.clinic_name);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(clinicSettings.logo_url || '');
  const [primaryColor, setPrimaryColor] = useState(clinicSettings.primary_color || 'var(--primary-color)');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);

  // Permissions state
  const [receptionistPerms, setReceptionistPerms] = useState(clinicSettings.permissions.receptionist);
  const [professionalPerms, setProfessionalPerms] = useState(clinicSettings.permissions.professional);
  const [savingPerms, setSavingPerms] = useState(false);

  // Approval state
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Sync settings on load
  useEffect(() => {
    setClinicName(clinicSettings.clinic_name);
    setLogoPreviewUrl(clinicSettings.logo_url || '');
    setPrimaryColor(clinicSettings.primary_color || 'var(--primary-color)');
    setReceptionistPerms(clinicSettings.permissions.receptionist);
    setProfessionalPerms(clinicSettings.permissions.professional);
  }, [clinicSettings]);

  // Fetch team users
  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data }) => {
      if (data) {
        setDbUsers(data.map((p: any) => ({
          id: p.id, name: p.full_name || 'Usuário', email: p.email || '',
          role: p.role || 'GUEST',
          avatar: p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.full_name || 'U')}&background=random`,
        })));
      }
    });
  }, []);

  // Fetch pending users via Admin API (listUsers)
  useEffect(() => {
    const fetchPending = async () => {
      try {
        // Usa a API de admin para listar usuários — requer service_role key
        // Como não temos service_role no frontend, buscamos via function edge ou via metadata
        // Alternativa: buscamos da tabela profiles onde role = 'pending' ou pending = true
        // Por enquanto, usamos a API padrão que retorna o usuário atual
        // Em produção, isso seria feito via Edge Function com service_role key
        
        // Tentativa via tabela profiles com campo pending
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .eq('pending', true);

        if (profilesData && profilesData.length > 0) {
          setPendingUsers(profilesData.map((p: any) => ({
            id: p.id, email: p.email || '', name: p.full_name || 'Sem nome',
            role: p.role || 'receptionist', created_at: p.created_at || '',
          })));
        }
      } catch (err) {
        console.error('Erro ao buscar pendentes:', err);
      }
    };
    fetchPending();

    // Realtime: quando aparecer nova notificação de solicitação, re-busca pendentes
    const sub = supabase.channel('pending_watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        fetchPending();
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  // ── Upload de Logo ─────────────────────────────────────────────────────
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('Arquivo muito grande. Máximo permitido: 5MB.');
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${ext}`;
      const filePath = `clinic-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('clinic-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Erro no upload:', uploadError);
        alert('Erro ao enviar imagem. Verifique as configurações do Storage.');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('clinic-assets')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      setLogoPreviewUrl(publicUrl);

      // Salva automaticamente no banco
      await saveClinicSettings({ logo_url: publicUrl });
    } catch (err) {
      console.error('Erro inesperado no upload:', err);
    } finally {
      setUploadingLogo(false);
    }
  };

  // ── Salvar Identidade ─────────────────────────────────────────────────
  const handleSaveIdentity = async () => {
    setSavingIdentity(true);
    try {
      const ok = await saveClinicSettings({ clinic_name: clinicName, logo_url: logoPreviewUrl || undefined, primary_color: primaryColor });
      if (ok) {
        setIdentitySaved(true);
        setTimeout(() => setIdentitySaved(false), 2500);
        toast.success('Configurações salvas com sucesso!');
      } else {
        toast.error('Erro ao salvar as configurações no banco.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha na comunicação com o banco de dados.');
    } finally {
      setSavingIdentity(false);
    }
  };

  // ── Alterar Permissão ─────────────────────────────────────────────────
  const handlePermissionChange = async (role: 'receptionist' | 'professional', key: keyof RolePermissions, value: boolean) => {
    const updatedPerms = {
      ...clinicSettings.permissions,
      [role]: { ...clinicSettings.permissions[role], [key]: value },
    };
    if (role === 'receptionist') setReceptionistPerms(updatedPerms.receptionist);
    else setProfessionalPerms(updatedPerms.professional);
    setSavingPerms(true);
    await saveClinicSettings({ permissions: updatedPerms });
    setSavingPerms(false);
  };

  // ── Aprovar / Recusar Solicitação ─────────────────────────────────────
  const handleApprove = async (pendingUser: PendingUser) => {
    setApprovingId(pendingUser.id);
    try {
      // Atualiza o perfil na tabela profiles
      await supabase
        .from('profiles')
        .update({ pending: false, role: pendingUser.role })
        .eq('id', pendingUser.id);

      // Notificação de aprovação
      await supabase.from('notifications').insert({
        title: `✅ Acesso Aprovado: ${pendingUser.name}`,
        message: `${pendingUser.name} foi aprovado como ${pendingUser.role === 'receptionist' ? 'Recepcionista' : 'Profissional'} e já pode acessar o sistema.`,
        is_read: false,
      });

      setPendingUsers(prev => prev.filter(u => u.id !== pendingUser.id));
    } catch (err) {
      console.error('Erro ao aprovar:', err);
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (pendingUser: PendingUser) => {
    setApprovingId(pendingUser.id);
    try {
      // Remove ou marca como rejeitado
      await supabase.from('profiles').update({ pending: false, role: 'rejected' }).eq('id', pendingUser.id);
      setPendingUsers(prev => prev.filter(u => u.id !== pendingUser.id));
    } catch (err) {
      console.error('Erro ao recusar:', err);
    } finally {
      setApprovingId(null);
    }
  };

  // ── Excluir Membro da Equipe (Optimistic UI) ───────────────────────────
  const handleDeleteMember = async (userId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este membro do sistema? Esta ação é irreversível.')) return;

    const previousUsers = [...dbUsers];
    // Atualização otimista: remove instantaneamente da UI (e dos contadores no topo)
    setDbUsers(prev => prev.filter(u => u.id !== userId));

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      toast.success('Membro removido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir membro:', err);
      // Reverte a UI caso a deleção no banco falhe
      setDbUsers(previousUsers);
      toast.error('Erro ao comunicar com o banco de dados. O membro retornou à lista.');
    }
  };

  if (view === 'horarios') return <ConfigHorarios onBack={() => setView('main')} />;

  const roleLabel = (role: string) =>
    role === 'admin' || role === UserRole.ADMIN ? 'Gestor Admin'
    : role === 'receptionist' || role === UserRole.RECEPTIONIST ? 'Recepcionista'
    : role === 'professional' || role === UserRole.PROFESSIONAL ? 'Profissional'
    : 'Colaborador';

  const roleClass = (role: string) =>
    role === 'admin' || role === UserRole.ADMIN ? 'bg-cyan-50 text-cyan-600 border-cyan-100'
    : role === 'receptionist' || role === UserRole.RECEPTIONIST ? 'bg-violet-50 text-violet-600 border-violet-100'
    : role === 'professional' || role === UserRole.PROFESSIONAL ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
    : 'bg-slate-50 text-slate-500 border-slate-100';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 relative text-left space-y-10">
      <div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Painel de Gestão</h2>
        <p className="text-slate-500 text-sm font-medium">Controle central de equipe, segurança e configurações da clínica</p>
      </div>

      {/* ── Solicitações de Acesso Pendentes ── */}
      {pendingUsers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[40px] p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Bell size={20} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg">Solicitações de Acesso</h3>
              <p className="text-[11px] text-slate-500 font-medium">{pendingUsers.length} usuário(s) aguardando aprovação</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingUsers.map(pending => (
              <div key={pending.id} className="bg-white rounded-3xl border border-amber-200 p-5 flex items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-lg shrink-0">
                    {(pending.name || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-800 text-sm truncate">{pending.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold truncate">{pending.email}</p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border tracking-widest ${roleClass(pending.role)}`}>
                      {roleLabel(pending.role)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleReject(pending)}
                    disabled={approvingId === pending.id}
                    className="w-10 h-10 rounded-2xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-all disabled:opacity-50"
                  >
                    <X size={18} />
                  </button>
                  <button
                    onClick={() => handleApprove(pending)}
                    disabled={approvingId === pending.id}
                    className="w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                  >
                    {approvingId === pending.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Estatísticas ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Membros da Equipe</p>
          <div className="flex items-end justify-between">
            <h3 className="text-4xl font-black text-slate-800">{dbUsers.length}</h3>
            <Users className="text-[var(--primary-color)] opacity-20" size={48} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Administradores</p>
          <div className="flex items-end justify-between">
            <h3 className="text-4xl font-black text-slate-800">
              {dbUsers.filter(u => u.role === 'admin' || u.role === UserRole.ADMIN).length}
            </h3>
            <ShieldCheck className="text-emerald-500 opacity-20" size={48} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pendentes</p>
          <div className="flex items-end justify-between">
            <h3 className="text-4xl font-black text-amber-500">{pendingUsers.length}</h3>
            <Clock className="text-amber-500 opacity-20" size={48} />
          </div>
        </div>
        <div
          onClick={() => setView('horarios')}
          className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm cursor-pointer hover:shadow-md hover:bg-emerald-50/20 transition-all group"
        >
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Gestão de Horários</p>
          <div className="flex items-end justify-between">
            <h3 className="text-xl font-black text-emerald-600">Configurar</h3>
            <Clock className="text-emerald-500 opacity-40 group-hover:opacity-100 transition-opacity" size={48} />
          </div>
        </div>
      </div>

      {/* ── Identidade da Clínica ── */}
      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Palette size={20} className="text-indigo-500" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-base">Identidade da Clínica</h3>
            <p className="text-[11px] text-slate-400 font-medium">Nome e logo que aparecem em todo o sistema</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Nome da Clínica</label>
              <input
                type="text"
                value={clinicName}
                onChange={e => setClinicName(e.target.value)}
                placeholder="Ex: Clínica Estética Premium"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:ring-2 focus:ring-cyan-500/20 focus:border-[var(--primary-color)] outline-none transition-all text-sm"
              />
            </div>

            {/* Cor Principal */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Cor Principal</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="w-14 h-14 p-1 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  placeholder="var(--primary-color)"
                  onBlur={e => {
                     if (!/^#[0-9A-Fa-f]{6}$/i.test(e.target.value)) setPrimaryColor('var(--primary-color)');
                  }}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:ring-2 focus:ring-cyan-500/20 focus:border-[var(--primary-color)] outline-none transition-all text-sm uppercase"
                />
              </div>
            </div>
          </div>

          {/* Upload de Logo */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Logo da Clínica</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
              onChange={handleLogoFileChange}
              className="hidden"
              id="logo-upload"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`relative w-full h-[58px] border-2 border-dashed rounded-2xl flex items-center gap-4 px-5 cursor-pointer transition-all group
                ${uploadingLogo ? 'border-cyan-300 bg-cyan-50' : logoPreviewUrl ? 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300' : 'border-slate-200 hover:border-[var(--primary-color)] hover:bg-cyan-50/30'}`}
            >
              {uploadingLogo ? (
                <>
                  <Loader2 size={20} className="text-cyan-500 animate-spin shrink-0" />
                  <span className="text-sm font-bold text-cyan-600">Enviando imagem...</span>
                </>
              ) : logoPreviewUrl ? (
                <>
                  <img src={logoPreviewUrl} alt="Logo" className="h-9 w-9 object-contain rounded-lg border border-emerald-100 bg-white" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-700 truncate">Logo carregada</p>
                    <p className="text-[10px] text-emerald-500 font-medium">Clique para trocar</p>
                  </div>
                  <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                </>
              ) : (
                <>
                  <Upload size={20} className="text-slate-400 group-hover:text-[var(--primary-color)] transition-colors shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-slate-600 group-hover:text-[var(--primary-color)] transition-colors">Clique para enviar logo</p>
                    <p className="text-[10px] text-slate-400 font-medium">PNG, JPG, WebP • Máx 5MB</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Preview do Sidebar</p>
          <div className="flex items-center gap-3">
            <div className="bg-[var(--primary-color)] w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shadow-sm shrink-0">
              {logoPreviewUrl
                ? <img src={logoPreviewUrl} alt="Logo Preview" className="w-full h-full object-cover" />
                : <ImageIcon size={20} className="text-white opacity-70" />}
            </div>
            <div>
              <p className="font-black text-sm text-gray-800 leading-tight">{clinicName || 'GestãoEstética'}</p>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Digital Health</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSaveIdentity}
            disabled={savingIdentity}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white font-black rounded-2xl transition-all shadow-lg shadow-cyan-100 disabled:opacity-60"
          >
            {savingIdentity ? <Loader2 size={16} className="animate-spin" /> : identitySaved ? <Check size={16} /> : <Save size={16} />}
            {identitySaved ? 'Salvo!' : savingIdentity ? 'Salvando...' : 'Salvar Nome da Clínica'}
          </button>
          <p className="text-[11px] text-slate-400 font-medium mt-2">A logo é salva automaticamente após o upload.</p>
        </div>
      </div>

      {/* ── Permissões por Cargo ── */}
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-black text-slate-800">Permissões por Cargo</h3>
          <p className="text-sm text-slate-500 font-medium">Configure quais páginas cada cargo pode visualizar. Salvo automaticamente.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <PermissionPanel
            title="Recepcionista"
            icon={<Users size={20} className="text-violet-600" />}
            accentColor="bg-violet-50"
            permissions={receptionistPerms}
            onChange={(k, v) => handlePermissionChange('receptionist', k, v)}
            saving={savingPerms}
          />
          <PermissionPanel
            title="Profissional / Colaborador"
            icon={<Stethoscope size={20} className="text-emerald-600" />}
            accentColor="bg-emerald-50"
            permissions={professionalPerms}
            onChange={(k, v) => handlePermissionChange('professional', k, v)}
            saving={savingPerms}
          />
        </div>
        <div className="bg-cyan-50 border border-cyan-100 rounded-3xl p-6 flex items-start gap-4">
          <ShieldCheck size={22} className="text-cyan-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-slate-800 text-sm">Gestor Admin: acesso total e irrestrito</p>
            <p className="text-[12px] text-slate-500 font-medium mt-1">O cargo Admin sempre enxerga todas as páginas, independente das configurações acima.</p>
          </div>
        </div>
      </div>

      {/* ── Equipe por Categoria ── */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-800">Gerenciar Equipe</h3>
          <div className="relative w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              type="text"
              placeholder="Buscar membro..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 shadow-sm rounded-2xl text-sm font-bold text-slate-600 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Renderiza grupos dinamicamente */}
        {[
          {
            key: 'admin', label: 'Administradores', icon: <ShieldCheck size={16} className="text-cyan-600" />,
            accent: 'bg-cyan-50 border-cyan-100', headerColor: 'text-cyan-600', emptyText: 'Nenhum administrador cadastrado',
          },
          {
            key: 'professional', label: 'Profissionais', icon: <Stethoscope size={16} className="text-emerald-600" />,
            accent: 'bg-emerald-50 border-emerald-100', headerColor: 'text-emerald-600', emptyText: 'Nenhum profissional cadastrado',
          },
          {
            key: 'receptionist', label: 'Recepcionistas', icon: <Users size={16} className="text-violet-600" />,
            accent: 'bg-violet-50 border-violet-100', headerColor: 'text-violet-600', emptyText: 'Nenhuma recepcionista cadastrada',
          },
        ].map(group => {
          const groupUsers = dbUsers.filter(u => {
            const r = u.role?.toLowerCase();
            const isGroup = group.key === 'admin'
              ? (r === 'admin' || r === UserRole.ADMIN?.toLowerCase())
              : group.key === 'professional'
                ? (r === 'professional' || r === UserRole.PROFESSIONAL?.toLowerCase())
                : (r === 'receptionist' || r === UserRole.RECEPTIONIST?.toLowerCase());
            return isGroup && u.name.toLowerCase().includes(searchTerm.toLowerCase());
          });

          return (
            <div key={group.key} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
              {/* Cabeçalho do grupo */}
              <div className={`px-8 py-5 flex items-center gap-3 ${group.accent} border-b`}>
                <div className="w-8 h-8 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
                  {group.icon}
                </div>
                <h4 className={`font-black text-sm ${group.headerColor}`}>{group.label}</h4>
                <span className={`ml-auto text-[10px] font-black px-2.5 py-1 rounded-full bg-white/70 ${group.headerColor}`}>
                  {groupUsers.length} membro{groupUsers.length !== 1 ? 's' : ''}
                </span>
              </div>

              {groupUsers.length === 0 ? (
                <div className="px-8 py-8 text-center">
                  <p className="text-sm text-slate-300 font-bold">{group.emptyText}</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-50">
                    {groupUsers.map(u => (
                      <tr key={u.id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <img src={u.avatar} className="w-10 h-10 rounded-[14px] object-cover border border-slate-100 shadow-sm" alt="" />
                            <div>
                              <p className="font-black text-slate-800 text-sm tracking-tight">{u.name}</p>
                              <p className="text-[11px] text-slate-400 font-medium">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button 
                            onClick={() => handleDeleteMember(u.id)}
                            className="p-2 text-slate-200 hover:text-rose-500 transition-all rounded-xl hover:bg-rose-50 active:scale-95"
                            title="Excluir Membro"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
