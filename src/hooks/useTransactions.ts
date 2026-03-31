import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface TransactionRecord {
    id: string;
    description: string;
    patient: string;
    patient_id?: string;
    date: string;
    method: string;
    value: number;
    type: 'RECEITA' | 'DESPESA';
    status: string;
    notes?: string;
    created_at?: string;
}

// ── Cache global por query (chave baseada nos filtros) ─────────────────────────
const transactionsCache = new Map<string, TransactionRecord[]>();

function buildCacheKey(options?: { dateFrom?: string; dateTo?: string; patientId?: string }): string {
    return `${options?.dateFrom ?? ''}_${options?.dateTo ?? ''}_${options?.patientId ?? ''}`;
}

export function useTransactions(options?: { dateFrom?: string; dateTo?: string; patientId?: string }) {
    const cacheKey = buildCacheKey(options);
    const cached = transactionsCache.get(cacheKey) ?? null;

    // ✅ Inicializa com cache SWR se disponível
    const [transactions, setTransactions] = useState<TransactionRecord[]>(cached ?? []);
    const [loading, setLoading] = useState(cached === null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const fetchTransactions = async () => {
        console.log('[useTransactions] SELECT obrigatório no SWR');
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                if (isMountedRef.current) setLoading(false);
                return;
            }

            console.log('Fase 2: Buscando Dados... (Transactions)');

            // Só mostra loading bloqueante se não houver cache para esta query
            if (!transactionsCache.has(cacheKey) && isMountedRef.current) {
                setLoading(true);
            }

            let query = supabase
                .from('transactions')
                .select('*')
                .order('date', { ascending: false });

            if (options?.dateFrom) {
                query = query.gte('date', options.dateFrom);
            }
            if (options?.dateTo) {
                query = query.lte('date', options.dateTo);
            }
            if (options?.patientId) {
                query = query.eq('patient_id', options.patientId);
            }

            const { data, error } = await query;
            if (error) {
                console.warn('[useTransactions] Erro ao buscar — mantendo dados existentes:', error.message);
                // ✅ PROTEÇÃO: Não zera em erro de rede/sessão
                if (isMountedRef.current) setLoading(false);
                return;
            }

            if (data && isMountedRef.current) {
                // ✅ Atualiza cache por query
                transactionsCache.set(cacheKey, data);
                setTransactions(data);
            }
        } catch (err) {
            console.warn('[useTransactions] Erro inesperado — mantendo dados existentes:', err);
            // ✅ PROTEÇÃO: Nunca zera em exceção
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();

        const channelName = 'transactions_' + Math.random().toString(36).substring(7);
        const subscription = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
                fetchTransactions();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [options?.dateFrom, options?.dateTo, options?.patientId]);

    const addTransaction = async (tx: Omit<TransactionRecord, 'id' | 'created_at'>) => {
        // Optimistic UI
        const tempId = Math.random().toString(36).substring(7);
        const optimisticTx = { ...tx, id: tempId, created_at: new Date().toISOString() };
        setTransactions(prev => [optimisticTx, ...prev]);

        const { data, error } = await supabase.from('transactions').insert([tx]).select().single();
        if (error) {
            console.error('Erro ao salvar transação:', error);
            // Reverte optimistic
            setTransactions(prev => prev.filter(t => t.id !== tempId));
            throw error;
        }

        setTransactions(prev => prev.map(t => t.id === tempId ? data : t));

        // Invalida cache para forçar refetch
        transactionsCache.delete(cacheKey);
        return data;
    };

    const deleteTransaction = async (id: string) => {
        // Optimistic UI — remove imediatamente
        setTransactions(prev => prev.filter(t => t.id !== id));
        transactionsCache.delete(cacheKey);

        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) {
            console.error('Erro ao deletar transação:', error);
            // Reverte
            fetchTransactions();
            throw error;
        }
    };

    return { transactions, addTransaction, deleteTransaction, fetchTransactions, loading };
}
