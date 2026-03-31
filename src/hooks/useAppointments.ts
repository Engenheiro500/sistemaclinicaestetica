import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../../types';

export interface AppointmentData {
    id: string;
    patientId: string;
    patient: string;
    phone: string;
    email: string;
    time: string;
    duration: number;
    date: string;
    status: string;
    type: string;
    value: number;
    physioId: string;
    physio: string;
    bgColor: string;
    created_at?: string;
    created_by?: string;
    creatorName?: string;
    creatorRole?: string;
    isOutOfHours?: boolean;
    notes?: string;
    serviceName?: string;
    tempGuestName?: string;
    tempGuestPhone?: string;
    tempGuestEmail?: string;
    paymentMethod?: string;
}

// ── Cache global SWR ───────────────────────────────────────────────────────────
export let globalAppointmentsCache: AppointmentData[] | null = null;

async function buildUsersMap(userIds: string[]): Promise<Map<string, { name: string; role: string }>> {
    const validIds = userIds.filter(id => id && id.length === 36 && id.includes('-'));
    if (validIds.length === 0) return new Map();

    try {
        const { data, error } = await supabase.rpc('get_users_display_info', {
            user_ids: validIds
        });

        if (error) {
            console.warn('[useAppointments] RPC get_users_display_info falhou, usando fallback:', error.message);
            const { data: profiles } = await supabase.from('profiles').select('id, full_name, role');
            const map = new Map<string, { name: string; role: string }>();
            profiles?.forEach(p => map.set(p.id, { name: p.full_name || 'Profissional', role: p.role || 'Membro' }));
            return map;
        }

        const map = new Map<string, { name: string; role: string }>();
        data?.forEach((u: any) => map.set(u.id, { name: u.display_name || 'Profissional', role: u.display_role || 'Membro' }));
        return map;
    } catch (e) {
        console.warn('[useAppointments] Erro ao construir mapa de usuários:', e);
        return new Map();
    }
}

function getBgColor(status: string): string {
    const s = (status || 'PENDENTE').toUpperCase();
    if (s === 'PENDENTE') return 'bg-orange-50 text-orange-800 border-y border-r border-orange-200 border-l-4 border-l-orange-500 shadow-sm';
    if (s === 'CONFIRMADO') return 'bg-emerald-50 text-emerald-800 border-y border-r border-emerald-200 border-l-4 border-l-emerald-500 shadow-sm';
    if (s === 'CANCELADO') return 'bg-rose-50 text-rose-800 border-y border-r border-rose-200 border-l-4 border-l-rose-500 shadow-sm';
    return 'bg-cyan-50 text-cyan-800 border-y border-r border-cyan-200 border-l-4 border-l-cyan-500 shadow-sm';
}

function mapRow(row: any, usersMap: Map<string, { name: string; role: string }>): AppointmentData {
    const hour = parseInt((row.time || '00').split(':')[0] || '0');
    const isOutOfHours = hour < 8 || hour >= 18;

    const actualPhysioId: string = row.professional_id || row.physioId || '';
    const physioInfo = actualPhysioId ? usersMap.get(actualPhysioId) : null;
    const creatorInfo = row.created_by ? usersMap.get(row.created_by) : null;

    return {
        id: row.id,
        patientId: row.patientId,
        patient: row.tempGuestName || 'Paciente Não Identificado',
        phone: row.tempGuestPhone,
        email: row.tempGuestEmail,
        time: row.time,
        duration: row.duration,
        date: row.date,
        status: row.status,
        type: row.serviceName,
        value: row.value,
        physioId: actualPhysioId,
        physio: physioInfo?.name || (actualPhysioId ? `Profissional (${actualPhysioId.slice(0, 6)})` : 'A Definir'),
        bgColor: getBgColor(row.status),
        created_at: row.created_at || row.createdAt,
        created_by: row.created_by,
        creatorName: creatorInfo?.name || (row.created_by ? null : 'Administrador (Sistema)'),
        creatorRole: creatorInfo?.role || (row.created_by ? null : 'Admin'),
        isOutOfHours,
        paymentMethod: row.paymentMethod,
        notes: row.notes,
        serviceName: row.serviceName,
        tempGuestName: row.tempGuestName,
        tempGuestPhone: row.tempGuestPhone,
        tempGuestEmail: row.tempGuestEmail
    } as any;
}

// Pre-fetch global — usado no App na montagem inicial
export const prefetchAppointments = async () => {
    try {
        const { data, error } = await supabase.from('appointments').select('*');
        if (data && !error) {
            const ids = [...new Set(
                data.flatMap(row => [row.professional_id, row.physioId, row.created_by].filter(Boolean))
            )];
            const usersMap = await buildUsersMap(ids);
            globalAppointmentsCache = data.map(row => mapRow(row, usersMap));
        }
    } catch (e) {
        // Silencioso
    }
};

export function useAppointments() {
    // ✅ Inicializa com cache SWR global
    const [appointments, setAppointments] = useState<AppointmentData[]>(globalAppointmentsCache ?? []);
    const [loading, setLoading] = useState(globalAppointmentsCache === null);
    const isMountedRef = useRef(true);
    const fetchCountRef = useRef(0);
    const lastFetchRef = useRef(0);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const fetchAppointments = async () => {
        console.log('[useAppointments] SELECT obrigatório de agendamentos no SWR');

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                // ✅ Tenta refresh antes de desistir — evita silent logout
                const { data: refreshed } = await supabase.auth.refreshSession();
                if (!refreshed.session?.user) {
                    if (isMountedRef.current) setLoading(false);
                    return;
                }
            }
            
            console.log('Fase 2: Buscando Dados... (Appointments)');

            if (globalAppointmentsCache === null && isMountedRef.current) {
                setLoading(true);
            }

            const { data, error } = await supabase.from('appointments').select('*');
            console.log('[useAppointments] Dados recebidos:', data, 'Erro:', error);
        if (data && !error) console.log('Tabela Appointments carregou:', data);
            
            if (error) {
                if (error.message?.includes('JWT') || error.code === '401' || error.message?.includes('token')) {
                     console.warn('⚠️ Token expirado detectado em appointments! Forçando refresh...');
                     await supabase.auth.refreshSession();
                }
                console.warn('[useAppointments] Erro ao buscar — mantendo dados existentes:', error.message);
                // ✅ PROTEÇÃO: Não zera em erro
                if (isMountedRef.current) setLoading(false);
                return;
            }

            const ids = [...new Set(
                data.flatMap(row => [row.professional_id, row.physioId, row.created_by].filter(Boolean))
            )];

            const usersMap = await buildUsersMap(ids);
            const mapped = data.map(row => mapRow(row, usersMap));

            if (isMountedRef.current) {
                // ✅ Atualiza cache global
                globalAppointmentsCache = mapped;
                setAppointments(mapped);
            }
        } catch (err) {
            console.warn('[useAppointments] Erro inesperado — mantendo dados existentes:', err);
            // ✅ PROTEÇÃO: Nunca zera em exceção
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };

    useEffect(() => {

        fetchAppointments();

        const channelName = 'appointments_' + Math.random().toString(36).substring(7);
        const subscription = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
                console.log('[Supabase Realtime] Mudança em appointments capturada!', payload);
                fetchAppointments(); // Atualiza o grid visual
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[useAppointments] Realtime conectado no canal:', channelName);
                }
            });

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    const updateAppointmentNotes = async (id: string, notes: string) => {
        const { error } = await supabase
            .from('appointments')
            .update({ notes })
            .eq('id', id);

        if (error) {
            console.error('Erro ao atualizar notas:', error);
            throw error;
        }

        setAppointments(prev => prev.map(app =>
            app.id === id ? { ...app, notes } : app
        ));
    };

    const addAppointment = async (apptData: any) => {
        const tempId = 'temp_' + Math.random().toString(36).substring(7);
        const optimisticAppt: AppointmentData = {
            ...apptData,
            id: tempId,
            status: apptData.status || 'PENDENTE',
            bgColor: getBgColor(apptData.status),
            creatorName: apptData.creatorName || 'Carregando...',
            creatorRole: apptData.creatorRole || 'Admin',
            physioId: apptData.physioId,
            physio: apptData.physioName || 'Carregando...',
        };

        setAppointments(prev => [...prev, optimisticAppt]);

        const { data, error } = await supabase.from('appointments').insert([apptData]).select().single();

        if (error) {
            console.error('Erro ao adicionar agendamento:', error);
            setAppointments(prev => prev.filter(p => p.id !== tempId));
            throw error;
        }

        setAppointments(prev => prev.map(p => p.id === tempId ? { ...p, ...data, id: data.id } : p));
        return data;
    };

    return { appointments, setAppointments, loading, updateAppointmentNotes, addAppointment, fetchAppointments };
}
