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

  // Update document title and favicon based on clinic settings
  useEffect(() => {
    if (settings && settings.clinic_name) {
      document.title = settings.clinic_name;
    } else {
      document.title = 'GestãoFisio - Gestão de Clínica';
    }

    if (settings && settings.logo_url) {
      const applyRoundedFavicon = (imageUrl: string) => {
        const size = 64;
        const radius = 14; // cantos arredondados
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Desenhar máscara arredondada
          ctx.beginPath();
          ctx.moveTo(radius, 0);
          ctx.lineTo(size - radius, 0);
          ctx.quadraticCurveTo(size, 0, size, radius);
          ctx.lineTo(size, size - radius);
          ctx.quadraticCurveTo(size, size, size - radius, size);
          ctx.lineTo(radius, size);
          ctx.quadraticCurveTo(0, size, 0, size - radius);
          ctx.lineTo(0, radius);
          ctx.quadraticCurveTo(0, 0, radius, 0);
          ctx.closePath();
          ctx.clip();

          ctx.drawImage(img, 0, 0, size, size);

          const dataUrl = canvas.toDataURL('image/png');
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = dataUrl;
        };
        img.onerror = () => {
          // Fallback sem arredondamento
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = imageUrl;
        };
        img.src = imageUrl;
      };

      applyRoundedFavicon(settings.logo_url);
    }
  }, [settings.clinic_name, settings.logo_url]);

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
