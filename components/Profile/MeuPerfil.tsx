
import React, { useState, useRef, useEffect } from 'react';
import {
  User as UserIcon, Camera, Save, Loader2, Check, AlertCircle,
  CheckCircle2, Mail, ShieldCheck, Stethoscope, Users, Upload, X
} from 'lucide-react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../../src/lib/cropImage';
import { User, UserRole } from '../../types';
import { supabase } from '../../src/lib/supabase';

// ─── Toast inline ─────────────────────────────────────────────────────────
interface ToastMsg { message: string; type: 'success' | 'error' | 'warning'; }
const InlineToast: React.FC<ToastMsg> = ({ message, type }) => {
  const variants = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <div className={`flex items-center gap-2 px-5 py-3.5 rounded-2xl border text-sm font-medium animate-in slide-in-from-top-2 duration-300 ${variants[type]}`}>
      {type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {message}
    </div>
  );
};

// ─── Tipagem ─────────────────────────────────────────────────────────────
interface MeuPerfilProps {
  user: User;
  onUserUpdated: (updatedUser: User) => void;
}

// ─── Componente Principal ─────────────────────────────────────────────────
export const MeuPerfil: React.FC<MeuPerfilProps> = ({ user, onUserUpdated }) => {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user.name || '');
  const [avatarPreview, setAvatarPreview] = useState(user.avatar || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [saved, setSaved] = useState(false);

  // Estados para Crop Modal
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // Recarrega dados ao montar (sincroniza com banco)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata;
        if (meta?.name) setDisplayName(meta.name);
        if (meta?.avatar_url) setAvatarPreview(meta.avatar_url);
      }
    });
  }, []);

  const showToast = (msg: string, type: ToastMsg['type']) => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const getRoleInfo = () => {
    switch (user.role) {
      case UserRole.ADMIN:
        return { label: 'Gestor Admin', icon: <ShieldCheck size={14} className="text-[var(--primary-color)]" />, color: 'text-[var(--primary-color)] border-transparent', style: { backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' } };
      case UserRole.RECEPTIONIST:
        return { label: 'Recepcionista', icon: <Users size={14} className="text-[var(--primary-color)]" />, color: 'text-[var(--primary-color)] border-transparent', style: { backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' } };
      case UserRole.PROFESSIONAL:
        return { label: 'Profissional', icon: <Stethoscope size={14} className="text-[var(--primary-color)]" />, color: 'text-[var(--primary-color)] border-transparent', style: { backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' } };
      default:
        return { label: 'Colaborador', icon: <UserIcon size={14} className="text-slate-400" />, color: 'text-slate-500 bg-slate-50 border-slate-100', style: {} };
    }
  };

  // ── Upload de Avatar ──────────────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Arquivo muito grande. Máximo: 5MB.', 'error'); return; }

    const localUrl = URL.createObjectURL(file);
    setImageToCrop(localUrl);
    setCropModalOpen(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleCropConfirm = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    
    setUploadingAvatar(true);
    setCropModalOpen(false);

    try {
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      if (!croppedBlob) throw new Error('Falha ao gerar imagem cortada.');

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('Usuário não autenticado');

      const ext = 'jpg';
      const filePath = `avatars/${userId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(filePath, croppedBlob, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('user-avatars').getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // 1. Atualizar session auth metadata imediatamente
      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });

      // 2. Opcional: Atualizar a tabela profiles se existir
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);

      setAvatarPreview(publicUrl);
      
      // 3. Força atualização do usuário globalmente e localmente
      const updatedUser: User = { ...user, avatar: publicUrl };
      onUserUpdated(updatedUser);
      localStorage.setItem('fisiopro_user', JSON.stringify(updatedUser));
      
      showToast('Foto salva e atualizada com sucesso!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao enviar foto cortada. Tente novamente.', 'error');
    } finally {
      setUploadingAvatar(false);
      setImageToCrop(null);
    }
  };

  // ── Salvar Perfil ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!displayName.trim()) { showToast('O nome não pode ficar em branco.', 'error'); return; }
    setSaving(true);
    try {
      // 1. Atualiza user_metadata no Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          name: displayName.trim(),
          avatar_url: avatarPreview,
        },
      });
      if (authError) throw authError;

      // 2. Atualiza tabela profiles
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (userId) {
        await supabase.from('profiles').update({
          full_name: displayName.trim(),
          avatar_url: avatarPreview,
        }).eq('id', userId);
      }

      // 3. Propaga para o componente pai (atualiza sidebar/header instantaneamente)
      const updatedUser: User = {
        ...user,
        name: displayName.trim(),
        avatar: avatarPreview,
      };
      onUserUpdated(updatedUser);
      localStorage.setItem('fisiopro_user', JSON.stringify(updatedUser));

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      showToast('Perfil atualizado com sucesso!', 'success');
    } catch (err: any) {
      showToast('Erro ao salvar. Tente novamente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const roleInfo = getRoleInfo();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Meu Perfil</h2>
        <p className="text-slate-500 text-sm font-medium mt-1">Gerencie suas informações pessoais e foto de perfil</p>
      </div>

      {/* Toast */}
      {toast && <InlineToast {...toast} />}

      {/* Avatar + Nome */}
      <div className="bg-white rounded-[48px] border border-slate-100 shadow-sm p-10">

        {/* Seção Avatar */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative group">
            {/* Foto */}
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-xl ring-2 ring-slate-100">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00a5b5&color=fff&size=200`;
                  }}
                />
              ) : (
                <div className="w-full h-full bg-[var(--primary-color)]/10 flex items-center justify-center">
                  <UserIcon size={48} className="text-[var(--primary-color)]/40" />
                </div>
              )}

              {/* Overlay de upload */}
              {!uploadingAvatar && (
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-full cursor-pointer transition-all duration-200"
                >
                  <Camera size={28} className="text-white" />
                </div>
              )}

              {/* Loading */}
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                  <Loader2 size={28} className="text-white animate-spin" />
                </div>
              )}
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* Botão de upload */}
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-600 font-bold text-sm rounded-2xl transition-all disabled:opacity-50"
          >
            {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploadingAvatar ? 'Enviando...' : 'Trocar foto'}
          </button>
          <p className="text-[11px] text-slate-400 font-medium mt-1.5">PNG, JPG, WebP, GIF • Máx 5MB</p>
        </div>

        {/* Campos */}
        <div className="space-y-5">
          {/* Nome */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Nome Completo</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold text-sm focus:ring-2 focus:ring-cyan-500/20 focus:border-[var(--primary-color)] outline-none transition-all"
              />
            </div>
          </div>

          {/* E-mail (readonly) */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-600 uppercase tracking-widest">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type="email"
                value={user.email}
                readOnly
                className="w-full pl-12 pr-4 py-4 bg-slate-25 border border-slate-100 rounded-2xl text-slate-400 font-bold text-sm outline-none cursor-not-allowed select-none bg-gray-50"
              />
            </div>
            <p className="text-[11px] text-slate-400 font-medium ml-1">O e-mail não pode ser alterado aqui.</p>
          </div>

          {/* Cargo */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-600 uppercase tracking-widest">Cargo</label>
            <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border ${roleInfo.color}`} style={roleInfo.style}>
              {roleInfo.icon}
              <span className="font-black text-sm">{roleInfo.label}</span>
            </div>
          </div>
        </div>

        {/* Botão Salvar */}
        <div className="mt-8">
          <button
            onClick={handleSave}
            disabled={saving || uploadingAvatar}
            className="flex items-center gap-2 px-8 py-4 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white font-black rounded-2xl transition-all shadow-lg shadow-cyan-100 disabled:opacity-60 text-sm"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Salvando...</>
            ) : saved ? (
              <><Check size={16} strokeWidth={3} /> Salvo!</>
            ) : (
              <><Save size={16} /> Salvar Alterações</>
            )}
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-slate-50 rounded-[32px] border border-slate-100 p-6 flex items-start gap-4">
        <ShieldCheck size={20} className="text-slate-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-slate-700 text-sm">Sua conta está protegida</p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Dados sincronizados com o Supabase Auth. Para alterar sua senha, entre em contato com o administrador.
          </p>
        </div>
      </div>

      {/* ── Modal de Crop ── */}
      {cropModalOpen && imageToCrop && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl flex flex-col scale-in-center border border-white/20">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Ajustar Foto</h3>
                <p className="text-[11px] text-slate-500 font-medium mt-1">Arraste para reposicionar e use a barra para dar zoom.</p>
              </div>
              <button 
                onClick={() => { setCropModalOpen(false); setImageToCrop(null); }}
                className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-full text-slate-400 transition-colors"
              >
                <X size={20} strokeWidth={3} />
              </button>
            </div>
            
            <div className="relative w-full h-[320px] bg-slate-900 border-y border-black/10">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
              />
            </div>

            <div className="p-6 bg-white space-y-8">
              <div className="flex items-center gap-5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zoom</span>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--primary-color)' }}
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => { setCropModalOpen(false); setImageToCrop(null); }}
                  disabled={uploadingAvatar}
                  className="flex-1 py-4 rounded-2xl font-bold text-sm text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCropConfirm}
                  disabled={uploadingAvatar}
                  className="flex-1 py-4 rounded-2xl font-black text-sm text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--primary-color)', boxShadow: '0 8px 24px -6px var(--primary-color)' }}
                >
                  {uploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                  Salvar Foto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
