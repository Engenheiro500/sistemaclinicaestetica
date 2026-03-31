
import React, { useState, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useClinic } from '../../src/context/ClinicContext';
import {
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  AlertCircle,
  Plus,
  Download,
  Check,
  X,
  CreditCard,
  Wallet,
  ChevronDown,
  FileText,
  CalendarDays,
  Calendar as CalendarIcon,
  Search,
  CheckCircle2
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useAppointments } from '../../src/hooks/useAppointments';
import { usePatients } from '../../src/hooks/usePatients';
import { useTransactions } from '../../src/hooks/useTransactions';
import { supabase } from '../../src/lib/supabase';
import { User, UserRole, PaymentMethod, TransactionStatus } from '../../types';
import { format, subDays, isAfter, parseISO } from 'date-fns';

const PERIODS = {
  'HOJE': 0,
  '7D': 7,
  '30D': 30,
  '90D': 90,
} as const;

type PeriodKey = keyof typeof PERIODS | 'CUSTOM';

interface FinanceProps {
  user: User;
}

interface PendingPayment {
  id: string;
  patientId?: string;
  patient: string;
  phone?: string;
  service: string;
  value: number;
  paymentMethod?: string;
}

interface TransactionRecord {
  id: string;
  description: string;
  patient: string;
  date: string;
  method: string;
  value: number;
  type: 'RECEITA' | 'DESPESA';
  status: string;
  notes?: string;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const YEARS = ["2024", "2025", "2026", "2027"];

const formatMethodLabel = (method: string) => {
  switch (method) {
    case PaymentMethod.CARTAO_CREDITO: return 'Cartão de Crédito';
    case PaymentMethod.CARTAO_DEBITO: return 'Cartão de Débito';
    default: return method;
  }
};

export const Finance: React.FC<FinanceProps> = ({ user }) => {
  const isAdmin = user.role === UserRole.ADMIN;
  const { appointments, setAppointments, loading: loadingApps } = useAppointments();
  const { patients } = usePatients();

  // Refs para acionar os calendários
  const revenueDateRef = useRef<HTMLInputElement>(null);
  const expenseDateRef = useRef<HTMLInputElement>(null);

  // Modals state
  const { clinicSettings } = useClinic();

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [cancelTx, setCancelTx] = useState<{ id: string; description: string; isAppointment: boolean } | null>(null);

  const [period, setPeriod] = useState<PeriodKey>('30D');
  const [customDate, setCustomDate] = useState<string>('');
  const customDateRef = useRef<HTMLInputElement>(null);

  // Filtros Avançados de Pagamento
  const [paymentFilterMode, setPaymentFilterMode] = useState<'SINGLE' | 'MULTI'>('SINGLE');
  const [activePaymentFilters, setActivePaymentFilters] = useState<string[]>(['TUDO']);
  const PAYMENT_OPTIONS = ['TUDO', 'PIX', 'CRÉDITO', 'DÉBITO', 'DINHEIRO'];

  const handlePaymentFilterClick = (method: string) => {
    if (paymentFilterMode === 'SINGLE') {
      setActivePaymentFilters([method]);
    } else {
      if (method === 'TUDO') {
        setActivePaymentFilters(['TUDO']);
      } else {
        setActivePaymentFilters(prev => {
          const withoutTudo = prev.filter(p => p !== 'TUDO');
          if (withoutTudo.includes(method)) {
            const newFilters = withoutTudo.filter(p => p !== method);
            return newFilters.length === 0 ? ['TUDO'] : newFilters;
          } else {
            return [...withoutTudo, method];
          }
        });
      }
    }
  };

  const dateFrom = React.useMemo(() => {
    if (period === 'CUSTOM') return customDate ? `${customDate}T00:00:00` : undefined;
    const startDate = subDays(new Date(), PERIODS[period]);
    return format(startDate, 'yyyy-MM-dd');
  }, [period, customDate]);

  const dateTo = React.useMemo(() => {
    if (period === 'CUSTOM' && customDate) return `${customDate}T23:59:59`;
    return undefined;
  }, [period, customDate]);

  // Supabase Transactions (Extrato de Despesas e Receitas Manuais)
  const { transactions: manualTransactions, addTransaction: saveTransaction, deleteTransaction, loading: loadingTrans } = useTransactions({ dateFrom, dateTo });

  const loading = loadingApps || loadingTrans;

  // Derived Data
  const pendingPayments = useMemo(() => {
    return appointments
      .filter(a => a.status === 'PENDENTE')
      .sort((a, b) => {
        // Ordena do mais recente para o mais antigo usando date + created_at
        const da = a.created_at || a.date || '';
        const db = b.created_at || b.date || '';
        return db.localeCompare(da);
      })
      .map(a => ({
        id: a.id,
        patientId: a.patientId,
        patient: a.patient,
        phone: a.phone,
        service: a.type,
        value: Number(a.value) || 0
      }));
  }, [appointments]);

  const transactions = useMemo(() => {
    const appsTransactions: TransactionRecord[] = appointments
      .filter(a => {
        if (a.status !== 'CONFIRMADO') return false;
        
        const aptDate = a.date || (a as any).createdAt;
        if (!aptDate || typeof aptDate !== 'string') return false;
        
        if (period === 'CUSTOM' && customDate) {
           return aptDate.startsWith(customDate);
        }
        
        if (!dateFrom) return true;
        return aptDate >= dateFrom;
      })
      .map(a => ({
        id: a.id,
        description: `Atendimento: ${a.type}`,
        patient: a.patient,
        date: a.date ? a.date.split('-').reverse().join('/') : 'N/A',
        method: a.paymentMethod || '-',
        value: Number(a.value) || 0,
        type: 'RECEITA',
        status: 'Pago'
      }));
    const allMerged = [...manualTransactions, ...appsTransactions];

    const deduplicated = [];
    const seen = new Set();

    for (const t of allMerged) {
      // Create a unique key based on standard fields
      const dateFmt = typeof t.date === 'string' && t.date.includes('-') && t.date.length === 10 ? t.date.split('-').reverse().join('/') : t.date;
      const key = `${t.description?.trim().toLowerCase()}-${t.patient?.trim().toLowerCase()}-${dateFmt}-${t.value}`;
      if (!seen.has(key)) {
        deduplicated.push({ ...t, date: dateFmt });
        seen.add(key);
      }
    }

    // FILTRO DE PAGAMENTO EM MEMÓRIA
    const filtered = deduplicated.filter(t => {
      if (activePaymentFilters.includes('TUDO')) return true;
      const methodUpper = String(t.method || '').toUpperCase();
      
      return activePaymentFilters.some(filter => {
        if (filter === 'CRÉDITO') return methodUpper.includes('CRÉDITO') || methodUpper.includes('CREDITO');
        if (filter === 'DÉBITO') return methodUpper.includes('DÉBITO') || methodUpper.includes('DEBITO');
        if (filter === 'DINHEIRO') return methodUpper.includes('DINHEIRO');
        if (filter === 'PIX') return methodUpper.includes('PIX');
        return false;
      });
    });

    // Ordena do mais recente para o mais antigo
    // Prioriza created_at quando disponível (mais preciso), caso contrário usa date
    return filtered.sort((a, b) => {
      const toComp = (t: any) => {
        // created_at é ISO (yyyy-mm-ddTHH:MM:SS) — mais preciso
        if (t.created_at) return t.created_at;
        // date pode ser dd/mm/yyyy ou yyyy-mm-dd
        const d: string = t.date || '';
        if (!d) return '';
        if (d.includes('/')) return d.split('/').reverse().join('-');
        return d;
      };
      return toComp(b).localeCompare(toComp(a));
    });
  }, [appointments, manualTransactions, activePaymentFilters]);

  // Estado dos Saldos Dynamic
  const stats = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    transactions.forEach(t => {
      if (t.type === 'RECEITA') receitas += t.value;
      if (t.type === 'DESPESA') despesas += t.value;
    });
    let pendencias = pendingPayments.reduce((acc, curr) => acc + curr.value, 0);
    return {
      saldo: receitas - despesas,
      receitas,
      despesas,
      pendencias
    };
  }, [transactions, pendingPayments]);

  // Estado do Gráfico Derivado Direto
  const chartData = useMemo(() => {
    // Agrupa receitas e despesas por data
    const map = new Map<string, { date: string, receita: number, despesa: number }>();

    // Pegamos dates únicas de 7 ou mais dias recentes por ex, ou todo array e cortamos os 7 últimos:
    transactions.forEach(t => {
      // extrair os dias/mes
      const shortDate = t.date.substring(0, 5); // ex: 27/01/2026 -> 27/01 
      if (!map.has(shortDate)) {
        map.set(shortDate, { date: shortDate, receita: 0, despesa: 0 });
      }
      const val = map.get(shortDate)!;
      if (t.type === 'RECEITA') val.receita += t.value;
      else val.despesa += t.value;
    });

    const arr = Array.from(map.values()).reverse();
    if (arr.length === 0) return [
      { date: '01/01', receita: 0, despesa: 0 },
      { date: '05/01', receita: 0, despesa: 0 }
    ];
    return arr;
  }, [transactions]);

  // Form states
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>(PaymentMethod.PIX);

  const [revenueForm, setRevenueForm] = useState({
    description: '',
    value: '',
    date: '2026-01-27',
    patientId: '',
    method: PaymentMethod.PIX,
    status: 'Pago',
    notes: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    description: '',
    value: '',
    date: '2026-01-27',
    method: PaymentMethod.PIX,
    status: 'Pago',
    notes: ''
  });

  const [exportForm, setExportForm] = useState({
    month: 'Janeiro',
    year: '2026'
  });

  const handleOpenConfirm = (payment: PendingPayment) => {
    setSelectedPayment(payment);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedPayment) return;

    // Salva o ID para caso falhe na web
    const paymentId = selectedPayment.id;
    const chosenMethod = formatMethodLabel(selectedMethod);
    let finalPatientId = selectedPayment.patientId;

    if (!finalPatientId && selectedPayment.patient) {
      try {
        const { data: newPatient, error: patientError } = await supabase.from('patients').insert({
          name: selectedPayment.patient,
          phone: selectedPayment.phone || '',
          status: 'Ativo'
        }).select('*').single();

        if (patientError) throw patientError;
        finalPatientId = newPatient.id;
      } catch (err: any) {
        console.error('Erro ao auto-cadastrar paciente:', err);
        alert("Erro ao auto-cadastrar paciente: " + err.message);
        return; // Interrompe se não conseguir criar
      }
    }

    // Atualização otimista imediata para evitar delay ao usuário
    setAppointments(prev => prev.map(a =>
      a.id === paymentId ? { ...a, status: 'CONFIRMADO', paymentMethod: chosenMethod, patientId: finalPatientId || a.patientId, bgColor: 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm' } : a
    ));
    setIsConfirmModalOpen(false);
    setSelectedPayment(null);

    try {
      // Update appointment status to confirmado no backend
      const updateData: any = { status: 'CONFIRMADO', paymentMethod: chosenMethod };
      if (finalPatientId) {
        updateData.patientId = finalPatientId;
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', paymentId);

      if (error) throw error;
    } catch (err) {
      console.error('Erro ao confirmar pagamento:', err);
      // Reverte a atualização visual em caso de erro no backend
      setAppointments(prev => prev.map(a =>
        a.id === paymentId ? { ...a, status: 'PENDENTE' } : a
      ));
      alert('Erro ao processar pagamento. Tente novamente.');
    }
  };

  const addTransaction = async (tx: Omit<TransactionRecord, 'id' | 'created_at'>) => {
    try {
      await saveTransaction(tx);
    } catch (err) {
      alert("Erro ao salvar transação. Verifique a conexão.");
    }
  };

  // Cancelar transação (manual ou de agendamento)
  const handleCancelTransaction = async () => {
    if (!cancelTx) return;
    try {
      if (cancelTx.isAppointment) {
        // É um agendamento: altera o status para CANCELADO
        await supabase.from('appointments').update({ status: 'CANCELADO' }).eq('id', cancelTx.id);
        setAppointments(prev => prev.map(a => a.id === cancelTx.id ? { ...a, status: 'CANCELADO' } : a));
      } else {
        // É uma transação manual
        await deleteTransaction(cancelTx.id);
      }
    } catch (err) {
      console.error('Erro ao cancelar:', err);
      alert('Erro ao cancelar. Tente novamente.');
    } finally {
      setCancelTx(null);
    }
  };

  const handleSaveRevenue = () => {
    const patientName = patients.find(p => p.id === revenueForm.patientId)?.name || '-';
    addTransaction({
      description: revenueForm.description,
      patient: patientName,
      date: new Date(revenueForm.date).toLocaleDateString('pt-BR'),
      method: formatMethodLabel(revenueForm.method),
      value: parseFloat(revenueForm.value),
      type: 'RECEITA',
      status: revenueForm.status,
      notes: revenueForm.notes
    });
    setIsRevenueModalOpen(false);
    setRevenueForm({ description: '', value: '', date: '2026-01-27', patientId: '', method: PaymentMethod.PIX, status: 'Pago', notes: '' });
  };

  const handleSaveExpense = () => {
    addTransaction({
      description: expenseForm.description,
      patient: '-',
      date: new Date(expenseForm.date).toLocaleDateString('pt-BR'),
      method: formatMethodLabel(expenseForm.method),
      value: parseFloat(expenseForm.value),
      type: 'DESPESA',
      status: expenseForm.status,
      notes: expenseForm.notes
    });
    setIsExpenseModalOpen(false);
    setExpenseForm({ description: '', value: '', date: '2026-01-27', method: PaymentMethod.PIX, status: 'Pago', notes: '' });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const monthIndex = MONTHS.indexOf(exportForm.month); // 0-based
      const year = parseInt(exportForm.year, 10);

      // Datas de início e fim do mês selecionado
      const startDate = new Date(year, monthIndex, 1);
      const endDate = new Date(year, monthIndex + 1, 0);
      const startStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
      const endStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

      // 1) Buscar transações manuais do Supabase para o período
      const { data: manualTxData } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: true });

      // 2) Buscar agendamentos CONFIRMADO/REALIZADO do período
      const { data: appsData } = await supabase
        .from('appointments')
        .select('*')
        .in('status', ['CONFIRMADO', 'REALIZADO'])
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: true });

      // 3) Montar lista de transações
      const txFromApps = (appsData || []).map((a: any) => ({
        id: a.id,
        date: a.date,
        description: `Atendimento: ${a.type || a.serviceName || '-'}`,
        patient: a.patient || a.tempGuestName || '-',
        method: a.paymentMethod || '-',
        value: Number(a.value) || 0,
        type: 'RECEITA' as const,
      }));

      const txFromManual = (manualTxData || []).map((t: any) => ({
        id: t.id,
        date: t.date,
        description: t.description || '-',
        patient: t.patient || '-',
        method: t.method || '-',
        value: Number(t.value) || 0,
        type: (t.type as 'RECEITA' | 'DESPESA') || 'RECEITA',
      }));

      // Mesclar e deduplicar
      const allTx = [...txFromManual, ...txFromApps];
      const seen = new Set<string>();
      const deduplicated = allTx.filter(t => {
        const key = `${t.description?.toLowerCase()}-${t.patient?.toLowerCase()}-${t.date}-${t.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Ordenar por data ASC
      deduplicated.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      // 4) Calcular totais
      const totalReceitas = deduplicated.filter(t => t.type === 'RECEITA').reduce((s, t) => s + t.value, 0);
      const totalDespesas = deduplicated.filter(t => t.type === 'DESPESA').reduce((s, t) => s + t.value, 0);
      const saldoLiquido = totalReceitas - totalDespesas;

      // 5) Gerar PDF
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const primaryColor = clinicSettings.primary_color || '#00a5b5';
      const clinicName = clinicSettings.clinic_name || 'Clínica';

      // Converter hex para RGB
      const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '');
        return {
          r: parseInt(clean.substring(0, 2), 16),
          g: parseInt(clean.substring(2, 4), 16),
          b: parseInt(clean.substring(4, 6), 16),
        };
      };
      const primary = hexToRgb(primaryColor);

      const pageWidth = doc.internal.pageSize.getWidth();

      // -- Cabeçalho --
      doc.setFillColor(primary.r, primary.g, primary.b);
      doc.rect(0, 0, pageWidth, 36, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(clinicName, 14, 14);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Relatório Mensal de Contabilidade', 14, 23);

      doc.setFontSize(10);
      doc.text(`Período: ${exportForm.month} de ${exportForm.year}`, 14, 31);

      // Data de geração no canto direito
      const now = new Date();
      const nowStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      doc.setFontSize(8);
      doc.text(`Gerado em: ${nowStr}`, pageWidth - 14, 31, { align: 'right' });

      // -- Linha divisória --
      doc.setDrawColor(primary.r, primary.g, primary.b);
      doc.setLineWidth(0.5);
      doc.line(14, 40, pageWidth - 14, 40);

      // -- Tabela de Lançamentos --
      doc.setTextColor(50, 50, 50);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Lançamentos do Período', 14, 48);

      const tableRows = deduplicated.map(t => {
        // Formatar data dd/mm/yyyy
        let dateFormatted = t.date || '';
        if (dateFormatted.includes('-') && dateFormatted.length === 10) {
          const [y, m, d] = dateFormatted.split('-');
          dateFormatted = `${d}/${m}/${y}`;
        }
        const valorFormatted = t.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return [
          dateFormatted,
          t.description,
          t.patient,
          t.method,
          t.type === 'RECEITA' ? 'Receita' : 'Despesa',
          valorFormatted,
        ];
      });

      autoTable(doc, {
        startY: 52,
        head: [['Data', 'Descrição / Serviço', 'Paciente', 'Método de Pgto.', 'Tipo', 'Valor']],
        body: tableRows.length > 0 ? tableRows : [['—', 'Nenhuma transação encontrada', '—', '—', '—', '—']],
        styles: {
          fontSize: 9,
          cellPadding: 4,
          font: 'helvetica',
          textColor: [50, 50, 50],
        },
        headStyles: {
          fillColor: [primary.r, primary.g, primary.b],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 60 },
          2: { cellWidth: 38 },
          3: { cellWidth: 28 },
          4: { cellWidth: 20 },
          5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
        tableLineColor: [226, 232, 240],
        tableLineWidth: 0.3,
        didParseCell: (data) => {
          // Colorir coluna de tipo e valor
          const row = data.row.raw as string[];
          if (data.section === 'body') {
            const tipo = row[4];
            if (data.column.index === 5 || data.column.index === 4) {
              if (tipo === 'Receita') {
                data.cell.styles.textColor = [22, 163, 74]; // verde
              } else if (tipo === 'Despesa') {
                data.cell.styles.textColor = [220, 38, 38]; // vermelho
              }
            }
          }
        },
      });

      // -- Resumo Financeiro --
      const finalY = (doc as any).lastAutoTable?.finalY || 52;
      const summaryY = finalY + 12;

      // Box de resumo
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.roundedRect(14, summaryY, pageWidth - 28, 52, 4, 4, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(primary.r, primary.g, primary.b);
      doc.text('Resumo Financeiro', 20, summaryY + 10);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`Total de Transações no Período:`, 20, summaryY + 20);
      doc.setFont('helvetica', 'bold');
      doc.text(`${deduplicated.length}`, pageWidth - 20, summaryY + 20, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.text('Soma de Receitas:', 20, summaryY + 29);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(totalReceitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, summaryY + 29, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text('Soma de Despesas:', 20, summaryY + 38);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(totalDespesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, summaryY + 38, { align: 'right' });

      // Linha divisória antes do saldo
      doc.setDrawColor(200, 210, 220);
      doc.setLineWidth(0.3);
      doc.line(20, summaryY + 42, pageWidth - 20, summaryY + 42);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(50, 50, 50);
      doc.text('Saldo Líquido Final:', 20, summaryY + 50);
      doc.setTextColor(saldoLiquido >= 0 ? 22 : 220, saldoLiquido >= 0 ? 163 : 38, saldoLiquido >= 0 ? 74 : 38);
      doc.text(saldoLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, summaryY + 50, { align: 'right' });

      // -- Rodapé --
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `${clinicName} — Documento gerado automaticamente — Página ${i} de ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'center' }
        );
      }

      // 6) Gerar nome do arquivo e fazer download
      const monthSlug = exportForm.month
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
      const fileName = `Relatorio_Contabilidade_${monthSlug}_${exportForm.year}.pdf`;
      doc.save(fileName);

      setIsExportModalOpen(false);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Ocorreu um erro ao gerar o relatório. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  // Helper para abrir o seletor de data
  const triggerDatePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) {
      try {
        ref.current.showPicker();
      } catch (e) {
        ref.current.focus();
        ref.current.click();
      }
    }
  };

  const cards = [
    { label: isAdmin ? 'Saldo Clínica' : 'Meu Saldo', value: stats.saldo, icon: <DollarSign />, color: 'cyan' },
    { label: isAdmin ? 'Receitas Clínica (Mês)' : 'Minha Receita (Mês)', value: stats.receitas, icon: <ArrowUpRight />, color: 'emerald' },
    { label: isAdmin ? 'Despesas Clínica' : 'Minhas Despesas', value: stats.despesas, icon: <ArrowDownLeft />, color: 'rose' },
    { label: 'Pendências Pagamento', value: stats.pendencias, icon: <AlertCircle />, color: 'amber' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Financeiro {isAdmin ? 'Clínica' : 'Pessoal'}</h2>
          <p className="text-gray-500 text-sm font-medium">{isAdmin ? 'Acompanhe a saúde financeira total' : 'Resumo dos seus ganhos e despesas'}</p>
        </div>
        
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex-wrap items-center">
          {(Object.keys(PERIODS) as PeriodKey[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                period === p
                  ? "bg-slate-100 text-slate-800"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p === 'HOJE' ? 'Hoje' : p.replace('D', ' dias')}
            </button>
          ))}
          
          <div className="relative flex items-center">
            <input
              type="date"
              ref={customDateRef}
              value={customDate}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  setCustomDate(val);
                  setPeriod('CUSTOM');
                }
              }}
              className="absolute left-0 top-full opacity-0 pointer-events-none w-0 h-0"
              style={{ zIndex: -1 }}
            />
            <button
              onClick={() => {
                setPeriod('CUSTOM');
                triggerDatePicker(customDateRef);
              }}
              className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors flex items-center gap-1 ${
                period === 'CUSTOM'
                  ? "bg-slate-100 text-slate-800"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {period === 'CUSTOM' && customDate 
                ? `Dia ${customDate.split('-').reverse().join('/')}` 
                : 'Personalizado'} <ChevronDown size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-100 bg-white rounded-xl text-xs font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 shadow-sm transition-all active:scale-95"
          >
            <FileText size={18} /><span>Exportar Relatório</span>
          </button>
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-100 bg-white rounded-xl text-xs font-black text-rose-500 uppercase tracking-widest hover:bg-rose-50 shadow-sm transition-all active:scale-95"
          >
            <ArrowDownLeft size={18} /><span>Nova Despesa</span>
          </button>
          <button
            onClick={() => setIsRevenueModalOpen(true)}
            className="flex items-center gap-2 bg-[#00c853] text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-[#00b24a] transition-all active:scale-95"
          >
            <ArrowUpRight size={18} /><span>Nova Receita</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-8">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">Forma de Pagto:</span>
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex-wrap items-center">
          {PAYMENT_OPTIONS.map(opt => {
            const isActive = activePaymentFilters.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => handlePaymentFilterClick(opt)}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  isActive
                    ? "bg-[var(--primary-color)] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                {opt}
              </button>
            )
          })}
          <div className="w-px h-5 bg-slate-200 mx-2" />
          <button
            onClick={() => {
              if (paymentFilterMode === 'MULTI') {
                setPaymentFilterMode('SINGLE');
                setActivePaymentFilters(['TUDO']);
              } else {
                setPaymentFilterMode('MULTI');
              }
            }}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              paymentFilterMode === 'MULTI'
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            PERSONALIZADO
            {paymentFilterMode === 'MULTI' && <Check size={14} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {loading ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col gap-1 animate-pulse h-[132px]">
               <div className="w-12 h-12 bg-gray-100 rounded-2xl mb-4"></div>
               <div className="w-20 h-3 bg-gray-100 rounded-full mb-1"></div>
               <div className="w-32 h-6 bg-gray-100 rounded-md mt-1"></div>
            </div>
          ))
        ) : (
          cards.map((card, i) => (
            <div key={i} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 
                ${card.color === 'cyan' ? 'bg-cyan-50 text-[var(--primary-color)]' : ''}
                ${card.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : ''}
                ${card.color === 'rose' ? 'bg-rose-50 text-rose-600' : ''}
                ${card.color === 'amber' ? 'bg-amber-50 text-amber-600' : ''}
              `}>{card.icon}</div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{card.label}</p>
              <h3 className="text-2xl font-black text-gray-800">R$ {card.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
            <h3 className="font-black text-gray-800 text-lg mb-8 tracking-tight">Fluxo Financeiro {isAdmin ? 'da Clínica' : 'Minhas Movimentações'}</h3>
            <div className="h-[360px] w-full">
              {loading ? (
                <div className="w-full h-full bg-slate-50 rounded-2xl animate-pulse"></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary-color)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="var(--primary-color)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="receita" stroke="var(--primary-color)" fillOpacity={1} fill="url(#colorRec)" strokeWidth={4} animationDuration={1000} />
                    <Area type="monotone" dataKey="despesa" stroke="#f43f5e" fillOpacity={0} strokeWidth={4} strokeDasharray="6 6" animationDuration={1000} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-gray-800 text-lg tracking-tight">Transações Recentes</h3>
              <button className="text-xs font-black text-gray-400 uppercase tracking-widest hover:text-[var(--primary-color)] transition-colors">Ver Tudo</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-left">
                    <th className="pb-4 font-black">Descrição</th>
                    <th className="pb-4 font-black">Paciente</th>
                    <th className="pb-4 font-black">Data</th>
                    <th className="pb-4 font-black">Método</th>
                    <th className="pb-4 font-black text-right">Valor</th>
                    <th className="pb-4 font-black text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    [1, 2, 3, 4].map(i => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-4"><div className="h-6 bg-gray-100 rounded-md w-32"></div></td>
                        <td className="py-4"><div className="h-4 bg-gray-100 rounded-md w-24"></div></td>
                        <td className="py-4"><div className="h-4 bg-gray-100 rounded-md w-16"></div></td>
                        <td className="py-4"><div className="h-5 bg-gray-100 rounded-md w-16"></div></td>
                        <td className="py-4"><div className="h-5 bg-gray-100 rounded-md w-20 ml-auto"></div></td>
                      </tr>
                    ))
                  ) : transactions.map(tx => (
                    <tr key={tx.id} className="group hover:bg-gray-50/50 transition-colors">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${tx.type === 'RECEITA' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                            {tx.type === 'RECEITA' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                          </div>
                          <span className="text-sm font-bold text-gray-700">{tx.description}</span>
                        </div>
                      </td>
                      <td className="py-4 text-sm font-bold text-gray-500">{tx.patient}</td>
                      <td className="py-4 text-sm font-bold text-gray-400">{tx.date}</td>
                      <td className="py-4">
                        <span className="text-[10px] font-black uppercase text-gray-400 bg-gray-100 px-2 py-1 rounded-md">{tx.method}</span>
                      </td>
                      <td className={`py-4 text-right font-black text-sm ${tx.type === 'RECEITA' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {tx.type === 'RECEITA' ? '+' : '-'} R$ {tx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 text-right">
                        <button
                          onClick={() => setCancelTx({
                            id: tx.id,
                            description: tx.description,
                            // Se a descrição começa com 'Atendimento:' é um agendamento
                            isAppointment: tx.description?.startsWith('Atendimento:') ?? false,
                          })}
                          title="Cancelar transação"
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-xl text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
                        >
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-gray-800 text-lg tracking-tight">Pagamentos Pendentes</h3>
            <span className="text-[10px] bg-amber-50 text-amber-600 px-3 py-1 rounded-full font-black uppercase tracking-widest">{pendingPayments.length} ITENS</span>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[360px] pr-2">
            {pendingPayments.map(payment => (
              <div key={payment.id} className="p-5 bg-gray-50/50 rounded-3xl border border-gray-100 hover:border-emerald-200 transition-all group flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="font-bold text-gray-800 text-sm truncate">{payment.patient}</h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{payment.service}</p>
                  <p className="text-emerald-600 font-black text-sm mt-1">R$ {payment.value.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => handleOpenConfirm(payment)}
                  className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-[#00c853] group-hover:text-white transition-all shadow-sm border border-gray-100 group-hover:border-[#00c853]"
                >
                  <Check size={20} strokeWidth={3} />
                </button>
              </div>
            ))}
            {pendingPayments.length === 0 && (
              <div className="py-20 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mb-4">
                  <Check size={32} />
                </div>
                <p className="text-sm font-bold text-gray-400">Tudo em dia!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CANCELAR TRANSAÇÃO */}
      {cancelTx && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[400px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center">
                  <X size={22} strokeWidth={2.5} />
                </div>
                <h3 className="font-bold text-gray-800 text-lg">Cancelar {cancelTx.isAppointment ? 'Agendamento' : 'Transação'}</h3>
              </div>
              <button onClick={() => setCancelTx(null)} className="text-gray-400 hover:text-gray-600 transition-all"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">
              <p className="text-sm font-medium text-gray-500">
                Deseja realmente cancelar {cancelTx.isAppointment ? 'este agendamento' : 'esta transação'}? Esta ação não pode ser desfeita.
              </p>
              <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                <p className="text-sm font-bold text-rose-800 truncate">{cancelTx.description}</p>
                <p className="text-xs font-medium text-rose-400 mt-1">
                  {cancelTx.isAppointment ? 'O status do agendamento será alterado para CANCELADO.' : 'A transação será removida do extrato.'}
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCancelTx(null)}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-colors"
                >
                  Manter
                </button>
                <button
                  onClick={handleCancelTransaction}
                  className="flex-1 py-3 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black text-sm transition-all shadow-lg shadow-rose-100 flex items-center justify-center gap-2"
                >
                  <X size={16} /> Sim, Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR PAGAMENTO */}
      {isConfirmModalOpen && selectedPayment && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[420px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#e8f5e9] text-[#00c853] rounded-2xl flex items-center justify-center">
                  <DollarSign size={24} strokeWidth={3} />
                </div>
                <h3 className="font-bold text-gray-800 text-lg">Confirmar Pagamento</h3>
              </div>
              <button onClick={() => setIsConfirmModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-all"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-sm font-medium text-gray-500 text-left">Selecione a forma de pagamento para confirmar.</p>
              <div className="bg-gray-50 rounded-2xl p-6 space-y-2 border border-gray-100">
                <p className="text-sm font-bold text-gray-800">{selectedPayment.patient}</p>
                <p className="text-xs font-medium text-gray-400">{selectedPayment.service}</p>
                <p className="text-2xl font-black text-[#00c853] pt-2">R$ {selectedPayment.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="space-y-2 text-left">
                <label className="text-xs font-bold text-gray-800 ml-1">Forma de Pagamento</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><CreditCard size={18} /></div>
                  <select
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-700 outline-none appearance-none focus:border-[#00c853] transition-all cursor-pointer"
                  >
                    <option value={PaymentMethod.PIX}>PIX</option>
                    <option value={PaymentMethod.DINHEIRO}>Dinheiro</option>
                    <option value={PaymentMethod.CARTAO_CREDITO}>Cartão de Crédito</option>
                    <option value={PaymentMethod.CARTAO_DEBITO}>Cartão de Débito</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
            </div>
            <div className="p-6 flex items-center justify-end gap-3 bg-white">
              <button onClick={() => setIsConfirmModalOpen(false)} className="px-6 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all shadow-sm">Cancelar</button>
              <button onClick={handleConfirmPayment} className="flex-1 max-w-[180px] bg-[#00c853] hover:bg-[#00b24a] text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-2">
                <DollarSign size={18} /><span>Confirmar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA RECEITA */}
      {isRevenueModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[480px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-3">
                <ArrowUpRight className="text-emerald-500" size={24} strokeWidth={3} />
                <h3 className="font-black text-gray-800 text-xl tracking-tight">Nova Receita</h3>
              </div>
              <button onClick={() => setIsRevenueModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-all"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-5 overflow-y-auto max-h-[75vh]">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Descrição *</label>
                <input
                  type="text"
                  value={revenueForm.description}
                  onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                  className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-emerald-500/5 focus:bg-white focus:border-emerald-200 outline-none transition-all"
                  placeholder="Ex: Sessão de estética"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Valor (R$) *</label>
                  <input
                    type="number"
                    value={revenueForm.value}
                    onChange={(e) => setRevenueForm({ ...revenueForm, value: e.target.value })}
                    className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-emerald-500/5 focus:bg-white focus:border-emerald-200 outline-none transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Data *</label>
                  <div className="relative">
                    <input
                      ref={revenueDateRef}
                      type="date"
                      value={revenueForm.date}
                      onChange={(e) => setRevenueForm({ ...revenueForm, date: e.target.value })}
                      className="w-full pl-5 pr-12 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-emerald-500/5 focus:bg-white focus:border-emerald-200 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => triggerDatePicker(revenueDateRef)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-white border border-gray-100 rounded-xl text-gray-300 hover:text-[var(--primary-color)] hover:border-cyan-100 transition-all shadow-sm active:scale-90"
                    >
                      <CalendarDays size={18} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Paciente</label>
                <div className="relative">
                  <select
                    value={revenueForm.patientId}
                    onChange={(e) => setRevenueForm({ ...revenueForm, patientId: e.target.value })}
                    className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-emerald-500/5 focus:bg-white focus:border-emerald-200 outline-none appearance-none transition-all"
                  >
                    <option value="">Selecione um paciente (opcional)</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Método de pagamento</label>
                  <div className="relative">
                    <select
                      value={revenueForm.method}
                      onChange={(e) => setRevenueForm({ ...revenueForm, method: e.target.value as any })}
                      className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-emerald-500/5 focus:bg-white focus:border-emerald-200 outline-none appearance-none transition-all"
                    >
                      <option value={PaymentMethod.PIX}>PIX</option>
                      <option value={PaymentMethod.DINHEIRO}>Dinheiro</option>
                      <option value={PaymentMethod.CARTAO_CREDITO}>Crédito</option>
                      <option value={PaymentMethod.CARTAO_DEBITO}>Débito</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Status</label>
                  <div className="relative">
                    <select
                      value={revenueForm.status}
                      onChange={(e) => setRevenueForm({ ...revenueForm, status: e.target.value })}
                      className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-emerald-500/5 focus:bg-white focus:border-emerald-200 outline-none appearance-none transition-all"
                    >
                      <option value="Pago">Pago</option>
                      <option value="Pendente">Pendente</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Observações</label>
                <textarea
                  value={revenueForm.notes}
                  onChange={(e) => setRevenueForm({ ...revenueForm, notes: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50 border-gray-100 rounded-2xl text-sm font-medium text-gray-700 focus:ring-4 focus:ring-emerald-500/5 focus:bg-white focus:border-emerald-200 outline-none transition-all min-h-[100px] resize-none"
                  placeholder="Observações adicionais..."
                />
              </div>
            </div>
            <div className="p-8 pt-2 flex items-center justify-end gap-3 bg-white">
              <button onClick={() => setIsRevenueModalOpen(false)} className="px-6 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all shadow-sm">Cancelar</button>
              <button
                onClick={handleSaveRevenue}
                disabled={!revenueForm.description || !revenueForm.value}
                className="flex-1 max-w-[200px] bg-[#00c853] hover:bg-[#00b24a] text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Registrar Receita
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA DESPESA */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[480px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-3">
                <ArrowDownLeft className="text-rose-500" size={24} strokeWidth={3} />
                <h3 className="font-black text-gray-800 text-xl tracking-tight">Nova Despesa</h3>
              </div>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-all"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-5 overflow-y-auto max-h-[75vh]">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Descrição *</label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-rose-500/5 focus:bg-white focus:border-rose-200 outline-none transition-all"
                  placeholder="Ex: Material de escritório"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Valor (R$) *</label>
                  <input
                    type="number"
                    value={expenseForm.value}
                    onChange={(e) => setExpenseForm({ ...expenseForm, value: e.target.value })}
                    className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-rose-500/5 focus:bg-white focus:border-rose-200 outline-none transition-all"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Data *</label>
                  <div className="relative">
                    <input
                      ref={expenseDateRef}
                      type="date"
                      value={expenseForm.date}
                      onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                      className="w-full pl-5 pr-12 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-rose-500/5 focus:bg-white focus:border-rose-200 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => triggerDatePicker(expenseDateRef)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-white border border-gray-100 rounded-xl text-gray-300 hover:text-[var(--primary-color)] hover:border-cyan-100 transition-all shadow-sm active:scale-90"
                    >
                      <CalendarDays size={18} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Método de pagamento</label>
                  <div className="relative">
                    <select
                      value={expenseForm.method}
                      onChange={(e) => setExpenseForm({ ...expenseForm, method: e.target.value as any })}
                      className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-rose-500/5 focus:bg-white focus:border-rose-200 outline-none appearance-none transition-all"
                    >
                      <option value={PaymentMethod.PIX}>PIX</option>
                      <option value={PaymentMethod.DINHEIRO}>Dinheiro</option>
                      <option value={PaymentMethod.CARTAO_CREDITO}>Crédito</option>
                      <option value={PaymentMethod.CARTAO_DEBITO}>Débito</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Status</label>
                  <div className="relative">
                    <select
                      value={expenseForm.status}
                      onChange={(e) => setExpenseForm({ ...expenseForm, status: e.target.value })}
                      className="w-full px-5 py-3.5 bg-gray-50 border-gray-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-rose-500/5 focus:bg-white focus:border-rose-200 outline-none appearance-none transition-all"
                    >
                      <option value="Pago">Pago</option>
                      <option value="Pendente">Pendente</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Observações</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50 border-gray-100 rounded-2xl text-sm font-medium text-gray-700 focus:ring-4 focus:ring-rose-500/5 focus:bg-white focus:border-rose-200 outline-none transition-all min-h-[100px] resize-none"
                  placeholder="Observações adicionais..."
                />
              </div>
            </div>
            <div className="p-8 pt-2 flex items-center justify-end gap-3 bg-white">
              <button onClick={() => setIsExpenseModalOpen(false)} className="px-6 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all shadow-sm">Cancelar</button>
              <button
                onClick={handleSaveExpense}
                disabled={!expenseForm.description || !expenseForm.value}
                className="flex-1 max-w-[200px] bg-rose-500 hover:bg-rose-600 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-rose-100 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Registrar Despesa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPORTAR RELATÓRIO MENSAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 text-left">
          <div className="bg-white w-full max-w-[420px] rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-50">
              <div className="flex items-center gap-3">
                <FileText className="text-gray-400" size={24} />
                <h3 className="font-black text-gray-800 text-xl tracking-tight">Exportar Relatório Mensal</h3>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-all"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-sm font-medium text-gray-500">Selecione o período para gerar o relatório de contabilidade.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-800 ml-1 uppercase tracking-tight">Mês</label>
                  <div className="relative">
                    <select
                      value={exportForm.month}
                      onChange={(e) => setExportForm({ ...exportForm, month: e.target.value })}
                      className="w-full px-5 py-3.5 bg-white border-2 border-gray-100 rounded-2xl text-sm font-bold text-gray-700 outline-none appearance-none focus:border-[#6b7c72]/30 cursor-pointer transition-all"
                    >
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-800 ml-1 uppercase tracking-tight">Ano</label>
                  <div className="relative">
                    <select
                      value={exportForm.year}
                      onChange={(e) => setExportForm({ ...exportForm, year: e.target.value })}
                      className="w-full px-5 py-3.5 bg-white border-2 border-gray-100 rounded-2xl text-sm font-bold text-gray-700 outline-none appearance-none focus:border-[#6b7c72]/30 cursor-pointer transition-all"
                    >
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8 pt-2 flex items-center justify-end gap-3 bg-white">
              <button onClick={() => setIsExportModalOpen(false)} disabled={isExporting} className="px-6 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50">Cancelar</button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 bg-[#6b7c72] hover:bg-[#5a6a61] text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-gray-100 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    <span>Gerando PDF...</span>
                  </>
                ) : (
                  <>
                    <Download size={18} strokeWidth={3} />
                    <span>Exportar para Contabilidade</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
