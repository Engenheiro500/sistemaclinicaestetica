import React, { useState, useMemo } from 'react';
import {
    Users,
    CalendarCheck,
    Bot,
    Filter,
    ChevronDown,
    Clock
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import { format, subDays, isAfter, parseISO, startOfDay, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAppointments } from '../../src/hooks/useAppointments';
import { useScheduleSettings } from '../../src/hooks/useScheduleSettings';

// Utility for class merging (inline to avoid dependency issues if not at exact path)
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

const PERIODS = {
    '7D': 7,
    '30D': 30,
    '90D': 90,
} as const;

type PeriodKey = 'HOJE' | keyof typeof PERIODS | 'CUSTOM';

export const Home = ({ onNavigateToPatient }: { onNavigateToPatient?: (id: string) => void }) => {
    const [period, setPeriod] = useState<PeriodKey>('30D');
    const [customDate, setCustomDate] = useState<string>('');
    const { appointments } = useAppointments();
    const { settings: scheduleSettings, blocks } = useScheduleSettings();

    // Derived Data Based on Period
    const filteredLeads = useMemo(() => {
        const now = new Date();
        
        // 5. Filtro de Status: Ignorar 'CANCELADO', contar apenas 'PENDENTE' e 'CONFIRMADO'
        const validAppointments = appointments.filter(lead => 
            lead.status === 'PENDENTE' || lead.status === 'CONFIRMADO'
        );

        if (period === 'HOJE') {
            const todayStr = format(now, 'yyyy-MM-dd');
            // 1. Correção da Contagem por Data: filtrar exatamente por `date`
            return validAppointments.filter(lead => lead.date === todayStr);
        }
        
        if (period === 'CUSTOM') {
            if (!customDate) return validAppointments;
            // 1. Correção da Contagem por Data: filtrar exatamente por `date`
            return validAppointments.filter(lead => lead.date === customDate);
        }
        
        const daysToSubtract = PERIODS[period];
        const startDate = subDays(now, daysToSubtract);

        return validAppointments.filter(lead => {
            if (!lead.date) return false;
            // Includes the start date implicitly or explicitly
            return isAfter(parseISO(lead.date), startDate) || lead.date === format(startDate, 'yyyy-MM-dd');
        });
    }, [period, customDate, appointments]);

    // Calculate Leads Generated Outside Business Hours dynamically
    const outOfHoursCount = useMemo(() => {
        if (!scheduleSettings.length) return 0;

        let outCount = 0;

        filteredLeads.forEach(lead => {
            if (!lead.date) return;
            
            // 3. Tratamento de Fuso Horário: usar a data/hora local que está no lead (que a clínica agendou)
            // Se tiver hora, compomos uma data local. Se não, assume-se que é fora ou usa 00:00.
            const localTimeString = lead.time ? `${lead.date}T${lead.time}` : `${lead.date}T00:00:00`;
            const compareDate = new Date(localTimeString);
            
            const dayOfWeek = compareDate.getDay(); // 0 (Sunday) to 6 (Saturday)
            const hour = compareDate.getHours();
            const minute = compareDate.getMinutes();
            const startNum = hour + (minute / 60);
            
            // Considera a duração para calcular o fim do agendamento (default 30 min se não houver)
            const durationMin = (lead.duration && typeof lead.duration === 'number' && lead.duration > 0) ? lead.duration : 30;
            const durationHours = durationMin / 60;
            const endNum = startNum + durationHours;
            
            const dateStr = lead.date;

            // --- Define 'Horário Comercial' Rules ---
            let isComercial = true;

            const daySetting = scheduleSettings.find(s => s.dia_semana === dayOfWeek);

            // 1. Is the day active?
            if (!daySetting || !daySetting.esta_ativo) {
                isComercial = false;
            } else {
                const getDecimalTime = (timeStr: string) => {
                    if (!timeStr) return null;
                    const [h, m] = timeStr.split(':').map(Number);
                    return h + (m / 60);
                };

                const startWork = getDecimalTime(daySetting.hora_inicio);
                const endWork = getDecimalTime(daySetting.hora_fim);
                const startLunch = getDecimalTime(daySetting.almoco_inicio || '');
                const endLunch = getDecimalTime(daySetting.almoco_fim || '');

                // 2. Is the appointment entirely within startWork and endWork?
                if (startWork !== null && endWork !== null) {
                    // Consider decimal precision issues
                    if (startNum < (startWork - 0.001) || endNum > (endWork + 0.001)) {
                        isComercial = false;
                    }
                } else {
                    isComercial = false; // if no hours defined, not commercial
                }

                // 3. Does it overlap with the lunch break?
                if (isComercial && startLunch !== null && endLunch !== null) {
                    if (startNum < endLunch && endNum > startLunch) {
                        isComercial = false;
                    }
                }
            }

            // 4. Does the date/time coincide with any blocks (bloqueios_agenda)?
            if (isComercial && blocks && blocks.length > 0) {
                const dayBlocks = blocks.filter(b => b.data === dateStr);
                for (const b of dayBlocks) {
                    const blockStart = () => {
                        if (!b.hora_inicio) return null;
                        const [h, m] = b.hora_inicio.split(':').map(Number);
                        return h + (m / 60);
                    };
                    const blockEnd = () => {
                        if (!b.hora_fim) return null;
                        const [h, m] = b.hora_fim.split(':').map(Number);
                        return h + (m / 60);
                    };

                    const bStart = blockStart();
                    const bEnd = blockEnd();

                    if (bStart !== null && bEnd !== null) {
                        // Check overlap
                        if (startNum < bEnd && endNum > bStart) {
                            isComercial = false;
                            break;
                        }
                    }
                }
            }

            // --- Conclusion ---
            if (!isComercial) {
                outCount++;
            }
        });

        return outCount;
    }, [filteredLeads, scheduleSettings, blocks]);

    // KPIs
    const totalLeads = filteredLeads.length;
    const appointmentsCount = filteredLeads.length; // since we consider all appointments as leads that booked
    const inOfficeHoursCount = totalLeads - outOfHoursCount;

    // Line Chart Data
    const chartData = useMemo(() => {
        const daysMap = new Map<string, number>();

        if (period === 'HOJE') {
            const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
            hours.forEach(h => daysMap.set(h, 0));
        }

        filteredLeads.forEach(lead => {
            if (!lead.date) return;
            
            let dateStr = lead.date;
            if (period === 'HOJE') {
               const rawDateTime = lead.time ? `${lead.date}T${lead.time}` : `${lead.date}T00:00:00`;
               dateStr = format(new Date(rawDateTime), 'HH:00');
            } else {
               dateStr = format(parseISO(lead.date), 'dd/MM');
            }
            
            daysMap.set(dateStr, (daysMap.get(dateStr) || 0) + 1);
        });

        return Array.from(daysMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => {
                if (period === 'HOJE') {
                    return a.date.localeCompare(b.date);
                }
                const [dayA, monthA] = a.date.split('/');
                const [dayB, monthB] = b.date.split('/');
                return new Date(new Date().getFullYear(), parseInt(monthA) - 1, parseInt(dayA)).getTime() -
                    new Date(new Date().getFullYear(), parseInt(monthB) - 1, parseInt(dayB)).getTime();
            }); // basic sorting logic for display
    }, [filteredLeads, period]);

    // Donut Chart Data
    const donutData = useMemo(() => {
        const fora = outOfHoursCount;
        const comercial = totalLeads - fora;
        return [
            { name: 'Horário Comercial', value: comercial, color: 'var(--primary-color)' }, // sky-500 -> primary
            { name: 'Fora do Horário', value: fora, color: '#f97316' } // orange-500
        ];
    }, [outOfHoursCount, totalLeads]);

    // Upcoming Appointments Table
    const upcomingAppointments = useMemo(() => {
        const now = startOfDay(new Date());
        return appointments
            .filter(lead => lead.date && isAfter(parseISO(lead.date), now))
            .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
            .slice(0, 5); // Limit to 5 for the dashboard
    }, [appointments]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Visão Geral</h1>
                    <p className="text-slate-500 font-medium">Acompanhe os resultados da clínica.</p>
                </div>

                {/* Period Selector */}
                <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
                    <button
                        onClick={() => setPeriod('HOJE')}
                        className={cn(
                            "px-4 py-1.5 text-sm font-bold rounded-lg transition-colors",
                            period === 'HOJE'
                                ? "bg-slate-100 text-slate-800"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        HOJE
                    </button>
                    {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={cn(
                                "px-4 py-1.5 text-sm font-bold rounded-lg transition-colors",
                                period === p
                                    ? "bg-slate-100 text-slate-800"
                                    : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            {p.replace('D', ' dias')}
                        </button>
                    ))}
                    <div className="relative flex items-center">
                        <input
                            type="date"
                            id="custom-date-picker"
                            className="absolute opacity-0 pointer-events-none"
                            style={{ top: '100%', left: 0 }}
                            value={customDate}
                            onChange={(e) => {
                                setPeriod('CUSTOM');
                                setCustomDate(e.target.value);
                            }}
                        />
                        <button
                            onClick={() => {
                                setPeriod('CUSTOM');
                                const input = document.getElementById('custom-date-picker') as HTMLInputElement;
                                if (input && input.showPicker) {
                                    input.showPicker();
                                }
                            }}
                            className={cn(
                                "px-4 py-1.5 text-sm font-bold rounded-lg transition-colors flex items-center gap-1",
                                period === 'CUSTOM'
                                    ? "bg-slate-100 text-slate-800"
                                    : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            {period === 'CUSTOM' && customDate ? format(parseISO(customDate), 'dd/MM') : 'Personalizado'} <ChevronDown size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ color: 'var(--primary-color)', backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' }}>
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total de Leads</p>
                        <h3 className="text-3xl font-black text-slate-800">{totalLeads}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ color: 'var(--primary-color)', backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' }}>
                        <CalendarCheck size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Agendamentos</p>
                        <h3 className="text-3xl font-black text-slate-800">{appointmentsCount}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ color: 'var(--primary-color)', backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' }}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Horário Comercial</p>
                        <h3 className="text-3xl font-black text-slate-800">{inOfficeHoursCount}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ color: '#f97316', backgroundColor: '#fff7ed' }}>
                        <Filter size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Fora do Expediente</p>
                        <h3 className="text-3xl font-black text-slate-800">{outOfHoursCount}</h3>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Line Chart */}
                <div className="lg:col-span-2 bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-800">{period === 'HOJE' ? 'Clientes Hoje (por hora)' : 'Clientes por Dia'}</h3>
                        <p className="text-slate-500 text-sm font-medium">{period === 'HOJE' ? 'Distribuição ao longo do dia atual' : 'Volume de novos leads gerados'}</p>
                    </div>
                    <div className="flex-1 w-full h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary-color)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="var(--primary-color)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="var(--primary-color)" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Donut Chart */}
                <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-800">Distribuição de Atendimentos</h3>
                        <p className="text-slate-500 text-sm font-medium">O ponto chave do vídeo</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={donutData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {donutData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3 items-start">
                      <div className="mt-1 text-blue-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      </div>
                      <p className="text-xs leading-relaxed text-blue-900">
                        {outOfHoursCount > 0 ? (
                            <>
                                <span className="font-black">Alerta de Sucesso IA:</span> O assistente 24h reteve <span className="font-black">{outOfHoursCount} {outOfHoursCount === 1 ? 'lead' : 'leads'}</span> que entraram fora do horário comercial, garantindo que nenhuma oportunidade fosse perdida durante o fechamento da clínica.
                            </>
                        ) : (
                            <>
                                <span className="font-black">Alerta IA:</span> O assistente 24h está ativo e monitorando leads fora do horário comercial.
                            </>
                        )}
                      </p>
                    </div>

                </div>
            </div>

            {/* Upcoming Appointments Table */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6 overflow-hidden flex flex-col">
                <div className="mb-6 flex justify-between items-end">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Próximos Agendamentos</h3>
                        <p className="text-slate-500 text-sm font-medium">Leads com agendamento marcado</p>
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="py-3 px-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Nome</th>
                                <th className="py-3 px-4 font-bold text-slate-500 text-xs uppercase tracking-wider">WhatsApp</th>
                                <th className="py-3 px-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Procedimento</th>
                                <th className="py-3 px-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Data / Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {upcomingAppointments.length > 0 ? (
                                upcomingAppointments.map(lead => (
                                    <tr
                                        key={lead.id}
                                        onClick={() => {
                                            if (onNavigateToPatient && lead.patientId) {
                                                onNavigateToPatient(lead.patientId);
                                            }
                                        }}
                                        className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                        <td className="py-4 px-4 font-bold text-slate-800">{lead.patient}</td>
                                        <td className="py-4 px-4 text-slate-600 font-medium">{lead.phone || '-'}</td>
                                        <td className="py-4 px-4">
                                            <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg text-xs font-bold">
                                                {lead.type}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 font-medium text-slate-800">
                                            {format(parseISO(lead.date!), "dd/MM/yyyy")} às {lead.time}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-slate-500 font-medium">
                                        Nenhum agendamento futuro encontrado no período.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};
