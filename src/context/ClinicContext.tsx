import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ClinicSettings, DEFAULT_CLINIC_SETTINGS, UserRole } from '../../types';
import { useClinicSettings } from '../hooks/useClinicSettings';

interface ClinicContextValue {
  clinicSettings: ClinicSettings;
  saveClinicSettings: (partial: Partial<ClinicSettings>) => Promise<boolean>;
  savingSettings: boolean;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  hasPermission: (tab: string) => boolean;
}

const ClinicContext = createContext<ClinicContextValue>({
  clinicSettings: DEFAULT_CLINIC_SETTINGS,
  saveClinicSettings: async () => false,
  savingSettings: false,
  userRole: UserRole.ADMIN,
  setUserRole: () => {},
  hasPermission: () => true,
});

interface ClinicProviderProps {
  children: React.ReactNode;
  initialRole?: UserRole;
}

export const ClinicProvider: React.FC<ClinicProviderProps> = ({ children, initialRole = UserRole.ADMIN }) => {
  const { settings, saving, saveSettings } = useClinicSettings();
  const [userRole, setUserRole] = useState<UserRole>(initialRole);

  // Sync role if initialRole changes (e.g. after auth)
  useEffect(() => {
    setUserRole(initialRole);
  }, [initialRole]);

  // Inject primary_color to CSS variables
  useEffect(() => {
    if (settings && settings.primary_color) {
      document.documentElement.style.setProperty('--primary-color', settings.primary_color);
    }
  }, [settings.primary_color]);

  const hasPermission = useCallback((tab: string): boolean => {
    // 'perfil' é acessível para todos os cargos. Admin sempre tem acesso total.
    if (tab === 'perfil') return true;

    // Admin always has full access
    if (userRole === UserRole.ADMIN) return true;

    const key = tab as keyof typeof settings.permissions.receptionist;

    if (userRole === UserRole.RECEPTIONIST) {
      return settings.permissions.receptionist[key] ?? false;
    }

    if (userRole === UserRole.PROFESSIONAL) {
      return settings.permissions.professional[key] ?? false;
    }

    return false;
  }, [userRole, settings]);

  return (
    <ClinicContext.Provider
      value={{
        clinicSettings: settings,
        saveClinicSettings: saveSettings,
        savingSettings: saving,
        userRole,
        setUserRole,
        hasPermission,
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
};

export const useClinic = () => useContext(ClinicContext);
