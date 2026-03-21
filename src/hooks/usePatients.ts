import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Patient } from '../../types';

// ── Cache global SWR (Stale-While-Revalidate) ──────────────────────────────
// Mantém os últimos dados válidos entre remontagens e falhas transitórias.
export let globalPatientsCache: Patient[] | null = null;

function mapPatient(p: any): Patient {
    return {
        id: p.id,
        name: p.full_name || p.name,
        full_name: p.full_name || p.name,
        phone: p.phone || '',
        cpf: p.cpf || '',
        birthDate: p.birth_date || p.birthDate || '',
        birth_date: p.birth_date || p.birthDate || '',
        address: p.address || '',
        gender: p.gender || 'Não Informado',
        insurance: p.insurance || 'Nenhuma',
        status: p.status || 'Ativo',
        createdAt: p.createdAt || new Date().toISOString(),
        creditsRemaining: p.creditsRemaining || 0,
        notes: p.initial_observations || p.notes || '',
        initial_observations: p.initial_observations || p.notes || '',
        cidCode: p.cidCode || '',
        cidDescription: p.cidDescription || '',
        responsiblePhysioId: p.responsiblePhysioId || '',
        fitzpatrick_scale: p.fitzpatrick_scale || p.cid10 || '',
        allergies: p.allergies || '',
        cid10: p.cid10 || ''
    };
}

// Ferramenta de pre-fetch global utilizada no inicializador do App (Promise.all)
export const prefetchPatients = async () => {
    try {
        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .order('name', { ascending: true });
        if (data && !error) {
            globalPatientsCache = data.map(mapPatient);
        }
    } catch (e) {
        // Silencioso — o hook fará o retry
    }
};

export const usePatients = () => {
    // ✅ Inicializa com cache SWR: usa dados prefetchados se disponíveis
    const [patients, setPatients] = useState<Patient[]>(globalPatientsCache ?? []);
    const [loading, setLoading] = useState(globalPatientsCache === null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    useEffect(() => {

        const fetchPatients = async () => {
            console.log('[usePatients] SELECT obrigatório de pacientes no SWR');
            try {
                // ✅ Tenta refresh de sessão antes de verificar — previne silent logout
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user) {
                    // ✅ PROTEÇÃO: Não zera dados. Apenas para de carregar se realmente sem sessão.
                    // Sem usuário = aborta a busca (Trava de Segurança)
                    if (isMountedRef.current) setLoading(false);
                    return;
                }
                
                console.log('Fase 2: Buscando Dados... (Patients)');

                // Só mostra loading bloqueante se não houver cache
                if (globalPatientsCache === null && isMountedRef.current) {
                    setLoading(true);
                }

                const { data, error } = await supabase
                    .from('patients')
                    .select('*')
                    .order('name', { ascending: true });

                console.log('[usePatients] Dados recebidos:', data, 'Erro:', error);
        if (data && !error) console.log('Tabela Patients carregou:', data);

                if (error) {
                    if (error.message?.includes('JWT') || error.code === '401' || error.message?.includes('token')) {
                         console.warn('⚠️ Token expirado detectado na query! Forçando refresh...');
                         await supabase.auth.refreshSession();
                    }
                    console.warn('[usePatients] Erro ao buscar — mantendo dados existentes:', error.message);
                    // ✅ PROTEÇÃO: Em caso de erro, NÃO zera — mantém o cache existente
                    if (isMountedRef.current) setLoading(false);
                    return;
                }

                if (data && isMountedRef.current) {
                    const mapped = data.map(mapPatient);
                    // ✅ Atualiza cache global para próximas remontagens
                    globalPatientsCache = mapped;
                    setPatients(mapped);
                }
            } catch (err) {
                console.warn('[usePatients] Erro inesperado — mantendo dados existentes:', err);
                // ✅ PROTEÇÃO: Nunca zera em exceção
            } finally {
                if (isMountedRef.current) setLoading(false);
            }
        };

        fetchPatients();

        const channelName = 'patients_' + Math.random().toString(36).substring(7);
        const subscription = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
                fetchPatients();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    return { patients, loading, setPatients };
};
