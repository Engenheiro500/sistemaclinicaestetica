
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Package,
  FileText,
  User as UserIcon,
  Smartphone,
  Clock,
  X,
  Check,
  Save,
  RotateCcw,
  Info,
  Plus,
  ChevronDown,
  CalendarDays,
  CircleDollarSign,
  Activity,
  FileSearch,
  ChevronRight,
  Download,
  MessageCircle,
  FileCheck,
  Hash,
  Stethoscope,
  Cake,
  VenetianMask,
  Pause,
  Printer,
  Share2,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { Patient, Appointment, AppointmentStatus, User, UserRole } from '../../types';
import { useServices } from '../../src/hooks/useServices';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useClinicSettings } from '../../src/hooks/useClinicSettings';
import { supabase } from '../../src/lib/supabase';

interface Subscription {
  id: string;
  serviceName: string;
  frequency: string;
  dueDay: string;
  startDate: string;
  value: number;
  status: 'Ativa' | 'Pausada' | 'Cancelada';
  paymentStatus: 'Pendente' | 'Pago';
  observations?: string;
}

interface FinancialHistory {
  id: string;
  description: string;
  date: string;
  method: string;
  value: number;
}

interface PatientPackage {
  id: string;
  service_id: string;
  serviceName?: string;
  status: string;
  total_sessions: number;
  used_sessions: number;
  created_at: string;
}

interface ClinicalRecord {
  id: string;
  patient_id: string;
  data: string;
  profissional_id: string | null;
  relatorio: string;
  tipo_atendimento: string | null;
  image_urls?: string[];
  created_at: string;
}

interface PatientDetailProps {
  patientId: string;
  onBack: () => void;
  patientData: Patient & { physioResponsible: string };
  appointments: Appointment[];
  user: User;
  onSave: (patient: Patient) => void;
  onDelete?: (id: string) => void;
}

export const PatientDetail: React.FC<PatientDetailProps> = ({
  patientId,
  onBack,
  patientData,
  appointments,
  user,
  onSave,
  onDelete
}) => {
  const [activeTab, setActiveTab] = useState('agendamentos');
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<FinancialHistory | null>(null);
  const [editableReceipt, setEditableReceipt] = useState({
     patientName: '',
     patientCpf: '',
     value: 0,
     description: '',
     date: '',
     city: 'Porto Alegre',
     profName: '',
     profCrefito: '',
     profDoc: ''
  });

  const { services } = useServices();

  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [selectedServiceForPackage, setSelectedServiceForPackage] = useState('');
  const [editingPackage, setEditingPackage] = useState<PatientPackage | null>(null);
  const [isEditPackageModalOpen, setIsEditPackageModalOpen] = useState(false);

  const [clinicalRecords, setClinicalRecords] = useState<ClinicalRecord[]>([]);
  const [isClinicalRecordModalOpen, setIsClinicalRecordModalOpen] = useState(false);
  const [newClinicalRecord, setNewClinicalRecord] = useState({
    relatorio: '',
    tipo_atendimento: ''
  });
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<ClinicalRecord | null>(null);

  const { settings } = useClinicSettings();

  const fetchPackages = async () => {
    const { data } = await supabase
      .from('patient_packages')
      .select('*, services(name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (data) {
      setPatientPackages(data.map(p => ({
        ...p,
        serviceName: p.services?.name || 'Pacote'
      })));
    }
  };

  const fetchClinicalRecords = async () => {
    const { data } = await supabase
      .from('clinical_records')
      .select('*')
      .eq('patient_id', patientId)
      .order('data', { ascending: false });

    if (data) {
      setClinicalRecords(data);
    }
  };

  useEffect(() => {
    fetchPackages();
    fetchClinicalRecords();
  }, [patientId]);

  // Local state to simulate subscription storage
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  // Integration securely brings the payment methods natively filtered
  const { transactions } = useTransactions({ patientId: patientId });

  // Calculate financial history based on REAL transactions
  const financialHistory: FinancialHistory[] = transactions
    .map(t => ({
      id: t.id,
      description: t.description || 'Atendimento Clínico',
      date: t.date,
      method: t.method || '-',
      value: t.value || 0
    }));

  const totalPaid = financialHistory.filter(t => t.method !== 'SISTEMA').reduce((acc, curr) => acc + curr.value, 0) || financialHistory.reduce((acc, curr) => acc + curr.value, 0);

  // New Subscription Form State
  const [newSub, setNewSub] = useState({
    serviceId: '',
    frequency: '2x por semana',
    dueDay: '10',
    startDate: new Date().toISOString().split('T')[0],
    observations: ''
  });

  // Edit Patient State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(patientData);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditModalOpen) {
      setEditForm(patientData);
    }
  }, [patientData, isEditModalOpen]);

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const updatePayload = {
        name: editForm.name,
        full_name: editForm.name,
        cpf: editForm.cpf,
        birthDate: editForm.birthDate,
        birth_date: editForm.birthDate,
        phone: editForm.phone,
        address: editForm.address,
        gender: editForm.gender,
        cid10: editForm.cid10,
        fitzpatrick_scale: editForm.fitzpatrick_scale,
        insurance: editForm.insurance,
        allergies: editForm.allergies,
        notes: editForm.notes,
        initial_observations: editForm.notes
      };
      console.log('Update Payload para Patient:', updatePayload);

      const { error } = await supabase
        .from('patients')
        .update(updatePayload)
        .eq('id', patientId);

      if (error) throw error;

      // Update appointments cache globally by updating the appointment's tempGuestName 
      await supabase
        .from('appointments')
        .update({
          tempGuestName: editForm.name,
          tempGuestPhone: editForm.phone
        })
        .eq('patientId', patientId);

      onSave(editForm); // Calls parent handler to update/refresh local state

      // Toast/Alert requested by user
      toast.success("Perfil e Agenda atualizados com sucesso");

      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error('Error in handleSaveEdit:', err);
      toast.error(`Erro ao atualizar o paciente: ${err.message || 'Tente novamente.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOfferPackage = async () => {
    if (!selectedServiceForPackage) return;
    try {
      const { error } = await supabase.from('patient_packages').insert([{
        patient_id: patientId,
        service_id: selectedServiceForPackage,
        total_sessions: 10,
        used_sessions: 0,
        status: 'Ativo'
      }]);

      if (error) throw error;
      toast.success("Pacote adicionado com sucesso");

      setIsPackageModalOpen(false);
      setSelectedServiceForPackage('');
      fetchPackages();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar pacote.");
    }
  };

  const handleDeletePackage = async (packageId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este pacote?')) return;
    try {
      const { error } = await supabase.from('patient_packages').delete().eq('id', packageId);
      if (error) throw error;
      toast.success('Pacote excluído com sucesso');
      fetchPackages();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir o pacote');
    }
  };

  const handleEditPackage = async () => {
    if (!editingPackage) return;
    try {
      const { error } = await supabase.from('patient_packages').update({
        used_sessions: editingPackage.used_sessions,
        status: editingPackage.status
      }).eq('id', editingPackage.id);

      if (error) throw error;
      toast.success('Pacote atualizado com sucesso');
      setIsEditPackageModalOpen(false);
      setEditingPackage(null);
      fetchPackages();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar o pacote');
    }
  };

  const handleSaveClinicalRecord = async () => {
    if (!newClinicalRecord.relatorio) return;
    setUploadingImages(true);
    try {
      let imageUrls: string[] = [];
      
      if (editingRecordId) {
        const oldRecord = clinicalRecords.find(r => r.id === editingRecordId);
        if (oldRecord && oldRecord.image_urls) {
          imageUrls = [...oldRecord.image_urls];
        }
      }

      for (const file of selectedImages) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${patientId}/${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('patient-records')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('patient-records')
          .getPublicUrl(fileName);

        if (publicUrlData) {
          imageUrls.push(publicUrlData.publicUrl);
        }
      }

      const payload = {
        patient_id: patientId,
        data: new Date().toISOString().split('T')[0],
        profissional_id: user.id || null,
        relatorio: newClinicalRecord.relatorio,
        tipo_atendimento: newClinicalRecord.tipo_atendimento || 'Avaliação/Evolução',
        image_urls: imageUrls
      };

      if (editingRecordId) {
        const { error } = await supabase.from('clinical_records').update(payload).eq('id', editingRecordId);
        if (error) throw error;
        toast.success('Prontuário atualizado com sucesso');
      } else {
        const { error } = await supabase.from('clinical_records').insert([payload]);
        if (error) throw error;
        toast.success('Prontuário salvo com sucesso');
      }

      setIsClinicalRecordModalOpen(false);
      setNewClinicalRecord({ relatorio: '', tipo_atendimento: '' });
      setSelectedImages([]);
      setEditingRecordId(null);
      fetchClinicalRecords();
    } catch (err: any) {
      console.error('Erro ao salvar prontuário:', err);
      toast.error(`Erro ao salvar prontuário: ${err.message || 'Desconhecido'}`);
    } finally {
      setUploadingImages(false);
    }
  };

  const handleDeleteClinicalRecord = async (record: ClinicalRecord) => {
    // Atualização otimista
    setClinicalRecords(prev => prev.filter(r => r.id !== record.id));
    setRecordToDelete(null);
    
    try {
      const { error } = await supabase.from('clinical_records').delete().eq('id', record.id);
      if (error) throw error;
      toast.success('Prontuário removido com sucesso');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao remover prontuário no banco. Dados podem estar dessincronizados.');
      // Refetch caso de erro para manter integridade visual
      fetchClinicalRecords();
    }
  };

  const handleGeneratePDF = (record: ClinicalRecord) => {
    import('jspdf').then(({ default: jsPDF }) => {
      // Using workaround because sometimes jsPDF export is funky and needs checking
      const DocClass = typeof jsPDF === 'function' ? jsPDF : (jsPDF as any).jsPDF;
      const doc = new (DocClass as any)();

      doc.setFontSize(20);
      doc.setTextColor(0, 165, 181);
      doc.text('Prontuario Clinico', 105, 20, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('Documento Digital Profissional', 105, 26, { align: 'center' });

      doc.setDrawColor(200);
      doc.line(20, 32, 190, 32);

      doc.setFontSize(12);
      doc.setTextColor(50);
      doc.text(`Paciente: ${patientData.name}`, 20, 42);
      doc.text(`CPF: ${patientData.cpf || 'Nao informado'}`, 20, 48);
      doc.text(`Data de Nascimento: ${formatDateDisplay(patientData.birthDate) || 'Nao informado'}`, 20, 54);
      doc.text(`Data do Atendimento: ${formatDateDisplay(record.data)}`, 20, 60);
      doc.text(`Tipo: ${record.tipo_atendimento || 'Nao informado'}`, 20, 66);

      doc.line(20, 72, 190, 72);

      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text('Evolucao / Relato Clinico', 20, 84);

      doc.setFontSize(11);
      doc.setTextColor(80);
      const splitText = doc.splitTextToSize(record.relatorio, 170);
      doc.text(splitText, 20, 94);

      // Assinatura na parte inferior
      const pageHeight = doc.internal.pageSize.height;
      doc.line(65, pageHeight - 40, 145, pageHeight - 40);
      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.text(user.name || 'Dr(a).', 105, pageHeight - 34, { align: 'center' });
      doc.text(`CREFITO: ${user.crefito || 'CRM/CREFITO Nao informado'}`, 105, pageHeight - 29, { align: 'center' });

      doc.save(`Prontuario_${patientData.name.replace(/\\s+/g, '_')}_${record.data}.pdf`);
    }).catch(err => {
      console.error(err);
      toast.error("Erro ao gerar PDF.");
    });
  };

  const calculateAge = (birthDateStr: string | undefined) => {
    if (!birthDateStr) return '0';
    // Garantir formato de data válido se vier do supabase a parte da hora (ISO)
    const dateOnly = birthDateStr.split('T')[0];
    const today = new Date();
    const birth = new Date(dateOnly);
    // Para corrigir problemas de fuso que podem alterar o dia
    const birthYear = birth.getUTCFullYear();
    const birthMonth = birth.getUTCMonth();
    const birthDay = birth.getUTCDate();

    let age = today.getFullYear() - birthYear;
    const m = today.getMonth() - birthMonth;
    if (m < 0 || (m === 0 && today.getDate() < birthDay)) {
      age--;
    }

    if (isNaN(age)) return '0';
    return age.toString();
  };

  const handleCreateSubscription = () => {
    const service = services.find(s => s.id === newSub.serviceId);
    if (!service) return;

    const subscription: Subscription = {
      id: Math.random().toString(36).substr(2, 9),
      serviceName: service.name,
      frequency: newSub.frequency,
      dueDay: newSub.dueDay,
      startDate: newSub.startDate,
      value: service.value * 2.2, // Simulated monthly value
      status: 'Ativa',
      paymentStatus: 'Pendente',
      observations: newSub.observations
    };

    setSubscriptions([...subscriptions, subscription]);
    setIsSubscriptionModalOpen(false);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year.substring(2)}`;
  };

  const formatCPF = (val: string) => {
    let v = val.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return v;
  };

  const formatPhone = (val: string) => {
    let v = val.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
    v = v.replace(/(\d)(\d{4})$/, '$1-$2');
    return v;
  };

  const handleOpenReceipt = (record: FinancialHistory) => {
    setSelectedReceipt(record);
    setEditableReceipt({
      patientName: patientData.name,
      patientCpf: patientData.cpf || '',
      value: record.value,
      description: `1 sessão(ões) de ${record.description}`,
      date: record.date,
      city: 'Porto Alegre',
      profName: user.name || '',
      profCrefito: user.crefito || '123456-F',
      profDoc: user.document || '045.123.456-88'
    });
    setIsReceiptModalOpen(true);
  };

  const handleGenerateReceiptPDF = () => {
    import('jspdf').then(({ default: jsPDF }) => {
      const DocClass = typeof jsPDF === 'function' ? jsPDF : (jsPDF as any).jsPDF;
      const doc = new (DocClass as any)();
      const primaryColor = settings.primary_color || '#00a5b5';
      
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : { r: 0, g: 165, b: 181 };
      };
      const rgb = hexToRgb(primaryColor);

      if (settings.logo_url) {
        try {
          doc.addImage(settings.logo_url, 'PNG', 20, 15, 30, 30);
        } catch(e) { console.warn("Logo error", e); }
      } else {
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(20, 15, 30, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text('LOGO', 35, 30, { align: 'center' });
      }

      doc.setFontSize(22);
      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text('Recibo de Pagamento', 60, 25);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('DOCUMENTO DIGITAL PROFISSIONAL', 60, 32);
      
      doc.setFontSize(12);
      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text(`Nº ${Math.floor(Math.random()*10000)}/${new Date().getFullYear()}`, 190, 25, { align: 'right' });

      doc.setDrawColor(200);
      doc.line(20, 50, 190, 50);

      doc.setFontSize(12);
      doc.setTextColor(60);
      
      const text = `Recebi de ${editableReceipt.patientName?.toUpperCase()}, portador do CPF ${editableReceipt.patientCpf}, a importância de R$ ${Number(editableReceipt.value).toFixed(2)}, referente a ${editableReceipt.description?.toUpperCase()}.`;
      const splitText = doc.splitTextToSize(text, 170);
      doc.text(splitText, 20, 70);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('DATA DE EMISSÃO', 20, 110);
      doc.setFontSize(12);
      doc.setTextColor(60);
      doc.text(`${editableReceipt.city}, ${formatDateDisplay(editableReceipt.date)}`, 20, 118);

      doc.setDrawColor(150);
      doc.line(65, 150, 145, 150);
      doc.setFontSize(12);
      doc.setTextColor(50);
      doc.text(editableReceipt.profName?.toUpperCase() || 'ASSINATURA', 105, 158, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`CREFITO: ${editableReceipt.profCrefito}  |  DOC: ${editableReceipt.profDoc}`, 105, 164, { align: 'center' });

      doc.setDrawColor(rgb.r, rgb.g, rgb.b);
      doc.setLineWidth(2);
      doc.line(20, 280, 190, 280);

      doc.save(`Recibo_${editableReceipt.patientName?.replace(/\s+/g, '_')}_${editableReceipt.date}.pdf`);
    }).catch(err => {
      console.error(err);
      toast.error("Erro ao gerar PDF.");
    });
  };

  const InfoCard = ({ icon, label, value, subValue, color }: { icon: any, label: string, value: string, subValue?: string, color: string }) => (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 animate-in fade-in duration-500">
      <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-black text-gray-800 truncate">{value}</p>
        {subValue && <p className="text-[9px] font-medium text-gray-400 truncate">{subValue}</p>}
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-left pb-20">
      {/* Header Navigation */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
            <ArrowLeft size={22} />
          </button>
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Perfil do Paciente</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-cyan-50 text-[var(--primary-color)] hover:bg-cyan-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            <Edit size={16} /> Editar Informações
          </button>
          <button onClick={onBack} className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-100 text-gray-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
            Voltar
          </button>
        </div>
      </div>

      {/* GRID DE INFORMAÇÕES */}
      <div className="space-y-6 mb-8">
        <div className="bg-white rounded-[24px] border border-gray-100 p-6 flex flex-col md:flex-row items-center gap-8 shadow-sm">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center font-bold text-2xl text-gray-300 shrink-0 border border-gray-100 shadow-inner">
            {patientData.name.charAt(0).toLowerCase()}
          </div>
          <div className="flex-1 space-y-4 w-full text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center gap-3">
              <h3 className="text-2xl font-black text-gray-800 tracking-tight">{patientData.name}</h3>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-500 border border-emerald-100 flex items-center gap-1.5">
                <Check size={12} strokeWidth={3} /> Em dia
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-12 gap-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-500 font-bold">
                <Phone size={18} className="text-gray-300" />
                <span>{patientData.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 font-bold">
                <MapPin size={18} className="text-gray-300" />
                <span>{patientData.address}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard icon={<Hash size={18} />} label="CPF" value={patientData.cpf || 'Não informado'} color="bg-gray-50 text-gray-400" />
          <InfoCard icon={<Cake size={18} />} label="Nascimento" value={patientData.birthDate ? `${formatDateDisplay(patientData.birthDate)} (${calculateAge(patientData.birthDate)}a)` : 'Não Informado'} color="bg-rose-50 text-rose-400" />
          <InfoCard icon={<VenetianMask size={18} />} label="Alergias" value={patientData.allergies && patientData.allergies !== 'Nenhuma' ? patientData.allergies : "Nenhuma relatada"} color="bg-emerald-50 text-emerald-400" />
          <InfoCard icon={<FileSearch size={18} />} label="Fototipo" value={patientData.fitzpatrick_scale || 'Não informado'} color="bg-amber-50 text-amber-400" />
          <InfoCard icon={<Stethoscope size={18} />} label="Profissional" value={patientData.physioResponsible} color="bg-blue-50 text-blue-400" />
          <InfoCard icon={<CalendarDays size={18} />} label="Cadastro" value={formatDateDisplay(patientData.createdAt)} color="bg-purple-50 text-purple-400" />
          <InfoCard icon={<UserIcon size={18} />} label="Sexo" value={patientData.gender || 'Não Informado'} color="bg-orange-50 text-orange-400" />
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4">
          <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center shrink-0">
            <FileText size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Observações</p>
            <p className="text-sm font-medium text-gray-600 mt-1">{patientData.notes || patientData.initial_observations || 'Nenhuma observação registrada.'}</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-white/50 p-1.5 rounded-[20px] border border-gray-100 mb-6 w-fit gap-1 shadow-sm overflow-hidden scrollbar-hide">
        {[
          { id: 'agendamentos', label: 'Agendamentos', icon: <Calendar size={16} /> },
          { id: 'prontuario', label: 'Prontuário Técnico', icon: <FileSearch size={16} /> },
          { id: 'pacotes', label: 'Pacotes', icon: <Package size={16} /> },
          { id: 'assinaturas', label: 'Assinaturas', icon: <RotateCcw size={16} /> },
          { id: 'financeiro', label: 'Financeiro', icon: <CreditCard size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-2 rounded-[16px] font-bold text-[11px] uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-gray-800 shadow-md' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50/50'}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
        {activeTab === 'financeiro' ? (
          <div className="p-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-10">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fluxo Financeiro do Paciente</h4>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Pago</p>
                <p className="text-sm font-black text-[#10b981]">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-gray-50">
                    <th className="pb-4">Descrição</th>
                    <th className="pb-4">Data</th>
                    <th className="pb-4">Método</th>
                    <th className="pb-4">Valor</th>
                    <th className="pb-4 text-center">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {financialHistory.map((item) => (
                    <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                      <td className="py-6 pr-4">
                        <span className="text-sm font-black text-slate-700">{item.description}</span>
                      </td>
                      <td className="py-6 px-4">
                        <div className="flex items-center gap-2">
                          <CalendarDays size={14} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-600">{formatDateDisplay(item.date)}</span>
                        </div>
                      </td>
                      <td className="py-6 px-4">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black tracking-wider uppercase">
                          {item.method}
                        </span>
                      </td>
                      <td className="py-6 px-4">
                        <span className="text-base font-black text-[#10b981]">
                          R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-6 text-center">
                        <button
                          onClick={() => handleOpenReceipt(item)}
                          className="p-2 text-slate-300 hover:text-[var(--primary-color)] hover:bg-cyan-50 rounded-xl transition-all"
                        >
                          <FileText size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'assinaturas' ? (
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Gestão de Mensalidades</h4>
              <button
                onClick={() => setIsSubscriptionModalOpen(true)}
                className="flex items-center gap-2 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-cyan-100 active:scale-95"
              >
                <Plus size={16} strokeWidth={3} /> Nova Assinatura
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Info size={48} className="text-gray-200 mb-8" />
                <p className="text-gray-400 font-medium leading-relaxed">Não existem assinaturas ativas para este paciente.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {subscriptions.map(sub => (
                  <div key={sub.id} className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm space-y-6 relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-2xl font-black text-slate-800 tracking-tight">{sub.serviceName}</h4>
                        <p className="text-xs font-bold text-slate-400">{sub.frequency}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="bg-emerald-50 text-emerald-500 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100">Ativa</span>
                        <span className="bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-100">Pgto: {sub.paymentStatus}</span>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        <span>Créditos da Semana</span>
                        <span>2/2</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="w-full h-full bg-rose-300 rounded-full" />
                      </div>
                    </div>
                    <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CreditCard size={18} className="text-amber-500" />
                        <span className="text-xs font-bold text-slate-700">Mensalidade de fev/2026</span>
                      </div>
                      <span className="text-sm font-black text-slate-800">R$ {sub.value.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-2">
                      <div className="flex items-center gap-3"><CircleDollarSign size={18} className="text-amber-400" /><span className="text-xs font-bold text-gray-600">R$ {sub.value.toFixed(2)}/mês</span></div>
                      <div className="flex items-center gap-3"><Calendar size={18} className="text-gray-300" /><span className="text-xs font-bold text-gray-600">Venc. dia {sub.dueDay}</span></div>
                      <div className="flex items-center gap-3"><RotateCcw size={18} className="text-gray-300" /><span className="text-xs font-bold text-gray-600">Início: {formatDateDisplay(sub.startDate)}</span></div>
                    </div>
                    <div className="pt-6 border-t border-gray-50 space-y-3">
                      <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
                        <CreditCard size={18} /> Pagar Mensalidade
                      </button>
                      <div className="grid grid-cols-2 gap-3">
                        <button className="flex items-center justify-center gap-2 bg-white border border-gray-100 py-3 rounded-xl text-[11px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"><Pause size={16} className="text-gray-300" /> Pausar</button>
                        <button className="flex items-center justify-center gap-2 bg-rose-50 border border-rose-100 py-3 rounded-xl text-[11px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-100 transition-all"><X size={16} /> Cancelar</button>
                        <button className="flex items-center justify-center gap-2 bg-white border border-gray-100 py-3 rounded-xl text-[11px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"><Edit size={16} className="text-gray-300" /> Editar</button>
                        <button className="flex items-center justify-center gap-2 bg-white border border-gray-100 py-3 rounded-xl text-[11px] font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"><Trash2 size={16} className="text-gray-300" /> Excluir</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'pacotes' ? (
          <div className="p-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pacotes de Serviços</h4>
              <button
                onClick={() => setIsPackageModalOpen(true)}
                className="flex items-center gap-2 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-cyan-100 active:scale-95"
              >
                <Plus size={16} strokeWidth={3} /> Ofertar Pacote
              </button>
            </div>

            {patientPackages.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Package size={48} className="text-gray-200 mb-8" />
                <p className="text-gray-400 font-medium leading-relaxed">Não existem pacotes ativos para este paciente.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {patientPackages.map(pkg => (
                  <div key={pkg.id} className="relative bg-white border border-gray-100 p-5 rounded-2xl shadow-sm flex flex-col gap-3 group hover:border-[var(--primary-color)] transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-slate-800 pr-20">{pkg.serviceName}</span>
                      <div className="flex items-center gap-2 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingPackage(pkg); setIsEditPackageModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-[var(--primary-color)] bg-gray-50 hover:bg-cyan-50 rounded-lg transition-colors"><Edit size={14} /></button>
                        <button onClick={() => handleDeletePackage(pkg.id)} className="p-1.5 text-gray-400 hover:text-rose-500 bg-gray-50 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest rounded-lg ${pkg.status.toLowerCase() === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'}`}>
                        {pkg.status}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-500">
                      Sessões: <span className="text-cyan-600">{pkg.used_sessions}</span> / {pkg.total_sessions}
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${(pkg.used_sessions / pkg.total_sessions) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'agendamentos' ? (
          <div className="p-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Agendamentos (Próximos e Histórico)</h4>
            </div>
            {appointments.filter(a => a.patientId === patientId).length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Calendar size={48} className="text-gray-200 mb-8" />
                <p className="text-gray-400 font-medium leading-relaxed">Nenhum agendamento encontrado.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {['Próximos', 'Histórico'].map(section => {
                  const now = new Date();
                  const filteredApts = appointments.filter(a => a.patientId === patientId).filter(a => {
                    const dt = new Date(`${a.date}T${a.time}`);
                    return section === 'Próximos' ? dt >= now : dt < now;
                  }).sort((a, b) => {
                    const da = new Date(`${a.date}T${a.time}`).getTime();
                    const db = new Date(`${b.date}T${b.time}`).getTime();
                    return section === 'Próximos' ? da - db : db - da;
                  });

                  if (filteredApts.length === 0) return null;

                  return (
                    <div key={section}>
                      <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">{section}</h3>
                      <div className="space-y-3">
                        {filteredApts.map(apt => (
                          <div key={apt.id} className="flex flex-wrap items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm">
                            <div>
                              <p className="text-sm font-black text-slate-800">{apt.serviceName || 'Serviço'}</p>
                              <p className="text-xs font-bold text-slate-500 flex items-center gap-1 mt-1">
                                <Clock size={12} /> {formatDateDisplay(apt.date)} às {apt.time}
                              </p>
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${apt.status === 'REALIZADO' || apt.status === 'CONFIRMADO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              apt.status === 'CANCELADO' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                              }`}>
                              {apt.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'prontuario' ? (
          <div className="p-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Prontuário Técnico e Evolução</h4>
              <button
                onClick={() => {
                  setEditingRecordId(null);
                  setNewClinicalRecord({ relatorio: '', tipo_atendimento: '' });
                  setSelectedImages([]);
                  setIsClinicalRecordModalOpen(true);
                }}
                className="flex items-center gap-2 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-cyan-100 active:scale-95"
              >
                <Plus size={16} strokeWidth={3} /> Nova Evolução/Relatório
              </button>
            </div>

            {clinicalRecords.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <FileSearch size={48} className="text-gray-200 mb-8" />
                <p className="text-gray-400 font-medium leading-relaxed">Não existem evoluções ou relatórios registrados.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {clinicalRecords.map(record => (
                  <div key={record.id} className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between border-b border-gray-50 pb-4 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cyan-50 text-[var(--primary-color)] rounded-xl flex items-center justify-center">
                          <FileText size={18} />
                        </div>
                        <div>
                          <h5 className="text-sm font-black text-slate-800">{record.tipo_atendimento}</h5>
                          <span className="text-xs font-bold text-slate-400">{formatDateDisplay(record.data)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingRecordId(record.id);
                            setNewClinicalRecord({ relatorio: record.relatorio, tipo_atendimento: record.tipo_atendimento || '' });
                            setSelectedImages([]);
                            setIsClinicalRecordModalOpen(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-cyan-50 border border-gray-100 text-[var(--primary-color)] rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                        >
                          <Edit size={14} /> Editar
                        </button>
                        <button
                          onClick={() => setRecordToDelete(record)}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-rose-50 border border-gray-100 text-rose-500 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                        >
                          <Trash2 size={14} /> Remover
                        </button>
                        <button
                          onClick={() => handleGeneratePDF(record)}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 border border-gray-100 text-gray-600 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                        >
                          <Download size={14} /> Gerar PDF
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{record.relatorio}</p>
                      {record.image_urls && record.image_urls.length > 0 && (
                        <div className="mt-4 flex gap-2 flex-wrap">
                          {record.image_urls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-24 h-24 rounded-lg overflow-hidden border border-gray-200 hover:opacity-80 transition-opacity">
                              <img src={url} alt={`Anexo ${i+1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-28 flex flex-col items-center justify-center text-center">
            <Info size={48} className="text-gray-200 mb-8" />
            <p className="text-gray-400 font-medium leading-relaxed">Não existem dados registrados para esta aba.</p>
          </div>
        )}
      </div>

      {/* MODAL RECIBO DE PAGAMENTO */}
      {isReceiptModalOpen && selectedReceipt && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-[500px] animate-in zoom-in-95 duration-300 text-left">
            <div className="bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-cyan-50 text-[var(--primary-color)] rounded-2xl"><FileText size={24} /></div>
                  <div>
                    <h3 className="font-black text-slate-800 text-lg tracking-tight">Recibo de Pagamento</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">DOCUMENTO DIGITAL PROFISSIONAL</p>
                  </div>
                </div>
                <button onClick={() => setIsReceiptModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><X size={24} /></button>
              </div>

              <div className="p-8 bg-gray-50/30">
                <div className="bg-white rounded-[24px] border border-slate-100 p-10 shadow-sm space-y-12 relative overflow-hidden">
                  <div className="absolute top-10 left-10 opacity-10">
                    {settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="w-16 h-16 grayscale" /> : <img src="https://placehold.co/400x400/00a5b5/ffffff.png?text=Logo" alt="Logo" className="w-16 h-16 grayscale" />}
                  </div>
                  <div className="flex justify-between items-start">
                    <div className="bg-[var(--primary-color)] w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
                      {settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="w-full h-full object-cover" /> : <img src="https://placehold.co/400x400/00a5b5/ffffff.png?text=Logo" alt="Logo" className="w-full h-full object-cover" />}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">RECIBO Nº</p>
                      <p className="text-sm font-black text-cyan-600">{Math.floor(Math.random()*10000)}/{new Date().getFullYear()}</p>
                    </div>
                  </div>
                  <p className="text-gray-600 text-base leading-relaxed font-medium">
                    Recebi de <input className="font-black text-slate-800 uppercase tracking-tight bg-transparent border-b border-dashed border-gray-300 min-w-[200px] text-center outline-none focus:border-cyan-500 transition-colors" value={editableReceipt.patientName} onChange={e=>setEditableReceipt({...editableReceipt, patientName: e.target.value})} />, portador do CPF <input className="font-black text-slate-800 bg-transparent border-b border-dashed border-gray-300 w-32 text-center outline-none focus:border-cyan-500 transition-colors" value={editableReceipt.patientCpf} onChange={e=>setEditableReceipt({...editableReceipt, patientCpf: e.target.value})} />, a importância de R$ <input type="number" className="font-black text-cyan-600 bg-transparent border-b border-dashed border-cyan-200 w-24 text-center outline-none focus:border-cyan-500 transition-colors" value={editableReceipt.value} onChange={e=>setEditableReceipt({...editableReceipt, value: Number(e.target.value)})} />, referente a <input className="font-black text-slate-800 uppercase bg-transparent border-b border-dashed border-gray-300 min-w-[250px] text-center outline-none focus:border-cyan-500 transition-colors" value={editableReceipt.description} onChange={e=>setEditableReceipt({...editableReceipt, description: e.target.value})} />.
                  </p>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DATA DE EMISSÃO</p>
                    <p className="text-sm font-bold text-slate-600">
                      <input className="bg-transparent border-b border-dashed border-gray-300 w-32 outline-none focus:border-cyan-500 transition-colors" value={editableReceipt.city} onChange={e=>setEditableReceipt({...editableReceipt, city: e.target.value})} />, 
                      <input type="date" className="bg-transparent border-b border-dashed border-gray-300 outline-none focus:border-cyan-500 transition-colors ml-1" value={editableReceipt.date} onChange={e=>setEditableReceipt({...editableReceipt, date: e.target.value})} />
                    </p>
                  </div>
                  <div className="pt-12 text-center space-y-4">
                    <div className="w-64 h-px bg-slate-200 mx-auto" />
                    <div className="space-y-1">
                      <input className="text-sm font-black text-slate-800 uppercase bg-transparent text-center border-b border-dashed border-gray-300 outline-none w-64 focus:border-cyan-500 transition-colors" value={editableReceipt.profName} onChange={e=>setEditableReceipt({...editableReceipt, profName: e.target.value})} />
                      <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                        <span>CREFITO: <input className="bg-transparent text-center border-b border-dashed border-gray-300 w-24 outline-none focus:border-cyan-500 transition-colors" value={editableReceipt.profCrefito} onChange={e=>setEditableReceipt({...editableReceipt, profCrefito: e.target.value})} /></span>
                        <div className="w-1 h-1 bg-slate-200 rounded-full" />
                        <span>DOC: <input className="bg-transparent text-center border-b border-dashed border-gray-300 w-32 outline-none focus:border-cyan-500 transition-colors" value={editableReceipt.profDoc} onChange={e=>setEditableReceipt({...editableReceipt, profDoc: e.target.value})} /></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 flex items-center gap-4 bg-white">
                <button onClick={() => alert('Integração com WhatsApp não testada aqui!')} className="flex-1 bg-[#10b981] hover:bg-[#059669] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 active:scale-95"><MessageCircle size={18} /> ENVIAR P/ WHATSAPP</button>
                <button onClick={handleGenerateReceiptPDF} className="flex-1 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-cyan-100 flex items-center justify-center gap-2 active:scale-95"><Download size={18} /> BAIXAR PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA ASSINATURA (Restauração da Interatividade) */}
      {isSubscriptionModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[440px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <h3 className="font-bold text-gray-800 text-lg">Nova Assinatura</h3>
              <button onClick={() => setIsSubscriptionModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-all"><X size={20} /></button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paciente</label>
                <div className="w-full px-5 py-4 bg-gray-50 rounded-2xl text-sm font-black text-gray-800 border border-gray-100">{patientData.name.toLowerCase()}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Serviço *</label>
                <div className="relative">
                  <select
                    value={newSub.serviceId}
                    onChange={(e) => setNewSub({ ...newSub, serviceId: e.target.value })}
                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 outline-none appearance-none focus:border-[var(--primary-color)] transition-all"
                  >
                    <option value="">Selecione o serviço</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Dia de Vencimento *</label>
                  <select
                    value={newSub.dueDay}
                    onChange={(e) => setNewSub({ ...newSub, dueDay: e.target.value })}
                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 focus:border-[var(--primary-color)] outline-none"
                  >
                    <option value="05">05</option><option value="10">10</option><option value="15">15</option><option value="20">20</option><option value="25">25</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data de Início *</label>
                  <input
                    type="date"
                    value={newSub.startDate}
                    onChange={(e) => setNewSub({ ...newSub, startDate: e.target.value })}
                    className="w-full px-5 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 outline-none focus:border-[var(--primary-color)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Observações</label>
                <textarea
                  value={newSub.observations}
                  onChange={(e) => setNewSub({ ...newSub, observations: e.target.value })}
                  className="w-full p-5 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 min-h-[100px] resize-none focus:border-[var(--primary-color)] outline-none"
                  placeholder="Observações adicionais..."
                />
              </div>
            </div>

            <div className="p-6 flex items-center justify-end gap-3 bg-white border-t border-gray-50">
              <button onClick={() => setIsSubscriptionModalOpen(false)} className="px-6 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all">Cancelar</button>
              <button onClick={handleCreateSubscription} disabled={!newSub.serviceId} className="flex-1 bg-[var(--primary-color)] hover:bg-[#008c9a] text-white py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 disabled:opacity-50">Criar Assinatura</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR PACIENTE */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <form onSubmit={handleSaveEdit} className="bg-white w-full max-w-[800px] max-h-[90vh] rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-8 flex items-center justify-between bg-white border-b border-gray-50">
              <div className="flex items-center gap-4 text-left">
                <div className="p-3 bg-cyan-50 text-[var(--primary-color)] rounded-2xl">
                  <Edit size={24} strokeWidth={3} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-2xl tracking-tight">Editar Paciente</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Atualização Cadastral</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="p-3 text-slate-400 hover:bg-slate-50 rounded-2xl transition-all"><X size={24} /></button>
            </div>

            <div className="p-10 space-y-10 overflow-y-auto text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Nome e CPF */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo *</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none"
                        placeholder="Ex: João da Silva"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">CPF *</label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <input
                        type="text"
                        value={editForm.cpf}
                        onChange={(e) => setEditForm(prev => ({ ...prev, cpf: formatCPF(e.target.value) }))}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none"
                        placeholder="000.000.000-00"
                      />
                    </div>
                  </div>
                </div>

                {/* Nascimento e Telefone */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Data de Nascimento *</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <input
                        type="date"
                        value={editForm.birthDate}
                        onChange={(e) => setEditForm(prev => ({ ...prev, birthDate: e.target.value }))}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Telefone *</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <input
                        type="text"
                        value={editForm.phone}
                        onChange={(e) => setEditForm(prev => ({ ...prev, phone: formatPhone(e.target.value) }))}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Endereço Completo</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none"
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Sexo e Alergias */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Gênero *</label>
                    <select
                      value={editForm.gender || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 outline-none appearance-none"
                    >
                      <option value="">Selecione...</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Alergias</label>
                    <select
                      value={editForm.allergies || 'Nenhuma'}
                      onChange={(e) => setEditForm(prev => ({ ...prev, allergies: e.target.value }))}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 outline-none appearance-none"
                    >
                      <option>Nenhuma</option><option>Cosméticos</option><option>Medicamentos</option><option>Látex / Borracha</option><option>Outras</option>
                    </select>
                  </div>
                </div>

                {/* Fototipo */}
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Fototipo (Fitzpatrick)</label>
                  <div className="relative">
                    <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <select
                      value={editForm.fitzpatrick_scale || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, fitzpatrick_scale: e.target.value }))}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold text-gray-700 focus:ring-4 focus:ring-cyan-500/5 outline-none appearance-none"
                    >
                      <option value="">Selecione o fototipo...</option>
                      <option value="I - Branca (Sempre queima)">I - Pele muito clara (Sempre queima)</option>
                      <option value="II - Branca (Queima fácil)">II - Pele clara (Queima fácil)</option>
                      <option value="III - Morena clara">III - Morena clara (Queima moderadamente)</option>
                      <option value="IV - Morena moderada">IV - Morena moderada (Queima pouco)</option>
                      <option value="V - Morena escura">V - Morena escura (Raramente queima)</option>
                      <option value="VI - Negra">VI - Negra (Nunca queima)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Observações Iniciais</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-6 bg-gray-50 border-none rounded-[32px] text-sm font-medium text-gray-700 focus:ring-4 focus:ring-cyan-500/5 focus:bg-white outline-none min-h-[120px] resize-none"
                  placeholder="Relatos do paciente, encaminhamentos ou cuidados especiais..."
                />
              </div>
            </div>

            <div className="p-8 bg-white border-t border-gray-50 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-8 py-4 text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-[0.2em]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!editForm.name || !editForm.phone || isSaving}
                className="flex-1 max-w-[280px] bg-[var(--primary-color)] hover:bg-[#008c9a] disabled:bg-gray-200 disabled:text-gray-400 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-cyan-100 transition-all active:scale-95"
              >
                {isSaving ? 'Carregando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}
      {
        isPackageModalOpen && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[400px] rounded-[32px] shadow-2xl overflow-hidden text-left p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-gray-800 text-lg">Ofertar Pacote</h3>
                <button onClick={() => setIsPackageModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="space-y-4 mb-6">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Serviço/Procedimento</label>
                <select
                  value={selectedServiceForPackage}
                  onChange={(e) => setSelectedServiceForPackage(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-cyan-500/20"
                >
                  <option value="">Selecione...</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} - R$ {s.value}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setIsPackageModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 bg-gray-50 rounded-xl hover:bg-gray-100">Cancelar</button>
                <button
                  onClick={handleOfferPackage}
                  disabled={!selectedServiceForPackage}
                  className="flex-1 py-3 text-sm font-black text-white bg-[var(--primary-color)] hover:bg-[#008c9a] rounded-xl shadow-lg shadow-cyan-100 disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        isEditPackageModalOpen && editingPackage && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[400px] rounded-[32px] shadow-2xl overflow-hidden text-left flex flex-col">
              <div className="p-6 flex items-center justify-between border-b border-gray-50">
                <h3 className="font-bold text-gray-800 text-lg">Editar Pacote</h3>
                <button onClick={() => { setIsEditPackageModalOpen(false); setEditingPackage(null); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sessões Utilizadas</label>
                  <input
                    type="number"
                    value={editingPackage.used_sessions}
                    onChange={(e) => setEditingPackage({ ...editingPackage, used_sessions: parseInt(e.target.value) || 0 })}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-cyan-500/20 outline-none"
                    min="0"
                    max={editingPackage.total_sessions}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</label>
                  <select
                    value={editingPackage.status}
                    onChange={(e) => setEditingPackage({ ...editingPackage, status: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-cyan-500/20 outline-none"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Finalizado">Finalizado</option>
                    <option value="Pausado">Pausado</option>
                  </select>
                </div>
              </div>
              <div className="p-6 border-t border-gray-50 flex gap-3">
                <button onClick={() => { setIsEditPackageModalOpen(false); setEditingPackage(null); }} className="flex-1 py-3 text-sm font-bold text-slate-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">Cancelar</button>
                <button
                  onClick={handleEditPackage}
                  className="flex-1 py-3 text-sm font-black text-white bg-[var(--primary-color)] hover:bg-[#008c9a] rounded-xl shadow-lg shadow-cyan-100 transition-all"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        isClinicalRecordModalOpen && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[600px] rounded-[32px] shadow-2xl overflow-hidden text-left flex flex-col">
              <div className="p-6 flex items-center justify-between border-b border-gray-50">
                <h3 className="font-bold text-gray-800 text-lg">Nova Evolução/Relatório</h3>
                <button onClick={() => setIsClinicalRecordModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo de Atendimento</label>
                  <input
                    type="text"
                    value={newClinicalRecord.tipo_atendimento}
                    onChange={(e) => setNewClinicalRecord({ ...newClinicalRecord, tipo_atendimento: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-cyan-500/20 outline-none"
                    placeholder="Ex: Avaliação Inicial, Sessão 1, Liberação, etc."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Relato Clínico (Prontuário)</label>
                  <textarea
                    value={newClinicalRecord.relatorio}
                    onChange={(e) => setNewClinicalRecord({ ...newClinicalRecord, relatorio: e.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-cyan-500/20 outline-none min-h-[160px] resize-none"
                    placeholder="Descreva a evolução do paciente, técnicas utilizadas, resposta ao tratamento..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Anexar Imagens</label>
                  <label className="flex items-center gap-2 px-5 py-4 bg-gray-50 border border-gray-100 border-dashed rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <Upload size={18} className="text-gray-400" />
                    <span className="text-sm font-bold text-gray-500">Selecionar arquivos...</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => setSelectedImages(Array.from(e.target.files || []))} />
                  </label>
                  {selectedImages.length > 0 && (
                    <p className="text-xs font-bold text-slate-500 mt-2">{selectedImages.length} novo(s) arquivo(s) selecionado(s)</p>
                  )}
                  {editingRecordId && clinicalRecords.find(r => r.id === editingRecordId)?.image_urls && (
                     <p className="text-xs font-bold text-slate-400 mt-1">Já possui {(clinicalRecords.find(r => r.id === editingRecordId)?.image_urls || []).length} anexo(s) salvos.</p>
                  )}
                </div>
              </div>
              <div className="p-6 border-t border-gray-50 flex gap-3">
                <button onClick={() => setIsClinicalRecordModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">Cancelar</button>
                <button
                  onClick={handleSaveClinicalRecord}
                  disabled={!newClinicalRecord.relatorio || uploadingImages}
                  className="flex-1 py-3 text-sm font-black text-white bg-[var(--primary-color)] hover:bg-[#008c9a] rounded-xl shadow-lg shadow-cyan-100 transition-all disabled:opacity-50"
                >
                  {uploadingImages ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        recordToDelete && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[400px] rounded-[32px] shadow-2xl overflow-hidden text-center flex flex-col p-8">
              <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="font-black text-slate-800 text-xl tracking-tight mb-2">Remover Prontuário</h3>
              <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">Você tem certeza que deseja remover este registro?<br/>Esta ação não poderá ser desfeita.</p>
              
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setRecordToDelete(null)} 
                  className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-500 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"
                >
                  Não, cancelar
                </button>
                <button
                  onClick={() => handleDeleteClinicalRecord(recordToDelete)}
                  className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-white bg-rose-500 hover:bg-rose-600 rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95"
                >
                  Sim, remover
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};
