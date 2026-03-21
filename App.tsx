
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Home } from './components/Home/Home';
import { Agenda } from './components/Agenda/Agenda';
import { Patients } from './components/Patients/Patients';
import { PatientDetail } from './components/Patients/PatientDetail';
import { Services } from './components/Services/Services';
import { Finance } from './components/Finance/Finance';
import { Admin } from './components/Admin/Admin';
import { Evaluations } from './components/Evaluations/Evaluations';
import { Reports } from './components/Reports/Reports';
import { Login } from './components/Auth/Login';
import { PublicScheduling } from './components/PublicScheduling/PublicScheduling';
import { MeuPerfil } from './components/Profile/MeuPerfil';
import { Crm } from './src/pages/Crm';
import { User, UserRole, Patient } from './types';
import { usePatients } from './src/hooks/usePatients';
import { useAppointments } from './src/hooks/useAppointments';
import { ClinicProvider, useClinic } from './src/context/ClinicContext';
import { supabase } from './src/lib/supabase';
import { prefetchPatients } from './src/hooks/usePatients';
import { prefetchAppointments } from './src/hooks/useAppointments';
import { prefetchClinicSettings } from './src/hooks/useClinicSettings';

// ─── Inner App (needs ClinicContext) ─────────────────────────────────────────
const AppInner: React.FC<{ user: User; onLogout: () => void; onUserUpdated: (u: User) => void }> = ({ user, onLogout, onUserUpdated }) => {
  const { hasPermission } = useClinic();
  const [activeTab, setActiveTab] = useState('home');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const { patients, setPatients } = usePatients();
  const { appointments } = useAppointments();

  // Protege a troca de aba: se não tem permissão, redireciona para home
  const handleTabChange = (tab: string) => {
    // 'perfil' é sempre acessível para todos os cargos
    if (tab !== 'perfil' && !hasPermission(tab)) {
      setActiveTab('home');
      return;
    }
    setActiveTab(tab);
    setSelectedPatientId(null);
  };

  // Monitora mudanças de activeTab para garantir proteção contínua
  useEffect(() => {
    if (activeTab !== 'home' && activeTab !== 'perfil' && !hasPermission(activeTab)) {
      setActiveTab('home');
    }
  }, [activeTab, hasPermission]);

  const renderContent = () => {
    if (selectedPatientId) {
      const realPatientData = patients.find(p => p.id === selectedPatientId);
      if (!realPatientData) return (
        <div className="flex-1 flex flex-col items-center justify-center h-full animate-in fade-in duration-500">
          <div className="w-16 h-16 border-4 border-cyan-200 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Sincronizando Cliente</h2>
          <p className="text-slate-500 font-medium">Aguardando confirmação do banco de dados...</p>
        </div>
      );

      const patientAppointments = appointments.filter(a => a.patientId === selectedPatientId);
      const patientDataWithPhysio = { ...realPatientData, physioResponsible: 'Clinica Geral' };

      return (
        <PatientDetail
          patientId={selectedPatientId}
          onBack={() => setSelectedPatientId(null)}
          patientData={patientDataWithPhysio}
          appointments={patientAppointments}
          user={user}
          onSave={(updatedPatientData) => {
            setPatients(prev => prev.map(p =>
              p.id === selectedPatientId ? { ...p, ...updatedPatientData } : p
            ));
          }}
        />
      );
    }

    switch (activeTab) {
      case 'home': return <Home onNavigateToPatient={(id) => { setActiveTab('pacientes'); setSelectedPatientId(id); }} />;
      case 'crm': return hasPermission('crm') ? <Crm /> : null;
      case 'agenda': return hasPermission('agenda') ? <Agenda
        user={user}
        onNavigateToPatient={(id) => { setActiveTab('pacientes'); setSelectedPatientId(id); }}
        onPatientCreated={(newPatient) => {
          setPatients(prev => prev.find(p => p.id === newPatient.id) ? prev : [...prev, newPatient]);
        }}
      /> : null;
      case 'pacientes': return hasPermission('pacientes') ? <Patients onSelectPatient={setSelectedPatientId} user={user} /> : null;
      case 'avaliacoes': return <Evaluations user={user} onNavigateToPatient={(id) => { setActiveTab('pacientes'); setSelectedPatientId(id); }} />;
      case 'relatorios': return hasPermission('relatorios') ? <Reports user={user} /> : null;
      case 'servicos': return hasPermission('servicos') ? <Services user={user} /> : null;
      case 'financeiro': return hasPermission('financeiro') ? <Finance user={user} /> : null;
      case 'admin': return hasPermission('admin') ? <Admin user={user} /> : null;
      case 'perfil': return <MeuPerfil user={user} onUserUpdated={onUserUpdated} />;
      default: return <Home onNavigateToPatient={(id) => { setActiveTab('pacientes'); setSelectedPatientId(id); }} />;
    }
  };

  return (
    <Layout
      user={user}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onLogout={onLogout}
      appointments={appointments}
      patients={patients}
      onSelectPatient={(id) => {
        setActiveTab('pacientes');
        setSelectedPatientId(id);
      }}
    >
      {renderContent()}
    </Layout>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.ADMIN);
  const [currentRoute, setCurrentRoute] = useState(window.location.hash);
  // ✅ Flag para evitar race condition: hooks só rodam após auth confirmada
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const handleHashChange = () => setCurrentRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Restaura sessão e sincroniza perfil atualizado do banco e escuta mudanças de Auth
  useEffect(() => {
    // 0. Pré-carregar logo e settings para login rápido
    prefetchClinicSettings().catch(() => {});

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('Fase 1: Auth OK', session.user.id);
          
          const metaRole = session.user.user_metadata?.role as string;
          const resolvedName = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário';
          
          let role = UserRole.ADMIN;
          if (metaRole === 'receptionist') role = UserRole.RECEPTIONIST;
          else if (metaRole === 'professional') role = UserRole.PROFESSIONAL;

          const syncedUser: User = {
            id: session.user.id,
            name: resolvedName,
            email: session.user.email || '',
            role: role,
            clinicId: 'clinic-123',
            avatar: session.user.user_metadata?.avatar_url || '',
            metaRole: metaRole
          } as any;

          setCurrentUser(syncedUser);
          setUser(syncedUser);
          setUserRole(role);
          localStorage.setItem('fisiopro_user', JSON.stringify(syncedUser));
          
          // Pré-carregamentos opcionais para otimização em background
          Promise.all([
            prefetchPatients(),
            prefetchAppointments()
          ]).catch(() => {});

        } else {
          setUser(null);
          setCurrentUser(null);
          localStorage.removeItem('fisiopro_user');
        }
      } catch (err) {
        console.error("Auth init error", err);
      } finally {
        setIsAuthReady(true);
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
       if (event === 'SIGNED_OUT') {
           setUser(null);
           setCurrentUser(null);
           setUserRole(UserRole.ADMIN);
           localStorage.removeItem('fisiopro_user');
       } else if (event === 'SIGNED_IN' && session?.user && isAuthReady) {
           // Se logou depois do load inicial
           console.log('Fase 1: Auth OK (SIGNED_IN)', session.user.id);
           const metaRole = session.user.user_metadata?.role as string;
           const syncedUser: User = {
            id: session.user.id,
            name: session.user.user_metadata?.name || 'Usuário',
            email: session.user.email || '',
            role: metaRole === 'receptionist' ? UserRole.RECEPTIONIST : metaRole === 'professional' ? UserRole.PROFESSIONAL : UserRole.ADMIN,
            clinicId: 'clinic-123',
            avatar: session.user.user_metadata?.avatar_url || '',
            metaRole: metaRole
          } as any;
          setCurrentUser(syncedUser);
          setUser(syncedUser);
          localStorage.setItem('fisiopro_user', JSON.stringify(syncedUser));
       }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    setCurrentUser(u);
    const role = (u as any).metaRole as string;
    if (role === 'receptionist') setUserRole(UserRole.RECEPTIONIST);
    else if (role === 'professional') setUserRole(UserRole.PROFESSIONAL);
    else setUserRole(UserRole.ADMIN);

    localStorage.setItem('fisiopro_user', JSON.stringify(u));
    window.location.hash = '#home';
  };

  // Atualiza o usuário loado em tempo real após edição de perfil
  const handleUserUpdated = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    setUser(updatedUser);
    localStorage.setItem('fisiopro_user', JSON.stringify(updatedUser));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCurrentUser(null);
    setUserRole(UserRole.ADMIN);
    localStorage.removeItem('fisiopro_user');
    window.location.hash = '#login';
  };

  // Rota pública de agendamento
  if (currentRoute === '#agendamento' || currentRoute === '' || currentRoute === '#' || currentRoute === '#/') {
    return <PublicScheduling />;
  }

  // ✅ Loading State da Fase 1: Segura a aplicação baseada se a sessão ainda está validando
  if (!isAuthReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
          <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: 'var(--primary-color, #00a5b5)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  // Não autenticado → Login
  if (!user || !currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  // Logado e em #login → redireciona para home
  if (currentRoute === '#login') {
    window.location.hash = '#home';
    return null;
  }

  return (
    <ClinicProvider initialRole={userRole}>
      <AppInner user={currentUser} onLogout={handleLogout} onUserUpdated={handleUserUpdated} />
    </ClinicProvider>
  );
};

export default App;
