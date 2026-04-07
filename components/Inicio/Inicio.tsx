import React, { useState, useMemo, useCallback } from 'react';
import { User, AppointmentStatus } from '../../types';
import {
  Calendar, Clock, CheckCircle, XCircle, MessageCircle,
  AlertCircle, ChevronRight, Cake, ChevronLeft, Loader2, UserPlus
} from 'lucide-react';
import { useAppointments } from '../../src/hooks/useAppointments';
import { usePatients } from '../../src/hooks/usePatients';
import { supabase } from '../../src/lib/supabase';
import { useClinic } from '../../src/context/ClinicContext';

interface InicioProps {
  user: User;
  onNavigateToPatient?: (id: string) => void;
}

// Helpers de data sem dependência de timezone
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const shiftDate = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toLocalDateStr(dt);
};

const formatDateLabel = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
};

export const Inicio: React.FC<InicioProps> = ({ user, onNavigateToPatient }) => {
  const { appointments, setAppointments } = useAppointments() as any;
  const { patients } = usePatients();

  const todayStr = toLocalDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [filterStatus, setFilterStatus] = useState<'TODOS' | AppointmentStatus>('TODOS');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  const { clinicSettings } = useClinic();

  const handleSendReminderWhatsApp = useCallback((app: any) => {
    let phone = '';
    let name = '';

    if (app.patientId) {
      const patient = (patients || []).find((p: any) => p.id === app.patientId);
      if (patient) {
        phone = patient.phone || '';
        name = patient.full_name || patient.name || '';
      }
    } else if (app.tempGuestPhone) {
      phone = app.tempGuestPhone;
      name = app.tempGuestName || '';
    }

    if (!phone) {
      alert('Paciente não possui telefone cadastrado.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const clinicName = clinicSettings?.clinic_name || 'nossa clínica';
    
    // Formata YYYY-MM-DD para DD/MM/YYYY
    const dateParts = app.date.split('-');
    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    const textMsg = `Olá ${name}, aqui é da *${clinicName}*, vim lembrar que você tem um agendamento para ${formattedDate} às ${app.time}. Tudo certo para hoje?`;

    window.open(
      `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(textMsg)}`,
      '_blank'
    );
  }, [patients, clinicSettings]);

  // ── Modal de cadastro rápido ────────────────────────────────────────────
  const { setPatients } = usePatients() as any;
  const [guestToRegister, setGuestToRegister] = useState<any | null>(null);
  const [registerForm, setRegisterForm] = useState({ name: '', phone: '', cpf: '' });
  const [registering, setRegistering] = useState(false);

  // ── Navegação de data ─────────────────────────────────────────────────────
  const navigateDay = useCallback((dir: -1 | 1) => {
    setSelectedDate(prev => shiftDate(prev, dir));
  }, []);

  // ── Atualizar status no Supabase ──────────────────────────────────────────
  const handleUpdateStatus = useCallback(async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      // Atualização local imediata (optimistic)
      if (setAppointments) {
        setAppointments((prev: any[]) =>
          prev.map(a => a.id === id ? { ...a, status: newStatus } : a)
        );
      }
    } catch (err) {
      console.error('[Inicio] Erro ao atualizar status:', err);
    } finally {
      setUpdatingId(null);
    }
  }, [setAppointments]);

  // ── Cadastrar convidado e vincular ao agendamento ────────────────────────
  const openRegisterModal = useCallback((app: any) => {
    setRegisterForm({ name: app.tempGuestName || '', phone: app.tempGuestPhone || '', cpf: '' });
    setGuestToRegister(app);
  }, []);

  const handleQuickRegister = useCallback(async () => {
    if (!guestToRegister || !registerForm.name.trim()) return;
    setRegistering(true);
    try {
      const { data: newPatient, error: pErr } = await supabase
        .from('patients')
        .insert({
          name: registerForm.name.trim(),
          phone: registerForm.phone.trim() || null,
          cpf: registerForm.cpf.trim() || null,
          status: 'Ativo',
          gender: 'Outro',
          address: '',
          insurance: '',
        })
        .select()
        .single();

      if (pErr) throw pErr;

      // Vincula o patient_id ao agendamento
      await supabase
        .from('appointments')
        .update({ patient_id: newPatient.id })
        .eq('id', guestToRegister.id);

      // Atualização local otimista
      if (setAppointments) {
        setAppointments((prev: any[]) =>
          prev.map(a => a.id === guestToRegister.id ? { ...a, patientId: newPatient.id } : a)
        );
      }
      if (setPatients) {
        setPatients((prev: any[]) => [...prev, { ...newPatient, name: newPatient.name }]);
      }

      setGuestToRegister(null);
    } catch (err) {
      console.error('[Inicio] Erro ao cadastrar convidado:', err);
    } finally {
      setRegistering(false);
    }
  }, [guestToRegister, registerForm, setAppointments, setPatients]);

  // ── Agendamentos ─────────────────────────────────────────────────────────
  const dayAppointments = useMemo(() =>
    (appointments || []).filter((a: any) => a.date === selectedDate)
      .sort((a: any, b: any) => a.time.localeCompare(b.time)),
    [appointments, selectedDate]
  );

  const filteredAppointments = useMemo(() => {
    if (filterStatus === 'TODOS') return dayAppointments;
    if (filterStatus === AppointmentStatus.CONFIRMADO)
      return dayAppointments.filter((a: any) =>
        a.status === AppointmentStatus.CONFIRMADO || a.status === AppointmentStatus.REALIZADO
      );
    return dayAppointments.filter((a: any) => a.status === filterStatus);
  }, [dayAppointments, filterStatus]);

  const totals = useMemo(() => ({
    all: dayAppointments.length,
    pendentes: dayAppointments.filter((a: any) =>
      a.status === AppointmentStatus.PENDENTE || a.status === AppointmentStatus.AGENDADO
    ).length,
    confirmados: dayAppointments.filter((a: any) =>
      a.status === AppointmentStatus.CONFIRMADO || a.status === AppointmentStatus.REALIZADO
    ).length,
    cancelados: dayAppointments.filter((a: any) => a.status === AppointmentStatus.CANCELADO).length,
  }), [dayAppointments]);

  // ── Aniversariantes ──────────────────────────────────────────────────────
  const birthdayPatients = useMemo(() => {
    const [, month, day] = selectedDate.split('-');
    const monthDay = `${month}-${day}`;
    return (patients || []).filter((p: any) => {
      const bd: string | undefined = p.birthDate || p.birth_date;
      if (!bd) return false;
      if (bd.includes('-')) return bd.substring(5) === monthDay;
      if (bd.includes('/')) {
        const parts = bd.split('/');
        if (parts.length === 3) return `${parts[1]}-${parts[0]}` === monthDay;
      }
      return false;
    });
  }, [patients, selectedDate]);

  const getPatientName = (patientId: string) =>
    (patients || []).find((p: any) => p.id === patientId)?.name || 'Paciente';

  const openWhatsApp = (patientId: string) => {
    const patient = (patients || []).find((p: any) => p.id === patientId);
    if (!patient?.phone) return;
    const cleanPhone = patient.phone.replace(/\D/g, '');
    window.open(
      `https://wa.me/55${cleanPhone}?text=Olá%20${encodeURIComponent(patient.name)},%20feliz%20aniversário!%20🎂`,
      '_blank'
    );
  };

  const isToday = selectedDate === todayStr;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-6 max-w-7xl mx-auto pb-10 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Olá, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isToday ? 'Aqui está o resumo da sua agenda de hoje.' : `Visualizando: ${formatDateLabel(selectedDate)}`}
          </p>
        </div>

        {/* Navegação de data */}
        <div className="flex items-center gap-2">
          {/* Seta esquerda */}
          <button
            onClick={() => navigateDay(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Dia anterior"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Botão Hoje */}
          <button
            onClick={() => setSelectedDate(todayStr)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
              isToday
                ? 'bg-[var(--primary-color)] text-white shadow-sm'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Hoje
          </button>

          {/* Input date */}
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 text-gray-700 font-bold rounded-xl outline-none focus:ring-4 focus:ring-cyan-500/20 cursor-pointer text-sm"
          />

          {/* Seta direita */}
          <button
            onClick={() => navigateDay(1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Próximo dia"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-[var(--primary-color)] transition-colors">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Total do Dia</p>
            <h2 className="text-3xl font-black text-slate-800">{totals.all}</h2>
          </div>
          <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center text-[var(--primary-color)] group-hover:scale-110 transition-transform">
            <Calendar size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-amber-400 transition-colors">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Pendentes</p>
            <h2 className="text-3xl font-black text-slate-800">{totals.pendentes}</h2>
          </div>
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-emerald-400 transition-colors">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Confirmados</p>
            <h2 className="text-3xl font-black text-slate-800">{totals.confirmados}</h2>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-red-400 transition-colors">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Cancelados</p>
            <h2 className="text-3xl font-black text-slate-800">{totals.cancelados}</h2>
          </div>
          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
            <XCircle size={24} />
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex flex-col xl:flex-row gap-6">

        {/* Timeline */}
        <div className="flex-1 bg-white border border-gray-100 rounded-3xl shadow-sm p-6 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Clock size={20} className="text-[var(--primary-color)]" /> Agendamentos do Dia
            </h2>

            {/* Filtros */}
            <div className="flex bg-gray-50 p-1 rounded-xl w-full sm:w-auto overflow-x-auto scrollbar-hide">
              {(['TODOS', 'PENDENTE', 'CONFIRMADO', 'CANCELADO'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s === 'TODOS' ? 'TODOS' : AppointmentStatus[s as keyof typeof AppointmentStatus])}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    filterStatus === (s === 'TODOS' ? 'TODOS' : AppointmentStatus[s as keyof typeof AppointmentStatus])
                      ? 'bg-white text-[var(--primary-color)] shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s === 'TODOS' ? 'Todos' : s === 'PENDENTE' ? 'Pendentes' : s === 'CONFIRMADO' ? 'Confirmados' : 'Cancelados'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-[480px] pr-1">
            {filteredAppointments.length > 0 ? filteredAppointments.map((app: any) => {
              const patName = app.patientId ? getPatientName(app.patientId) : (app.tempGuestName || 'Convidado');
              const isPendente = app.status === AppointmentStatus.PENDENTE || app.status === AppointmentStatus.AGENDADO;
              const isConfirmado = app.status === AppointmentStatus.CONFIRMADO || app.status === AppointmentStatus.REALIZADO;
              const isCancelado = app.status === AppointmentStatus.CANCELADO;
              const isLoading = updatingId === app.id;

              let barColor = 'bg-slate-300';
              let badgeClass = 'bg-slate-100 text-slate-600';
              if (isPendente) { barColor = 'bg-amber-400'; badgeClass = 'bg-amber-100 text-amber-700'; }
              if (isConfirmado) { barColor = 'bg-emerald-400'; badgeClass = 'bg-emerald-100 text-emerald-700'; }
              if (isCancelado) { barColor = 'bg-red-400'; badgeClass = 'bg-red-100 text-red-700'; }

              return (
                <div key={app.id} className="group relative flex items-center gap-3 bg-gray-50/50 hover:bg-gray-50 border border-gray-100 p-4 rounded-2xl transition-all">
                  {/* Barra lateral de status */}
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-10 rounded-r-full ${barColor}`} />

                  {/* Horário */}
                  <div className="pl-2 w-16 shrink-0">
                    <p className="text-sm font-black text-slate-800">{app.time}</p>
                    <p className="text-[10px] font-bold text-slate-400">{app.duration} min</p>
                  </div>

                  {/* Dados do paciente */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`flex items-center gap-1.5 ${app.patientId ? 'cursor-pointer' : ''}`}
                      onClick={() => app.patientId && onNavigateToPatient && onNavigateToPatient(app.patientId)}
                    >
                      <p className="text-sm font-bold text-slate-800 truncate hover:underline decoration-slate-300 underline-offset-2">{patName}</p>
                      {app.patientId && <ChevronRight size={13} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                    </div>
                    <p className="text-xs font-medium text-slate-500 truncate mt-0.5">{app.serviceName || 'Serviço'}</p>
                    {/* Botão cadastrar convidado — aparece só quando sem patientId */}
                    {!app.patientId && (app.tempGuestName || app.patient) && (
                      <button
                        onClick={() => openRegisterModal(app)}
                        title="Cadastrar este paciente no sistema"
                        className="mt-1 flex items-center gap-1 text-[10px] font-black text-[var(--primary-color)] hover:underline"
                      >
                        <UserPlus size={11} /> Cadastrar paciente
                      </button>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg shrink-0 ${badgeClass}`}>
                    {app.status}
                  </span>

                  {/* Botões de ação */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isLoading ? (
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    ) : (
                      <>
                        {/* WhatsApp Lembrete — para pendentes */}
                        {isPendente && (
                          <button
                            onClick={() => handleSendReminderWhatsApp(app)}
                            title="Enviar lembrete pelo WhatsApp"
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-orange-50 text-orange-500 hover:bg-orange-100 hover:scale-110 transition-all"
                          >
                            <MessageCircle size={15} />
                          </button>
                        )}
                        {/* Confirmar — só aparece se não estiver confirmado/realizado */}
                        {!isConfirmado && !isCancelado && (
                          <button
                            onClick={() => handleUpdateStatus(app.id, 'CONFIRMADO')}
                            title="Confirmar agendamento"
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:scale-110 transition-all"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {/* Cancelar — só aparece se não estiver cancelado */}
                        {!isCancelado && (
                          <button
                            onClick={() => handleUpdateStatus(app.id, 'CANCELADO')}
                            title="Cancelar agendamento"
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:scale-110 transition-all"
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                        {/* Reativar — só aparece se estiver cancelado */}
                        {isCancelado && (
                          <button
                            onClick={() => handleUpdateStatus(app.id, 'AGENDADO')}
                            title="Reativar agendamento"
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-50 text-amber-500 hover:bg-amber-100 hover:scale-110 transition-all"
                          >
                            <Clock size={15} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                <AlertCircle size={32} className="mb-2 opacity-50" />
                <p className="text-sm font-bold">Nenhum agendamento encontrado.</p>
                <p className="text-xs font-medium">Não há registros para este filtro nesta data.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Aniversariantes ── */}
        <div className="xl:w-80 flex flex-col gap-6">
          <div
            className="rounded-3xl p-6 shadow-lg relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #2563eb 100%)' }}
          >
            {/* Ícone de fundo decorativo */}
            <div className="absolute -top-4 -right-4 opacity-10">
              <Cake size={110} color="white" />
            </div>

            <h3 className="text-base font-black flex items-center gap-2 mb-4" style={{ color: 'white' }}>
              <Cake size={20} color="white" /> Aniversariantes
            </h3>

            <div className="space-y-3 relative z-10">
              {birthdayPatients.length > 0 ? (
                birthdayPatients.map((p: any) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl flex items-center justify-between"
                    style={{ backgroundColor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}
                  >
                    <p className="text-sm font-bold truncate pr-3" style={{ color: 'white' }}>
                      🎂 {p.name || p.full_name}
                    </p>
                    {p.phone && (
                      <button
                        onClick={() => openWhatsApp(p.id)}
                        title="Enviar parabéns pelo WhatsApp"
                        className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 hover:scale-110 transition-transform shadow-sm"
                        style={{ color: '#4f46e5' }}
                      >
                        <MessageCircle size={14} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div
                  className="p-4 rounded-2xl text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'white' }}>
                    Nenhum aniversariante nesta data 🥳
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    Navegue para outra data para verificar.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ── Modal rápido de cadastro ── */}
    {guestToRegister && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setGuestToRegister(null)}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 15%, white)' }}>
              <UserPlus size={20} style={{ color: 'var(--primary-color)' }} />
            </div>
            <div>
              <h3 className="font-black text-slate-800">Cadastrar Paciente</h3>
              <p className="text-xs text-slate-400 font-medium">Vinculado ao agendamento de {guestToRegister.time}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest block mb-1">Nome Completo *</label>
              <input
                type="text"
                value={registerForm.name}
                onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nome do paciente"
                autoFocus
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest block mb-1">Telefone</label>
              <input
                type="text"
                value={registerForm.phone}
                onChange={e => setRegisterForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(00) 00000-0000"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest block mb-1">CPF</label>
              <input
                type="text"
                value={registerForm.cpf}
                onChange={e => setRegisterForm(f => ({ ...f, cpf: e.target.value }))}
                placeholder="000.000.000-00"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setGuestToRegister(null)}
              className="flex-1 py-3 rounded-2xl border border-gray-200 text-slate-500 font-bold text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleQuickRegister}
              disabled={registering || !registerForm.name.trim()}
              className="flex-1 py-3 rounded-2xl font-black text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              {registering ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {registering ? 'Cadastrando...' : 'Cadastrar Paciente'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
