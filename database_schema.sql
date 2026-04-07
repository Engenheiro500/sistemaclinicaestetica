-- ==============================================================================
-- 🚀 SCRIPT SQL MESTRE DE CONFIGURAÇÃO FINAL INTEGRADO - MIGRAÇÃO SUPABASE 🚀
-- ==============================================================================
-- Utilize este script diretamente no SQL Editor do Supabase para inicializar
-- toda a estrutura, restrições e inteligência do seu novo Banco de Dados.
-- As aspas duplas estão presentes para garantir a criação exata das colunas
-- em camelCase exigidas pelo código-fonte do Frontend em React.
-- ==============================================================================

-- 1. HABILITANDO EXTENSÕES OBRIGATÓRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 2. TIPOS E ENUMS PERSONALIZADOS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('ADMIN', 'RECEPCIONISTA', 'PROFISSIONAL', 'PENDENTE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
        CREATE TYPE appointment_status AS ENUM ('AGENDADO', 'PENDENTE', 'CONFIRMADO', 'CANCELADO', 'REALIZADO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('RECEITA', 'DESPESA');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
        CREATE TYPE transaction_status AS ENUM ('PAGO', 'PENDENTE', 'CANCELADO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM ('PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'TRANSFERENCIA');
    END IF;
END $$;

-- ==============================================================================
-- 3. CRIAÇÃO DAS TABELAS (Com aspas nos "camelCase" para matching exato no Frontend)
-- ==============================================================================

-- 3.1 Profiles (Vinculado a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role DEFAULT 'PENDENTE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.2 Clinic Settings
CREATE TABLE IF NOT EXISTS public.clinic_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_name TEXT NOT NULL,
    admin_access_level TEXT DEFAULT 'FULL',
    primary_color TEXT DEFAULT '#0284c7',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.3 Horarios de Funcionamento
CREATE TABLE IF NOT EXISTS public.horarios_funcionamento (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "clinicId" UUID REFERENCES public.clinic_settings(id) ON DELETE CASCADE,
    dia_semana INTEGER NOT NULL, -- 0 (Domingo) a 6 (Sábado)
    hora_inicio TIME,
    hora_fim TIME,
    almoco_inicio TIME,
    almoco_fim TIME,
    esta_ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.4 Bloqueios de Agenda
CREATE TABLE IF NOT EXISTS public.bloqueios_agenda (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data DATE NOT NULL,
    hora_inicio TIME,
    hora_fim TIME,
    motivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.5 Services (Procedimentos)
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    duration INTEGER NOT NULL, -- em minutos
    price NUMERIC(10,2) NOT NULL,
    color TEXT DEFAULT '#0ea5e9',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.6 Patients
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    cpf TEXT,
    "birthDate" DATE,
    birth_date DATE,
    address TEXT,
    gender TEXT,
    insurance TEXT,
    status TEXT DEFAULT 'Ativo',
    "creditsRemaining" INTEGER DEFAULT 0,
    notes TEXT,
    initial_observations TEXT,
    "cidCode" TEXT,
    "cidDescription" TEXT,
    "cid10" TEXT,
    "responsiblePhysioId" UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    fitzpatrick_scale TEXT,
    allergies TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.7 Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.8 Appointments (Gestão da Agenda)
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "patientId" UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    patient TEXT,
    "tempGuestName" TEXT,
    "tempGuestPhone" TEXT,
    "tempGuestEmail" TEXT,
    phone TEXT,
    email TEXT,
    date DATE NOT NULL,
    time TIME NOT NULL,
    duration INTEGER,
    status appointment_status DEFAULT 'PENDENTE',
    "serviceId" UUID REFERENCES public.services(id) ON DELETE SET NULL,
    "serviceName" TEXT,
    type TEXT,
    value NUMERIC(10,2),
    "professionalId" UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    "physioId" UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    professional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    "paymentMethod" payment_method,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.9 Transactions (Financeiro)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    "patientId" UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    patient TEXT,
    date DATE NOT NULL,
    method payment_method,
    "paymentMethod" payment_method,
    value NUMERIC(10,2) NOT NULL,
    type transaction_type NOT NULL,
    status transaction_status DEFAULT 'PENDENTE',
    notes TEXT,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.10 Clinical Records (Prontuários)
CREATE TABLE IF NOT EXISTS public.clinical_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "patientId" UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    "professionalId" UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.11 Patient Packages (Pacotes Clínicos)
CREATE TABLE IF NOT EXISTS public.patient_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "patientId" UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    "serviceId" UUID REFERENCES public.services(id) ON DELETE SET NULL NOT NULL,
    total_sessions INTEGER NOT NULL,
    used_sessions INTEGER DEFAULT 0,
    price NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'Ativo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3.12 Patient Subscriptions (Assinaturas)
CREATE TABLE IF NOT EXISTS public.patient_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "patientId" UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    plan_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    next_billing_date DATE,
    status TEXT DEFAULT 'Ativo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 4. DATABASE FUNCTIONS (Inteligência do Banco)
-- ==============================================================================

-- 4.1 handle_updated_at: Modifica os timestamps de alteração
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.2 handle_new_user: Associa um Usuário PENDENTE com minúsculo convertido
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_role_val TEXT;
BEGIN
    new_role_val := COALESCE(NEW.raw_user_meta_data->>'role', 'PENDENTE');
    
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        UPPER(new_role_val)::user_role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.3 check_permission: Autenticação de cargos inteligente
CREATE OR REPLACE FUNCTION public.check_permission(required_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_role TEXT;
BEGIN
    SELECT role::text INTO current_role FROM public.profiles WHERE id = auth.uid();
    
    IF current_role = 'ADMIN' THEN
        RETURN TRUE;
    END IF;
    
    IF current_role = 'RECEPCIONISTA' AND required_role IN ('RECEPCIONISTA', 'PROFISSIONAL') THEN
        RETURN TRUE;
    END IF;
    
    IF current_role = 'PROFISSIONAL' AND required_role = 'PROFISSIONAL' THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.4 check_appointment_overlap: Trava de conflitos considerando duração
CREATE OR REPLACE FUNCTION public.check_appointment_overlap()
RETURNS TRIGGER AS $$
DECLARE
    conflict_count INT;
BEGIN
    SELECT COUNT(*) INTO conflict_count
    FROM public.appointments
    WHERE "professionalId" = NEW."professionalId"
      AND date = NEW.date
      AND id != COALESCE(NEW.id, uuid_nil())
      AND status NOT IN ('CANCELADO', 'PENDENTE')
      AND (
          (NEW.time >= time AND NEW.time < time + (COALESCE(duration, 30) * interval '1 minute'))
          OR
          (NEW.time + (COALESCE(NEW.duration, 30) * interval '1 minute') > time AND NEW.time + (COALESCE(NEW.duration, 30) * interval '1 minute') <= time + (COALESCE(duration, 30) * interval '1 minute'))
      );
      
    IF conflict_count > 0 THEN
        RAISE EXCEPTION 'Já existe um agendamento para este profissional neste horário.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.5 check_past_appointment: Trava uso de data retroativa
CREATE OR REPLACE FUNCTION public.check_past_appointment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date < CURRENT_DATE AND NEW.status != 'CANCELADO' AND NEW.status != 'REALIZADO' THEN
        RAISE EXCEPTION 'Não é permitido criar um agendamento em datas retroativas.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 5. DATABASE TRIGGERS
-- ==============================================================================

-- 5.1 Atualização de `updated_at`
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_clinic_settings_updated_at BEFORE UPDATE ON public.clinic_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_clinical_records_updated_at BEFORE UPDATE ON public.clinical_records FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_patient_packages_updated_at BEFORE UPDATE ON public.patient_packages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_patient_subscriptions_updated_at BEFORE UPDATE ON public.patient_subscriptions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5.2 Validações de Negócios e Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER validate_appointment_overlap BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.check_appointment_overlap();
CREATE TRIGGER validate_past_appointment BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.check_past_appointment();

-- ==============================================================================
-- 6. POLÍTICAS DE RLS (SUDO, ADMIN, PUBLIC)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios_funcionamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueios_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_subscriptions ENABLE ROW LEVEL SECURITY;

-- 6.1 Políticas PÚBLICAS (Aberto) -> OBRIGATÓRIO PARA AGENDAMENTO EXTERNO ONLINE RODAR
CREATE POLICY "Leitura Publica Settings" ON public.clinic_settings FOR SELECT USING (TRUE);
CREATE POLICY "Leitura Publica Services" ON public.services FOR SELECT USING (TRUE);
CREATE POLICY "Leitura Publica Horarios" ON public.horarios_funcionamento FOR SELECT USING (TRUE);
CREATE POLICY "Leitura Publica Bloqueios" ON public.bloqueios_agenda FOR SELECT USING (TRUE);
CREATE POLICY "Agendamento Online Appts" ON public.appointments FOR ALL USING (TRUE);
CREATE POLICY "Agendamento Online Patients" ON public.patients FOR ALL USING (TRUE);

-- 6.2 Políticas RESTRITAS AOS LOGADOS NO SISTEMA
CREATE POLICY "Leitura Perfis" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Edicao Perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.check_permission('ADMIN'));
CREATE POLICY "Acesso Notificacoes" ON public.notifications FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso Transactions" ON public.transactions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso Records" ON public.clinical_records FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso Packages" ON public.patient_packages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso Subs" ON public.patient_subscriptions FOR ALL USING (auth.role() = 'authenticated');

-- ==============================================================================
-- 7. CONFIGURAÇÃO REAL-TIME (Canais)
-- ==============================================================================
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE appointments, notifications, patients, transactions;

-- ==============================================================================
-- 8. STORAGE BUCKETS (Pastas do Supabase) E RLS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('clinic-assets', 'clinic-assets', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('user-avatars', 'user-avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-records', 'patient-records', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Assets publicos" ON storage.objects FOR SELECT USING (bucket_id = 'clinic-assets');
CREATE POLICY "Avatares de membros para todos" ON storage.objects FOR SELECT USING (bucket_id = 'user-avatars');
CREATE POLICY "Prontuarios para profissionais e admin" ON storage.objects FOR ALL USING (bucket_id = 'patient-records' AND auth.role() = 'authenticated');

-- ==============================================================================
-- 9. INSERÇÃO DO SEED DE CONFIGURAÇÃO DA CLÍNICA
-- ==============================================================================
INSERT INTO public.clinic_settings (clinic_name, admin_access_level, primary_color) 
VALUES ('Minha Clínica Base', 'FULL', '#0284c7') ON CONFLICT DO NOTHING;

-- Seed automático gerando grade da semana com almoco definido
DO $$
DECLARE
    default_clinic_id UUID;
    i INTEGER;
BEGIN
    SELECT id INTO default_clinic_id FROM public.clinic_settings LIMIT 1;
    IF NOT EXISTS (SELECT 1 FROM public.horarios_funcionamento WHERE "clinicId" = default_clinic_id) THEN
        FOR i IN 0..6 LOOP
            INSERT INTO public.horarios_funcionamento 
            ("clinicId", dia_semana, hora_inicio, hora_fim, almoco_inicio, almoco_fim, esta_ativo)
            VALUES (
                default_clinic_id, 
                i, 
                '08:00', 
                '18:00', 
                '12:00', 
                '13:00', 
                CASE WHEN i = 0 THEN false /* Dom Fechado */ ELSE true END
            );
        END LOOP;
    END IF;
END $$;
