import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ClinicSettings, DEFAULT_CLINIC_SETTINGS } from '../../types';

// ── Cache global SWR ───────────────────────────────────────────────────────────
let initialCache: ClinicSettings | null = null;
try {
    const cached = localStorage.getItem('fisiopro_clinic_settings');
    if (cached) {
        initialCache = JSON.parse(cached);
    }
} catch (e) {}

export let globalClinicSettingsCache: ClinicSettings | null = initialCache;
function mapSettings(data: any): ClinicSettings {
    return {
        id: data.id,
        clinic_name: data.clinic_name || DEFAULT_CLINIC_SETTINGS.clinic_name,
        logo_url: data.logo_url,
        primary_color: data.primary_color || DEFAULT_CLINIC_SETTINGS.primary_color,
        permissions: {
            receptionist: {
                ...DEFAULT_CLINIC_SETTINGS.permissions.receptionist,
                ...(data.permissions?.receptionist || {}),
            },
            professional: {
                ...DEFAULT_CLINIC_SETTINGS.permissions.professional,
                ...(data.permissions?.professional || {}),
            },
        },
    };
}

export const prefetchClinicSettings = async () => {
    try {
        const { data, error } = await supabase
            .from('clinic_settings')
            .select('*')
            .limit(1)
            .single();
        if (!error && data) {
            globalClinicSettingsCache = mapSettings(data);
            localStorage.setItem('fisiopro_clinic_settings', JSON.stringify(globalClinicSettingsCache));
        }
    } catch (err) {
        // Silencioso
    }
};

export const useClinicSettings = () => {
    // ✅ Inicializa com cache SWR global para evitar flash de valores padrão
    const [settings, setSettings] = useState<ClinicSettings>(
        globalClinicSettingsCache ?? DEFAULT_CLINIC_SETTINGS
    );
    const [loading, setLoading] = useState(globalClinicSettingsCache === null);
    const [saving, setSaving] = useState(false);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    useEffect(() => {
        const fetchSettings = async () => {
            // DEBUG DIRETO (BYPASS DE AUTH)
            try {
                const { data, error } = await supabase
                    .from('clinic_settings')
                    .select('*')
                    .limit(1)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.warn('[useClinicSettings] Erro ao buscar — mantendo settings existentes:', error.message);
                    // ✅ PROTEÇÃO: mantém settings atuais em caso de erro
                    if (isMountedRef.current) setLoading(false);
                    return;
                }

                if (data && isMountedRef.current) {
                    const newSettings = mapSettings(data);
                    // ✅ Atualiza cache global e local
                    globalClinicSettingsCache = newSettings;
                    localStorage.setItem('fisiopro_clinic_settings', JSON.stringify(newSettings));
                    setSettings(newSettings);
                }
            } catch (err) {
                console.warn('[useClinicSettings] Erro inesperado — mantendo settings existentes:', err);
            } finally {
                if (isMountedRef.current) setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const saveSettings = async (partial: Partial<ClinicSettings>) => {
        setSaving(true);
        try {
            const merged = { ...settings, ...partial };

            const payload = {
                clinic_name: merged.clinic_name,
                logo_url: merged.logo_url ?? null,
                primary_color: merged.primary_color ?? null,
                permissions: merged.permissions,
                updated_at: new Date().toISOString(),
            };

            let result;

            if (merged.id) {
                result = await supabase
                    .from('clinic_settings')
                    .update(payload)
                    .eq('id', merged.id)
                    .select()
                    .single();
            } else {
                result = await supabase
                    .from('clinic_settings')
                    .insert(payload)
                    .select()
                    .single();
            }

            if (result.error) {
                console.error('Erro ao salvar configurações:', result.error);
                return false;
            }

            if (result.data && isMountedRef.current) {
                const saved = mapSettings(result.data);
                globalClinicSettingsCache = saved;
                localStorage.setItem('fisiopro_clinic_settings', JSON.stringify(saved));
                setSettings(saved);
            }

            return true;
        } catch (err) {
            console.error('Erro inesperado ao salvar configurações:', err);
            return false;
        } finally {
            if (isMountedRef.current) setSaving(false);
        }
    };

    return { settings, loading, saving, saveSettings };
};
