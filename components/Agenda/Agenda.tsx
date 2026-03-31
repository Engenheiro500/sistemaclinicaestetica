
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  User as UserIcon,
  Calendar as CalendarIcon,
  Stethoscope,
  ChevronDown,
  Lock,
  UserCheck,
  CalendarDays,
  Clock,
  Phone,
  Mail,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { AppointmentStatus, User, UserRole } from '../../types';
import { supabase } from '../../src/lib/supabase';
import { useAppointments } from '../../src/hooks/useAppointments';
import { useServices } from '../../src/hooks/useServices';
import { usePatients } from '../../src/hooks/usePatients';
import { useProfessionals } from '../../src/hooks/useProfessionals';
import { useScheduleSettings } from '../../src/hooks/useScheduleSettings';

interface AgendaProps {
  user: User;
  onNavigateToPatient?: (id: string) => void;
  onPatientCreated?: (patient: any) => void;
}

const TIME_OPTIONS = [];
for (let h = 7; h <= 20; h++) {
  const hour = String(h).padStart(2, '0');
  TIME_OPTIONS.push(`${hour}:00`);
  TIME_OPTIONS.push(`${hour}:30`);
}

export const Agenda: React.FC<AgendaProps> = ({ user, onNavigateToPatient, onPatientCreated }) => {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isGuestRegistrationOpen, setIsGuestRegistrationOpen] = useState(false);
  const [guestForm, setGuestForm] = useState({ name: '', phone: '', cpf: '', email: '' });
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [detailsPaymentMethod, setDetailsPaymentMethod] = useState('PIX');

  const [creatorData, setCreatorData] = useState<{ name: string, role: string } | null>(null);
  const [isLoadingCreator, setIsLoadingCreator] = useState(false);

  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [newBlock, setNewBlock] = useState({ descricao: '', data: new Date().toISOString().split('T')[0], hora_inicio: '08:00', hora_fim: '09:00' });
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Combobox e novo cadastro states
  const [patientSearch, setPatientSearch] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [isRegisteringNewPatient, setIsRegisteringNewPatient] = useState(false);
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);

  const [isSlotActionModalOpen, setIsSlotActionModalOpen] = useState(false);
  const [slotActionData, setSlotActionData] = useState<{ date: string, time: string, isBlocked: boolean, blockReason: string, manualBlockId?: string } | null>(null);

  const patientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(event.target as Node)) {
        setIsPatientDropdownOpen(false);
      }
    };
    if (isPatientDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPatientDropdownOpen]);

  const isGestor = user.role === UserRole.ADMIN;
  const canAssignProfessional = user.role === UserRole.ADMIN || user.role === UserRole.RECEPTIONIST || user.role === UserRole.PROFESSIONAL;
  const dateInputRef = useRef<HTMLInputElement>(null);

  const { appointments, setAppointments, loading } = useAppointments();
  const { services } = useServices();
  const { patients } = usePatients();
  const { professionals } = useProfessionals();
  const { settings, blocks, createBlock, deleteBlock } = useScheduleSettings();

  const handleSaveBlock = async () => {
    try {
      await createBlock({
        descricao: newBlock.descricao,
        data: newBlock.data,
        hora_inicio: newBlock.hora_inicio + ':00',
        hora_fim: newBlock.hora_fim + ':00'
      });
      setIsBlockModalOpen(false);
      setSlotActionData(null);
      alert('Bloqueio cadastrado com sucesso!');
    } catch (e: any) {
      alert('Erro ao salvar bloqueio: ' + e.message);
    }
  };

  const handleUnblock = async (blockId: string) => {
    if (confirm("Tem certeza que deseja liberar este horário?")) {
      try {
        await deleteBlock(blockId);
        setSlotActionData(null);
        alert('Horário liberado com sucesso!');
      } catch (e: any) {
        alert('Erro ao liberar horário: ' + e.message);
      }
    }
  };

  const handleSlotClick = (dateStr: string, timeStr: string, slotApps: any[], isBlocked: boolean, blockReason: string, manualBlockId?: string) => {
    if (slotApps.length > 0 && !isBlocked) return; // Se tem app, o clique já vai para abrir detalhe.

    setSlotActionData({ date: dateStr, time: timeStr, isBlocked, blockReason, manualBlockId });
    setIsSlotActionModalOpen(true);
  };

  const openNewAppointment = (date?: string, time?: string) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    setNewAppointment({
      ...newAppointment,
      patientId: '',
      serviceId: '',
      date: targetDate,
      time: time || "08:00",
      physioId: user.id
    });
    setPatientSearch('');
    setIsRegisteringNewPatient(false);
    setNewPatientPhone('');
    setIsPatientDropdownOpen(false);
    setIsNewModalOpen(true);
  };

  const [newAppointment, setNewAppointment] = useState({
    id: undefined as string | undefined, // Support edits
    patientId: '',
    serviceId: '',
    physioId: user.role.startsWith('ESTETICISTA') ? user.id : '',
    date: '',
    time: '',
    duration: 60,
    value: 0,
    paymentMethod: 'PIX',
    notes: ''
  });

  const handleEditAppointment = () => {
    setIsDetailsModalOpen(false);
    setNewAppointment({
      id: selectedAppointment.id,
      patientId: selectedAppointment.patientId || '',
      serviceId: selectedAppointment.serviceId || '',
      physioId: selectedAppointment.physioId || user.id,
      date: selectedAppointment.date,
      time: selectedAppointment.time,
      duration: selectedAppointment.duration || 60,
      value: selectedAppointment.value || 0,
      paymentMethod: selectedAppointment.paymentMethod || 'PIX',
      notes: selectedAppointment.notes || ''
    });
    setPatientSearch(patients.find(p => p.id === selectedAppointment.patientId)?.name || selectedAppointment.tempGuestName || '');
    setIsRegisteringNewPatient(false);
    setIsNewModalOpen(true);
  };

  const handleOpenDetails = (app: any) => {
    setSelectedAppointment(app);
    setDetailsPaymentMethod(app.paymentMethod || 'PIX');
    setIsDetailsModalOpen(true);
  };

  const assignableProfessionals = useMemo(() => {
    return professionals.filter(p => p.role === UserRole.ADMIN || p.role === UserRole.PROFESSIONAL);
  }, [professionals]);

  const handleAssignProfessional = async (professionalId: string) => {
    if (!selectedAppointment) return;

    let newPhysioId = professionalId || null;
    let newPhysioName = 'A Definir';

    if (professionalId) {
      const professional = professionals.find(p => p.id === professionalId);
      if (professional) newPhysioName = professional.name || professional.full_name || 'Profissional';
    }
    
    const previousAppointments = [...appointments];
    
    // Optimistic Update
    const updatedAppointment = { 
      ...selectedAppointment, 
      physioId: newPhysioId, 
      physio: newPhysioName 
    };
    setSelectedAppointment(updatedAppointment);
    
    setAppointments(prev => prev.map(app => 
      app.id === selectedAppointment.id ? updatedAppointment : app
    ));

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ professional_id: newPhysioId })
        .eq('id', selectedAppointment.id);

      if (error) throw error;
      setAssignSuccess(true);
      setTimeout(() => setAssignSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao atribuir profissional. A visualização será revertida.');
      // Rollback
      setAppointments(previousAppointments);
      setSelectedAppointment(selectedAppointment);
    }
  };

  useEffect(() => {
    const fetchCreatorDetails = async () => {
      if (!isDetailsModalOpen || !selectedAppointment) return;
      if (!selectedAppointment.created_by) {
        setCreatorData({ name: 'Administrador (Sistema)', role: 'Admin' });
        return;
      }

      setIsLoadingCreator(true);
      try {
        // Usa RPC que lê tanto profiles quanto auth.users
        const { data, error } = await supabase.rpc('get_users_display_info', {
          user_ids: [selectedAppointment.created_by]
        });

        if (data && data.length > 0 && !error) {
          setCreatorData({ name: data[0].display_name || 'Membro', role: data[0].display_role || 'Membro' });
        } else {
          // Fallback para profiles
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, role')
            .eq('id', selectedAppointment.created_by)
            .single();

          if (profile) {
            setCreatorData({ name: profile.full_name || 'Profissional', role: profile.role || 'Membro' });
          } else {
            setCreatorData({ name: 'Administrador (Sistema)', role: 'Admin' });
          }
        }
      } catch (err) {
        console.error("Erro ao buscar criador do agendamento:", err);
        setCreatorData({ name: 'Administrador (Sistema)', role: 'Admin' });
      } finally {
        setIsLoadingCreator(false);
      }
    };

    fetchCreatorDetails();
  }, [isDetailsModalOpen, selectedAppointment]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter(a => a.status !== 'CANCELADO');
  }, [appointments]);

  // Calcula quais TIME_OPTIONS estão ocupadas para a data selecionada no modal
  const occupiedSlotsForDate = useMemo(() => {
    const date = newAppointment.date;
    if (!date) return new Set<string>();

    const occupied = new Set<string>();
    const timeToMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

    const intervals: {start: number, end: number}[] = [];

    // 1. Agendamentos existentes (ignora CANCELADO e id atual)
    filteredAppointments
      .filter(a => a.date === date && a.id !== newAppointment.id)
      .forEach(a => {
        const startMin = timeToMins(a.time);
        const duration = Number(a.duration) || 60;
        intervals.push({ start: startMin, end: startMin + duration });
      });

    // 2. Bloqueios manuais
    blocks
      .filter(b => b.data === date && b.descricao !== 'LIVRE_EXCECAO')
      .forEach(b => {
        intervals.push({ start: timeToMins(b.hora_inicio), end: timeToMins(b.hora_fim) });
      });

    // 3. Expediente e Almoço
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const dayConfig = settings.find(s => s.dia_semana === dayOfWeek);
    
    let openStart = 0;
    let openEnd = 24 * 60;
    let isClosed = false;

    if (dayConfig) {
      if (!dayConfig.esta_ativo) {
        isClosed = true;
      } else {
        openStart = timeToMins(dayConfig.hora_inicio);
        openEnd = timeToMins(dayConfig.hora_fim);
        if (dayConfig.almoco_inicio && dayConfig.almoco_fim) {
           intervals.push({ start: timeToMins(dayConfig.almoco_inicio), end: timeToMins(dayConfig.almoco_fim) });
        }
      }
    } else {
      isClosed = true; // sem configuração = fechado
    }

    // --- FILTRO FINAL: SLOT FITTING POR MATEMÁTICA DE INTERVALOS ---
    const serviceDuration = newAppointment.duration || 60;

    TIME_OPTIONS.forEach(slot => {
      if (isClosed) {
        occupied.add(slot);
        return;
      }
      
      const slotStart = timeToMins(slot);
      const slotEnd = slotStart + serviceDuration;

      // Fora do expediente
      if (slotStart < openStart || slotEnd > openEnd) {
        occupied.add(slot);
        return;
      }

      // Colisão matemática com intervalos (Overlap condition: StartA < EndB AND EndA > StartB)
      const hasCollision = intervals.some(inv => slotStart < inv.end && slotEnd > inv.start);
      if (hasCollision) {
        occupied.add(slot);
      }
    });

    return occupied;
  }, [newAppointment.date, newAppointment.duration, newAppointment.id, filteredAppointments, blocks, settings]);

  // Quando a data muda e o horário atual fica ocupado, pula para o próximo slot livre
  useEffect(() => {
    if (!isNewModalOpen || !newAppointment.date) return;
    if (occupiedSlotsForDate.has(newAppointment.time)) {
      const nextFree = TIME_OPTIONS.find(t => !occupiedSlotsForDate.has(t));
      if (nextFree) {
        setNewAppointment(prev => ({ ...prev, time: nextFree }));
      }
    }
  }, [occupiedSlotsForDate, isNewModalOpen]);

  const handleSaveAppointment = async () => {
    setIsSavingAppointment(true);
    let finalPatientId = newAppointment.patientId;

    try {
      const timeValStr = newAppointment.time + ':00';
      const dayOfWeek = new Date(newAppointment.date + 'T12:00:00').getDay();
      const dayConfig = settings.find(s => s.dia_semana === dayOfWeek);

      const blocksNoSlot = blocks.filter(b => b.data === newAppointment.date && timeValStr >= b.hora_inicio && timeValStr < b.hora_fim);
      const exceptionBlock = blocksNoSlot.find(b => b.descricao === 'LIVRE_EXCECAO');
      const manualBlock = blocksNoSlot.find(b => b.descricao !== 'LIVRE_EXCECAO');

      if (manualBlock) {
        alert(`Horário indisponível. Bloqueio: ${manualBlock.descricao}`);
        setIsSavingAppointment(false);
        return;
      }

      if (!exceptionBlock && dayConfig) {
        if (!dayConfig.esta_ativo) {
          alert('Este dia da semana está configurado como fechado.');
          setIsSavingAppointment(false);
          return;
        }
        if (timeValStr < dayConfig.hora_inicio || timeValStr >= dayConfig.hora_fim) {
          alert('Horário fora do expediente configurado para este dia.');
          setIsSavingAppointment(false);
          return;
        }
        if (dayConfig.almoco_inicio && dayConfig.almoco_fim) {
          if (timeValStr >= dayConfig.almoco_inicio && timeValStr < dayConfig.almoco_fim) {
            alert('Este horário coincide com o intervalo de almoço.');
            setIsSavingAppointment(false);
            return;
          }
        }
      }

      if (isRegisteringNewPatient) {
        if (!patientSearch) {
          alert('Nome do paciente é obrigatório.');
          setIsSavingAppointment(false);
          return;
        }
        if (!newPatientPhone) {
          alert('Telefone é obrigatório para cadastrar um novo paciente.');
          setIsSavingAppointment(false);
          return;
        }

        const { data: newPatient, error: patientError } = await supabase.from('patients').insert({
          name: patientSearch,
          phone: newPatientPhone,
          status: 'Ativo'
        }).select('*').single();

        if (patientError) throw patientError;

        finalPatientId = newPatient.id;

        // Optimistic update
        if (onPatientCreated) {
          onPatientCreated({
            ...newPatient,
            id: newPatient.id,
            name: newPatient.name,
            phone: newPatient.phone || '',
            status: newPatient.status || 'Ativo',
            createdAt: newPatient.created_at || new Date().toISOString()
          });
        }
      }

      // Busca nome do profissional selecionado (a partir da lista carregada via useProfessionals)
      const professionalSelected = professionals.find(p => p.id === newAppointment.physioId);
      const service = services.find(s => s.id === newAppointment.serviceId);
      const patientDetails = isRegisteringNewPatient ? { name: patientSearch, phone: newPatientPhone } : patients.find(p => p.id === finalPatientId);

      const payload = {
        patientId: finalPatientId,
        time: newAppointment.time,
        duration: newAppointment.duration,
        date: newAppointment.date,
        status: newAppointment.id ? (selectedAppointment?.status || 'PENDENTE') : 'PENDENTE',
        physioId: professionalSelected?.id || newAppointment.physioId || user.id,
        professional_id: professionalSelected?.id || newAppointment.physioId || user.id,
        clinicId: user.clinicId === 'clinic-123' ? null : user.clinicId,
        serviceName: service?.name ? service.name : (newAppointment.id ? selectedAppointment?.serviceName : undefined),
        value: newAppointment.value,
        paymentMethod: newAppointment.paymentMethod,
        tempGuestName: patientDetails?.name || patientSearch,
        tempGuestPhone: patientDetails?.phone || newPatientPhone,
        created_by: user.id
      };

      // --- Otimismo (Optimistic Update) ---
      const tempId = newAppointment.id || ('temp_' + Math.random().toString(36).substring(7));
      const optimisticAppt = {
        id: tempId,
        ...payload,
        patient: payload.tempGuestName || 'Paciente Não Identificado',
        phone: payload.tempGuestPhone || '',
        bgColor: payload.status === 'CONFIRMADO' ? 'bg-emerald-50 text-emerald-800 border-y border-r border-emerald-200 border-l-4 border-l-emerald-500 shadow-sm' : 'bg-orange-50 text-orange-800 border-y border-r border-orange-200 border-l-4 border-l-orange-500 shadow-sm',
        type: payload.serviceName,
        physio: professionalSelected?.name || user.name,
        created_by: user.id,
        creatorName: user.name,
        creatorRole: user.role
      };

      // Backup do estado
      const previousAppointments = [...appointments];

      if (newAppointment.id) {
        setAppointments(prev => prev.map(a => a.id === newAppointment.id ? { ...a, ...optimisticAppt } as any : a));
      } else {
        setAppointments(prev => [...prev, optimisticAppt as any]);
      }

      // Fecha o modal imediatamente para fluidez
      setIsNewModalOpen(false);
      setPatientSearch('');
      setIsRegisteringNewPatient(false);
      setNewPatientPhone('');
      
      let saveError;
      let finalData;
      if (newAppointment.id) {
        const { data, error } = await supabase.from('appointments').update(payload).eq('id', newAppointment.id).select().single();
        saveError = error; finalData = data;
      } else {
        const { data, error } = await supabase.from('appointments').insert(payload).select().single();
        saveError = error; finalData = data;
      }

      if (saveError) {
        // Reverte a atualização otimista em caso de erro
        setAppointments(previousAppointments);
        throw saveError;
      } else if (!newAppointment.id && finalData) {
        // Sincroniza o ID temporário com o real do banco
        setAppointments(prev => prev.map(p => p.id === tempId ? { ...p, id: finalData.id } : p));
      }

    } catch (err: any) {
      console.error(err);
      alert("Erro ao salvar agendamento: " + err.message);
    } finally {
      setIsSavingAppointment(false);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? (view === 'week' ? 7 : 1) : (view === 'week' ? -7 : -1)));
    }
    setCurrentDate(newDate);
  };

  const handleConfirmPresence = async () => {
    // Se o agendamento não tem patientId mas tem nome temporário (veio do portal público)
    if (!selectedAppointment.patientId && selectedAppointment.patient) {
      try {
        // 1. Criar novo paciente no Supabase
        const { data: newPatient, error: patientError } = await supabase.from('patients').insert({
          name: selectedAppointment.patient,
          phone: selectedAppointment.phone || '',
          status: 'Ativo'
        }).select('*').single();

        if (patientError) throw patientError;

        // 2. Atualizar appointment para vinculado e status CONFIRMADO
        const { error: apptError } = await supabase.from('appointments').update({
          patientId: newPatient.id,
          status: 'CONFIRMADO',
          physioId: selectedAppointment.physioId || user.id,
          paymentMethod: detailsPaymentMethod
        }).eq('id', selectedAppointment.id);

        if (apptError) throw apptError;

        const displayDate = selectedAppointment.date ? selectedAppointment.date.split('-').reverse().join('/') : 'Data Inválida';
        await supabase.from('notifications').insert({
          title: 'Agendamento Confirmado',
          message: `${newPatient.name}\n${selectedAppointment.serviceName || selectedAppointment.type || 'Serviço'} - ${displayDate} às ${selectedAppointment.time}`,
          is_read: false,
          isRead: false,
          created_at: new Date().toISOString()
        });

        await supabase.from('transactions').insert({
          description: `Atendimento: ${selectedAppointment.serviceName || selectedAppointment.type || 'Serviço'}`,
          patient: newPatient.name,
          patient_id: newPatient.id,
          date: new Date().toISOString().split('T')[0],
          method: detailsPaymentMethod,
          value: Number(selectedAppointment.value) || 0,
          type: 'RECEITA',
          status: 'Pago'
        });

        alert("Paciente cadastrado e atendimento confirmado com sucesso!");
        setAppointments(prev => prev.map(app => app.id === selectedAppointment.id ? { ...app, patientId: newPatient.id, status: 'CONFIRMADO', physioId: app.physioId || user.id, bgColor: 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm' } : app));
        setIsDetailsModalOpen(false);

        // Optimistic update to patients table so we don't have to wait for Supabase Realtime
        if (onPatientCreated) {
          onPatientCreated({
            id: newPatient.id,
            name: newPatient.name,
            phone: newPatient.phone || '',
            cpf: newPatient.cpf || '',
            birthDate: newPatient.birthdate || '',
            address: newPatient.address || '',
            gender: newPatient.gender || 'Não Informado',
            insurance: newPatient.insurance || 'Nenhuma',
            status: newPatient.status || 'Ativo',
            createdAt: newPatient.created_at || new Date().toISOString(),
            creditsRemaining: newPatient.credits_remaining || 0,
            notes: newPatient.notes || '',
            cidCode: newPatient.cid_code || '',
            cidDescription: newPatient.cid_description || '',
            role: newPatient.role,
            responsiblePhysioId: newPatient.physio_id || ''
          });
        }

        if (onNavigateToPatient) {
          onNavigateToPatient(newPatient.id);
        }
        return;

      } catch (err: any) {
        console.error(err);
        alert("Erro ao auto-cadastrar paciente: " + err.message);
        return;
      }
    }

    // Fluxo normal para quem já tem cadastro
    // Atualização otimista
    setAppointments(prev => prev.map(app => app.id === selectedAppointment.id ? { ...app, status: 'CONFIRMADO', physioId: app.physioId || user.id, bgColor: 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm' } : app));
    setIsDetailsModalOpen(false);

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'CONFIRMADO', physioId: selectedAppointment.physioId || user.id, paymentMethod: detailsPaymentMethod })
      .eq('id', selectedAppointment.id);

    if (error) {
      console.error(error);
      alert("Erro ao confirmar atendimento. O sistema tentará sincronizar novamente.");
    } else {
      await supabase.from('transactions').insert({
        description: `Atendimento: ${selectedAppointment.serviceName || selectedAppointment.type || 'Serviço'}`,
        patient: selectedAppointment.patient,
        patient_id: selectedAppointment.patientId,
        date: new Date().toISOString().split('T')[0],
        method: detailsPaymentMethod,
        value: Number(selectedAppointment.value) || 0,
        type: 'RECEITA',
        status: 'Pago'
      });

      const displayDate = selectedAppointment.date ? selectedAppointment.date.split('-').reverse().join('/') : 'Data Inválida';
      await supabase.from('notifications').insert({
        title: 'Agendamento Confirmado',
        message: `${selectedAppointment.patient}\n${selectedAppointment.serviceName || selectedAppointment.type || 'Serviço'} - ${displayDate} às ${selectedAppointment.time}`,
        is_read: false,
        isRead: false,
        created_at: new Date().toISOString()
      });

      alert("Atendimento confirmado com sucesso!");
    }

    if (onNavigateToPatient && selectedAppointment.patientId) {
      onNavigateToPatient(selectedAppointment.patientId);
    }
  };

  const handleCancelAppointment = async () => {
    if (confirm("Deseja realmente cancelar este agendamento?")) {
      // Atualização otimista
      setAppointments(prev => prev.map(app => app.id === selectedAppointment.id ? { ...app, status: 'CANCELADO', physioId: app.physioId || user.id, bgColor: 'bg-rose-50 text-rose-800 border border-rose-200 shadow-sm' } : app));
      setIsDetailsModalOpen(false);

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'CANCELADO', physioId: selectedAppointment.physioId || user.id })
        .eq('id', selectedAppointment.id);

      if (error) {
        console.error(error);
        alert("Erro ao cancelar atendimento.");
      } else {
        const displayDate = selectedAppointment.date ? selectedAppointment.date.split('-').reverse().join('/') : 'Data Inválida';
        await supabase.from('notifications').insert({
          title: 'Agendamento Cancelado!',
          message: `O paciente ${selectedAppointment.patient} cancelou.\n${selectedAppointment.serviceName || selectedAppointment.type || 'Serviço'} - ${displayDate} às ${selectedAppointment.time}`,
          is_read: false,
          isRead: false,
          created_at: new Date().toISOString()
        });
      }
    }
  };

  const handleCreateUserFromGuest = () => {
    setGuestForm({
      name: selectedAppointment.patient || '',
      phone: selectedAppointment.phone || '',
      email: selectedAppointment.email || '',
      cpf: ''
    });
    setIsGuestRegistrationOpen(true);
  };

  const submitGuestRegistration = async () => {
    try {
      // 1. Criar na tabela patients
      const { data: newPatient, error: patientError } = await supabase.from('patients').insert({
        name: guestForm.name,
        phone: guestForm.phone,
        cpf: guestForm.cpf,
        status: 'Ativo'
      }).select('*').single();

      if (patientError) throw patientError;

      // 2. Atualizar appointment
      const { error: apptError } = await supabase.from('appointments').update({
        patientId: newPatient.id,
        physioId: selectedAppointment.physioId || user.id
      }).eq('id', selectedAppointment.id);

      if (apptError) throw apptError;

      alert("Paciente cadastrado e vinculado com sucesso!");
      setIsGuestRegistrationOpen(false);
      setIsDetailsModalOpen(false); // Fecha o modal de detalhes para forçar fetch ou a UI reabrir limpa

      if (onPatientCreated) {
        onPatientCreated({
          id: newPatient.id,
          name: newPatient.name,
          phone: newPatient.phone || '',
          cpf: newPatient.cpf || '',
          birthDate: newPatient.birthdate || newPatient.birthDate || '',
          address: newPatient.address || '',
          gender: newPatient.gender || 'Não Informado',
          insurance: newPatient.insurance || 'Nenhuma',
          status: newPatient.status || 'Ativo',
          createdAt: newPatient.created_at || newPatient.createdAt || new Date().toISOString(),
          creditsRemaining: newPatient.credits_remaining || newPatient.creditsRemaining || 0,
          notes: newPatient.notes || '',
          cidCode: newPatient.cid_code || newPatient.cidCode || '',
          cidDescription: newPatient.cid_description || newPatient.cidDescription || '',
          role: newPatient.role,
          responsiblePhysioId: newPatient.physio_id || newPatient.responsiblePhysioId || ''
        });
      }

      if (onNavigateToPatient) {
        onNavigateToPatient(newPatient.id);
      }

    } catch (err: any) {
      console.error(err);
      alert("Erro ao cadastrar usuário: " + err.message);
    }
  };

  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [currentDate]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 text-left">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Agenda</h2>
          <p className="text-gray-500 text-sm font-medium">Controle de atendimentos da clínica</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
            {['day', 'week', 'month'].map((v) => (
              <button key={v} onClick={() => setView(v as any)} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all capitalize ${view === v ? 'bg-[var(--primary-color)] text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          <button onClick={() => setIsBlockModalOpen(true)} className="flex items-center gap-2 bg-slate-100 text-slate-500 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-slate-200 active:scale-95">
            <Lock size={16} strokeWidth={3} /><span>Bloquear/Liberar Horários</span>
          </button>
          <button onClick={() => openNewAppointment()} className="flex items-center gap-2 bg-[var(--primary-color)] text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-cyan-100 transition-all hover:bg-[#008c9a] active:scale-95">
            <Plus size={18} strokeWidth={3} /><span>Novo Agendamento</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-4 rounded-3xl shadow-sm border border-gray-100 mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => navigateDate('prev')} className="p-2.5 bg-gray-50 rounded-xl text-gray-400 hover:bg-gray-100 transition-all"><ChevronLeft size={18} /></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2.5 bg-gray-50 rounded-xl text-xs font-black text-gray-600 hover:bg-gray-100 transition-all">HOJE</button>
            <button onClick={() => navigateDate('next')} className="p-2.5 bg-gray-50 rounded-xl text-gray-400 hover:bg-gray-100 transition-all"><ChevronRight size={18} /></button>
          </div>
          <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider">{currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', day: view !== 'month' ? 'numeric' : undefined })}</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-widest">{user.name}</span>
          </div>
        </div>
      </div>

      {/* Agenda Grid */}
      <div className="bg-white rounded-[40px] shadow-sm border border-gray-300 overflow-hidden">
        {view === 'month' ? (
          <div className="animate-in fade-in duration-500">
            <div className="grid grid-cols-7 border-b border-gray-300 bg-gray-100/50">
              {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map(day => (
                <div key={day} className="p-4 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-300 last:border-r-0">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 min-h-[500px]">
              {monthDays.map((day, i) => (
                <div key={i} className={`min-h-[100px] p-2 border-r border-b border-gray-300 text-left transition-colors relative group ${day ? 'hover:bg-gray-50 cursor-pointer' : 'bg-gray-50/20'}`} onClick={() => day && openNewAppointment(`2026-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`)}>
                  {day && (
                    <>
                      <span className="text-xs font-black text-gray-500 mb-2 block">{day}</span>
                      <div className="space-y-1">
                        {filteredAppointments.filter(a => new Date(a.date + 'T12:00:00').getDate() === day && new Date(a.date + 'T12:00:00').getMonth() === currentDate.getMonth()).map(app => (
                          <div key={app.id} onClick={(e) => { e.stopPropagation(); handleOpenDetails(app); }} className={`text-[8px] p-1.5 rounded-lg font-bold truncate transition-colors hover:brightness-95 ${app.bgColor}`}>
                            {app.time} - {app.patient}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="grid grid-cols-8 border-b border-gray-300 bg-gray-100/50 sticky top-0 z-10">
              <div className="p-4 border-r border-gray-300 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">Horário</div>
              {[0, 1, 2, 3, 4, 5, 6].slice(0, view === 'day' ? 1 : 7).map((d) => {
                const date = new Date(currentDate);
                if (view === 'week') {
                  date.setDate(date.getDate() - date.getDay() + d + 1);
                }
                return (
                  <div key={d} className={`p-4 text-center border-r border-gray-300 last:border-0 ${view === 'day' ? 'col-span-7' : ''}`}>
                    <span className="block text-[10px] font-black text-gray-500 uppercase mb-1">{date.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                    <span className="text-lg font-black text-gray-800">{date.getDate()}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto max-h-[600px]">
              {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((hour) => (
                <div key={hour} className="grid grid-cols-8 border-b border-gray-300 group h-[120px]">
                  <div className="p-4 border-r border-gray-300 bg-gray-50 text-center text-[11px] font-black text-gray-400 pt-4">{String(hour).padStart(2, '0')}:00</div>
                  {[0, 1, 2, 3, 4, 5, 6].slice(0, view === 'day' ? 1 : 7).map((dayIdx) => {
                    const slotDate = new Date(currentDate);
                    if (view === 'week') {
                      slotDate.setDate(slotDate.getDate() - slotDate.getDay() + dayIdx + 1);
                    }
                    const dateStr = slotDate.toISOString().split('T')[0];
                    const timeStr = `${String(hour).padStart(2, '0')}:00`;
                    const timeValStr = `${String(hour).padStart(2, '0')}:00:00`;
                    const slotApps = filteredAppointments.filter(a => a.date === dateStr && a.time.startsWith(String(hour).padStart(2, '0')));

                    let isBlocked = false;
                    let blockReason = '';
                    
                    const dayOfWeek = slotDate.getDay();
                    const dayConfig = settings.find(s => s.dia_semana === dayOfWeek);

                    const blocksNoSlot = blocks.filter(b => b.data === dateStr && timeValStr >= b.hora_inicio && timeValStr < b.hora_fim);
                    const exceptionBlock = blocksNoSlot.find(b => b.descricao === 'LIVRE_EXCECAO');
                    const manualBlock = blocksNoSlot.find(b => b.descricao !== 'LIVRE_EXCECAO');

                    let manualBlockId = undefined;

                    if (manualBlock) {
                        isBlocked = true;
                        blockReason = manualBlock.descricao;
                        manualBlockId = manualBlock.id;
                    } else if (!exceptionBlock && dayConfig) {
                        if (!dayConfig.esta_ativo) {
                            isBlocked = true;
                            blockReason = 'Fechado';
                        } else {
                            if (timeValStr < dayConfig.hora_inicio || timeValStr >= dayConfig.hora_fim) {
                                isBlocked = true;
                                blockReason = 'Fora do Expediente';
                            } else if (dayConfig.almoco_inicio && dayConfig.almoco_fim) {
                                if (timeValStr >= dayConfig.almoco_inicio && timeValStr < dayConfig.almoco_fim) {
                                    isBlocked = true;
                                    blockReason = 'Almoço';
                                }
                            }
                        }
                    }

                    if (isBlocked) {
                      return (
                        <div key={dayIdx} onClick={() => handleSlotClick(dateStr, timeStr, slotApps, true, blockReason, manualBlockId)} className={`p-1 border-r border-gray-300 last:border-0 relative ${view === 'day' ? 'col-span-7' : ''} bg-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors`} style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)' }}>
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-70 px-2 text-center leading-tight">{blockReason}</span>
                        </div>
                      );
                    }

                    return (
                      <div key={dayIdx} className={`p-1 border-r border-gray-300 last:border-0 relative group transition-all cursor-pointer ${view === 'day' ? 'col-span-7' : ''} hover:bg-cyan-50/20`} onClick={() => handleSlotClick(dateStr, timeStr, slotApps, false, '')}>
                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-0">
                          <Plus size={14} className="text-[var(--primary-color)]" />
                        </div>
                        {slotApps.map(app => {
                           const startMin = parseInt(app.time.split(':')[1]) || 0;
                           const duration = Number(app.duration) || 60;
                           // 1 hour = 120px -> 1 min = 2px
                           const topOffset = startMin * 2;
                           const height = duration * 2;

                           return (
                             <div 
                               key={app.id} 
                               onClick={(e) => { e.stopPropagation(); handleOpenDetails(app); }} 
                               className={`absolute left-1 right-1 p-2 rounded-xl text-left ${app.bgColor} animate-in fade-in zoom-in-95 hover:brightness-95 transition-all cursor-pointer z-20 shadow-sm border overflow-hidden`}
                               style={{ top: `${topOffset}px`, height: `${height}px`, minHeight: '40px' }}
                             >
                                <p className="text-[10px] font-black leading-tight uppercase truncate">{app.time} - {app.patient}</p>
                                <p className="text-[8px] opacity-60 font-black mt-1 uppercase truncate">{app.serviceName || app.type || 'Serviço não informado'}</p>
                             </div>
                           );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL NOVO AGENDAMENTO */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[500px] rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-8 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-cyan-50 text-[var(--primary-color)] rounded-2xl"><Plus size={24} strokeWidth={3} /></div>
                <h3 className="font-black text-slate-800 text-xl">Novo Agendamento</h3>
              </div>
              <button onClick={() => setIsNewModalOpen(false)} className="p-3 text-slate-400 hover:bg-slate-50 rounded-2xl transition-all"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-1.5" ref={patientDropdownRef}>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Paciente *</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    type="text"
                    placeholder="Pesquisar paciente..."
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setIsPatientDropdownOpen(true);
                      if (newAppointment.patientId) {
                        setNewAppointment({ ...newAppointment, patientId: '' });
                      }
                      if (isRegisteringNewPatient) {
                        setIsRegisteringNewPatient(false);
                      }
                    }}
                    onFocus={() => setIsPatientDropdownOpen(true)}
                    className="w-full pl-12 pr-10 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none"
                  />
                  {patientSearch && (
                    <button
                      type="button"
                      onClick={() => { setPatientSearch(''); setNewAppointment({ ...newAppointment, patientId: '' }); setIsRegisteringNewPatient(false); setIsPatientDropdownOpen(false); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      <X size={16} />
                    </button>
                  )}
                  {isPatientDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 max-h-60 overflow-y-auto p-2">
                      {patients.filter(p => p.name.toLowerCase().includes(patientSearch.toLowerCase())).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setNewAppointment({ ...newAppointment, patientId: p.id });
                            setPatientSearch(p.name);
                            setIsPatientDropdownOpen(false);
                            setIsRegisteringNewPatient(false);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 ${newAppointment.patientId === p.id ? 'bg-cyan-50 text-[var(--primary-color)]' : 'text-gray-600'}`}
                        >
                          <span className="font-bold text-sm">{p.name}</span>
                        </button>
                      ))}
                      {patientSearch && !patients.some(p => p.name.toLowerCase() === patientSearch.toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRegisteringNewPatient(true);
                            setNewAppointment({ ...newAppointment, patientId: 'new' });
                            setIsPatientDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 rounded-xl hover:bg-indigo-50 text-indigo-600 flex items-center gap-3 font-bold text-sm"
                        >
                          <Plus size={16} /> + Cadastrar "{patientSearch}" como novo paciente
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {isRegisteringNewPatient && (
                  <div className="pt-3 animate-in fade-in slide-in-from-top-2">
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1 mb-1.5 block">Telefone do Novo Paciente *</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={18} />
                      <input
                        type="tel"
                        value={newPatientPhone}
                        onChange={(e) => setNewPatientPhone(e.target.value)}
                        placeholder="Ex: (11) 99999-9999"
                        className="w-full pl-12 pr-4 py-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-sm font-bold text-indigo-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Serviço *</label>
                <div className="relative">
                  <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <select
                    value={newAppointment.serviceId}
                    onChange={(e) => {
                      const selectedService = services.find(s => s.id === e.target.value);
                      setNewAppointment({
                        ...newAppointment,
                        serviceId: e.target.value,
                        value: selectedService ? selectedService.value : 0,
                        duration: selectedService ? (selectedService.duration || 60) : 60
                      });
                    }}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none appearance-none"
                  >
                    <option value="">Selecione o serviço...</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {newAppointment.serviceId && (
                  <p className="text-xs font-bold text-[var(--primary-color)] ml-1 mt-1 animate-in fade-in">
                    Valor do Procedimento: R$ {newAppointment.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Data *</label>
                  <input type="date" value={newAppointment.date} onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value })} className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Hora *</label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={16} />
                    <select
                      value={newAppointment.time}
                      onChange={(e) => setNewAppointment({ ...newAppointment, time: e.target.value })}
                      className="w-full pl-10 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none appearance-none"
                    >
                      {TIME_OPTIONS.map(t => {
                        const isOccupied = occupiedSlotsForDate.has(t);
                        return (
                          <option
                            key={t}
                            value={t}
                            disabled={isOccupied}
                            style={isOccupied ? { color: '#94a3b8', fontStyle: 'italic' } : {}}
                          >
                            {isOccupied ? `${t}  (Ocupado)` : t}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={16} />
                  </div>
                  {occupiedSlotsForDate.has(newAppointment.time) && (
                    <p className="text-[10px] font-black text-amber-500 ml-1 flex items-center gap-1 animate-in fade-in">
                      <AlertCircle size={11} /> Este horário está ocupado. Escolha outro.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Profissional *</label>
                <div className="relative">
                  <select
                    value={newAppointment.physioId}
                    onChange={(e) => setNewAppointment({ ...newAppointment, physioId: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none appearance-none"
                    required
                  >
                    <option value="">Selecione o profissional...</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Forma de Pagamento *</label>
                <div className="relative">
                  <select
                    value={newAppointment.paymentMethod}
                    onChange={(e) => setNewAppointment({ ...newAppointment, paymentMethod: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none appearance-none"
                    required
                  >
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="PIX">PIX</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-8 pt-2 flex items-center justify-end gap-3 bg-white border-t border-gray-50">
              <button onClick={() => setIsNewModalOpen(false)} disabled={isSavingAppointment} className="px-6 py-4 text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest disabled:opacity-50">Cancelar</button>
              <button
                onClick={handleSaveAppointment}
                disabled={isSavingAppointment || !newAppointment.serviceId || !newAppointment.physioId || (isRegisteringNewPatient ? (!patientSearch || !newPatientPhone) : !newAppointment.patientId)}
                className="flex-1 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white py-5 rounded-[24px] font-black text-sm uppercase tracking-widest shadow-2xl shadow-cyan-100 transition-all active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isSavingAppointment ? 'Carregando...' : 'Salvar Agendamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHES DO AGENDAMENTO */}
      {isDetailsModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[440px] rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-8 flex items-center justify-between border-b border-gray-50">
              <h3 className="font-black text-slate-800 text-xl tracking-tight">Detalhes do Agendamento</h3>
              <button onClick={() => setIsDetailsModalOpen(false)} className="p-3 text-slate-400 hover:bg-slate-50 rounded-2xl transition-all"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-8">
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-cyan-50 text-[var(--primary-color)] rounded-[22px] flex items-center justify-center font-black text-xl">{selectedAppointment.patient?.split(' ').map((n: string) => n[0]).join('') || '?'}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="text-2xl font-black text-slate-800 tracking-tight">{selectedAppointment.patient}</h4>
                      {!selectedAppointment.patientId && (
                        <button
                          onClick={handleCreateUserFromGuest}
                          className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                        >
                          <UserCheck size={14} /> Cadastrar Usuário
                        </button>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedAppointment.type}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data e Hora</p>
                  <p className="text-sm font-bold text-gray-700">{selectedAppointment.date} às {selectedAppointment.time}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Profissional</p>
                  {canAssignProfessional ? (
                    <div className="relative">
                      <select
                        value={selectedAppointment.physioId || ""}
                        onChange={(e) => handleAssignProfessional(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-[var(--primary-color)] focus:ring-2 focus:ring-[var(--primary-color)]/20 transition-all cursor-pointer"
                      >
                        <option value="">A Definir</option>
                        {assignableProfessionals.map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.full_name || 'Profissional'}</option>
                        ))}
                      </select>
                      {assignSuccess && (
                        <p className="text-[10px] text-emerald-500 font-bold mt-1 absolute -bottom-4 left-1 animate-in fade-in">Profissional atualizado com sucesso!</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-gray-700">{selectedAppointment.physio}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor</p>
                  <p className="text-sm font-black text-[var(--primary-color)]">R$ {selectedAppointment.value?.toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</p>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border max-w-max ${selectedAppointment.status === 'CONFIRMADO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    selectedAppointment.status === 'CANCELADO' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                      'bg-orange-50 text-orange-600 border-orange-100' // Pendente
                    }`}>{selectedAppointment.status}</span>
                </div>
              </div>
              
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between mt-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Agendado por</span>
                  {isLoadingCreator ? (
                    <div className="h-4 w-32 bg-slate-200 animate-pulse rounded mt-1"></div>
                  ) : (
                    <span className="text-sm font-bold text-slate-700">{creatorData?.name || selectedAppointment.creatorName || 'Sistema / Não Encontrado'}</span>
                  )}
                </div>
                {isLoadingCreator ? (
                   <div className="h-6 w-16 bg-slate-200 animate-pulse rounded-lg"></div>
                ) : (
                  <div className="bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{creatorData?.role || selectedAppointment.creatorRole || 'Admin'}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="p-10 pt-4 flex flex-col gap-3 bg-white">
              {selectedAppointment.status === 'PENDENTE' && (
                <div className="mb-2 animate-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Confirmar Método Pagamento:</label>
                  <select 
                    value={detailsPaymentMethod} 
                    onChange={(e) => setDetailsPaymentMethod(e.target.value)}
                    className="w-full bg-gray-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none"
                  >
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="PIX">PIX</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              )}
              {selectedAppointment.status === 'PENDENTE' && (
                <button onClick={handleConfirmPresence} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-5 rounded-[24px] font-black text-sm uppercase tracking-widest shadow-2xl shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-2"><CheckCircle2 size={18} /> Confirmar Presença</button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleEditAppointment} className="bg-gray-50 hover:bg-gray-100 text-gray-500 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"><Edit size={16} /> Editar</button>
                <button onClick={handleCancelAppointment} className="bg-rose-50 hover:bg-rose-100 text-rose-500 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"><Trash2 size={16} /> Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CADASTRAR USUÁRIO DO AGENDAMENTO PÚBLICO */}
      {isGuestRegistrationOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-[500px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-500 rounded-xl"><UserCheck size={20} strokeWidth={2.5} /></div>
                <div>
                  <h3 className="font-black text-slate-800 tracking-tight">Efetivar Cadastro</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vincular paciente ao sistema</p>
                </div>
              </div>
              <button onClick={() => setIsGuestRegistrationOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><X size={20} /></button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo *</label>
                <input type="text" value={guestForm.name} onChange={e => setGuestForm({ ...guestForm, name: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Telefone *</label>
                <input type="text" value={guestForm.phone} onChange={e => setGuestForm({ ...guestForm, phone: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">CPF (Opcional)</label>
                <input type="text" value={guestForm.cpf} onChange={e => setGuestForm({ ...guestForm, cpf: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Email (Opcional)</label>
                <input type="text" value={guestForm.email} onChange={e => setGuestForm({ ...guestForm, email: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsGuestRegistrationOpen(false)} className="px-5 py-3 text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
              <button onClick={submitGuestRegistration} disabled={!guestForm.name || !guestForm.phone} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95">Salvar Paciente</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BLOQUEIO MANUAL */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-[400px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl"><Lock size={20} strokeWidth={2.5} /></div>
                <div>
                  <h3 className="font-black text-slate-800 tracking-tight">Bloquear Horário</h3>
                </div>
              </div>
              <button onClick={() => setIsBlockModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><X size={20} /></button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Motivo (ex: Reunião, Academia) *</label>
                <input type="text" value={newBlock.descricao} onChange={e => setNewBlock({ ...newBlock, descricao: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-slate-500/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Data *</label>
                <input type="date" value={newBlock.data} onChange={e => setNewBlock({ ...newBlock, data: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-slate-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Início *</label>
                  <input type="time" value={newBlock.hora_inicio} onChange={e => setNewBlock({ ...newBlock, hora_inicio: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-slate-500/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Fim *</label>
                  <input type="time" value={newBlock.hora_fim} onChange={e => setNewBlock({ ...newBlock, hora_fim: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-slate-500/20" />
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setIsBlockModalOpen(false)} className="px-5 py-3 text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
              <button onClick={handleSaveBlock} disabled={!newBlock.descricao || !newBlock.data} className="px-6 py-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95">Salvar Bloqueio</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AÇÕES DO SLOT */}
      {isSlotActionModalOpen && slotActionData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[340px] rounded-[32px] shadow-2xl overflow-hidden flex flex-col items-center p-8">
            <h3 className="font-black text-slate-800 text-xl tracking-tight mb-2">Ação Rápida</h3>
            <p className="text-sm font-medium text-slate-500 mb-8 text-center">
              Horário selecionado: <br />
              <strong className="text-[var(--primary-color)]">{new Date(slotActionData.date + 'T12:00:00').toLocaleDateString('pt-BR')} às {slotActionData.time}</strong>
            </p>

            <div className="flex flex-col gap-3 w-full">
               {!slotActionData.isBlocked && (
                  <>
                    <button 
                      onClick={() => { setIsSlotActionModalOpen(false); openNewAppointment(slotActionData.date, slotActionData.time); }}
                      className="bg-[var(--primary-color)] hover:bg-[#008c9a] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all w-full flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> Novo Agendamento
                    </button>
                    
                    <button 
                      onClick={() => { 
                          setIsSlotActionModalOpen(false); 
                          setNewBlock({ ...newBlock, data: slotActionData.date, hora_inicio: slotActionData.time, hora_fim: String(Number(slotActionData.time.split(':')[0]) + 1).padStart(2,'0') + ':00' }); 
                          setIsBlockModalOpen(true); 
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all w-full flex items-center justify-center gap-2"
                    >
                      <Lock size={16} /> Bloquear Horário
                    </button>
                  </>
               )}

               {slotActionData.isBlocked && (
                  <>
                     <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-center mb-2">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-1">Motivo do Bloqueio:</span>
                        <span className="text-sm font-bold text-amber-700">{slotActionData.blockReason}</span>
                     </div>

                     {slotActionData.manualBlockId ? (
                        <button 
                          onClick={() => handleUnblock(slotActionData.manualBlockId!)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all w-full flex items-center justify-center gap-2"
                        >
                          <Lock size={16} /> Liberar Horário
                        </button>
                     ) : (
                        <button 
                          onClick={async () => {
                             try {
                               await createBlock({
                                  descricao: 'LIVRE_EXCECAO',
                                  data: slotActionData.date,
                                  hora_inicio: slotActionData.time + ':00',
                                  hora_fim: String(Number(slotActionData.time.split(':')[0]) + 1).padStart(2,'0') + ':00'
                               });
                               setIsSlotActionModalOpen(false);
                               setSlotActionData(null);
                               alert('Exceção criada: Horário liberado com sucesso!');
                             } catch(e:any) { 
                               alert('Erro: ' + e.message); 
                             }
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all w-full flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 size={16} /> Liberar Horário (Criar Exceção)
                        </button>
                     )}
                  </>
               )}
            </div>

            <button onClick={() => setIsSlotActionModalOpen(false)} className="mt-6 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};
