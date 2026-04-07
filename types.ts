
export enum UserRole {
  ADMIN = 'admin',
  RECEPTIONIST = 'receptionist',
  PROFESSIONAL = 'professional',
  PENDENTE = 'PENDENTE',
  FISIO_AUTONOMO = 'FISIO_AUTONOMO',
  FISIO_COLABORADOR = 'FISIO_COLABORADOR'
}

export enum AppointmentStatus {
  AGENDADO = 'AGENDADO',
  CONFIRMADO = 'CONFIRMADO',
  REALIZADO = 'REALIZADO',
  CANCELADO = 'CANCELADO',
  PENDENTE = 'PENDENTE'
}

export enum PaymentMethod {
  PIX = 'PIX',
  DINHEIRO = 'DINHEIRO',
  CARTAO_CREDITO = 'CARTAO_CREDITO',
  CARTAO_DEBITO = 'CARTAO_DEBITO'
}

export enum TransactionStatus {
  PAGO = 'PAGO',
  PENDENTE = 'PENDENTE'
}

export enum GuideStatus {
  PENDENTE = 'PENDENTE',
  AUTORIZADA = 'AUTORIZADA',
  GLOSADA = 'GLOSADA',
  PAGA = 'PAGA'
}

export interface InsuranceProvider {
  id: string;
  name: string;
  ansCode: string;
  contact: string;
}

export interface MedicalGuide {
  id: string;
  insuranceId: string;
  patientId: string;
  guideNumber: string;
  sessionsTotal: number;
  sessionsUsed: number;
  status: GuideStatus;
  expiryDate: string;
}

export interface CID10 {
  code: string;
  description: string;
}

export interface ClinicalEvaluation {
  id: string;
  patientId: string;
  physioId: string;
  clinicId?: string;
  date: string;
  anamnese: {
    queixaPrincipal: string;
    hda: string;
    historicoFamiliar: string;
  };
  mapaDor: string[];
  escalas: {
    eva: number;
    adm?: {
      articulacao: string;
      graus: number;
    };
  };
}

export interface Patient {
  id: string;
  name: string; // Legacy
  full_name?: string; // Novo
  cpf: string;
  birthDate: string; // Legacy
  birth_date?: string; // Novo
  phone: string;
  email?: string;
  address: string;
  gender: 'Masculino' | 'Feminino' | 'Outro' | string;
  insurance: string;
  cid10?: string;
  cidCode?: string;
  cidDescription?: string;
  responsiblePhysioId: string;
  clinicId?: string;
  notes?: string; // Legacy map to initial_observations
  initial_observations?: string; // Novo
  fitzpatrick_scale?: string; // Novo
  allergies?: string; // Novo
  status: 'Ativo' | 'Inativo';
  createdAt: string;
  creditsRemaining: number;
}

export interface Service {
  id: string;
  name: string;
  duration: number;
  value: number;
  type: 'Individual' | 'Pacote' | 'Assinatura';
  clinicId?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  physioId: string;
  clinicId?: string;
  serviceId: string;
  date: string;
  time: string;
  duration: number;
  value: number;
  status: AppointmentStatus;
  tempGuestName?: string;
  tempGuestPhone?: string;
  tempGuestEmail?: string;
  serviceName?: string;
  paymentMethod?: string;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  clinicId?: string;
  avatar?: string;
  crefito?: string;
  document?: string;
}

export interface Transaction {
  id: string;
  description: string;
  patient?: string;
  date: string;
  method: string;
  value: number;
  type: string;
  status: string;
  notes?: string;
  created_at: string;
}

export interface PatientPackage {
  id: string;
  patient_id?: string;
  service_id?: string;
  status?: string;
  total_sessions?: number;
  used_sessions?: number;
  created_at?: string;
}

export interface ClinicalRecord {
  id: string;
  patient_id: string;
  data: string;
  profissional_id?: string;
  relatorio: string;
  tipo_atendimento?: string;
  created_at?: string;
}

export interface Lead {
  id: number;
  telefone: string;
  nome?: string;
  status: string;
  mensagem?: string;
  resposta?: string;
  motivo?: string;
  updated_at?: string;
}

export interface SlotDisponivel {
  id: string;
  date: string;
  time: string;
  disponivel?: boolean;
  created_at?: string;
}
export interface RolePermissions {
  inicio: boolean;
  home: boolean;
  crm: boolean;
  agenda: boolean;
  pacientes: boolean;
  servicos: boolean;
  relatorios: boolean;
  financeiro: boolean;
  admin: boolean;
}

export interface ClinicSettings {
  id?: string;
  clinic_name: string;
  logo_url?: string;
  primary_color?: string;
  permissions: {
    receptionist: RolePermissions;
    professional: RolePermissions;
  };
}

export const DEFAULT_RECEPTIONIST_PERMISSIONS: RolePermissions = {
  inicio: true,
  home: true,
  crm: true,
  agenda: true,
  pacientes: true,
  servicos: true,
  relatorios: false,
  financeiro: false,
  admin: false,
};

export const DEFAULT_PROFESSIONAL_PERMISSIONS: RolePermissions = {
  inicio: true,
  home: true,
  crm: false,
  agenda: true,
  pacientes: true,
  servicos: true,
  relatorios: false,
  financeiro: false,
  admin: false,
};

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  clinic_name: 'Carregando...',
  logo_url: undefined,
  primary_color: '#00a5b5',
  permissions: {
    receptionist: DEFAULT_RECEPTIONIST_PERMISSIONS,
    professional: DEFAULT_PROFESSIONAL_PERMISSIONS,
  },
};

