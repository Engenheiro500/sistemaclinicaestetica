import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, DollarSign, Mail, Phone, User as UserIcon, Building2, CheckCircle2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { addDays, format, isWeekend, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import { supabase } from '../../src/lib/supabase';
import { useServices } from '../../src/hooks/useServices';
import { useScheduleSettings } from '../../src/hooks/useScheduleSettings';
import { useProfessionals } from '../../src/hooks/useProfessionals';
import { useClinicSettings } from '../../src/hooks/useClinicSettings';

export const PublicScheduling: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [form, setForm] = useState({
        name: '',
        phone: '',
        email: '',
        serviceId: '',
        date: '',
        time: '',
        paymentMethod: '',
        professionalId: ''
    });
    const [isSuccess, setIsSuccess] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
    const [isLoading, setIsLoading] = useState(false);
    const [bookedTimes, setBookedTimes] = useState<{ time: string, duration: number }[]>([]);

    const { services, loading: loadingServices } = useServices();
    const { settings, blocks, loading: loadingSettings } = useScheduleSettings({ publicMode: true });
    const { professionals, loading: loadingProfessionals } = useProfessionals({ publicMode: true });
    const { settings: clinicSettings } = useClinicSettings();

    const selectedService = services.find(s => s.id === form.serviceId);
    const serviceValue = selectedService ? selectedService.value || 150 : 0;
    const serviceDuration = selectedService ? selectedService.duration || 60 : 60;

    const today = startOfDay(new Date());

    useEffect(() => {
        if (!form.date) {
            setBookedTimes([]);
            return;
        }

        const fetchBookedTimes = async () => {
            try {
                const { data, error } = await supabase
                    .from('appointments')
                    .select('time, duration, status')
                    .eq('date', form.date)
                    .neq('status', 'CANCELADO');

                if (error) throw error;
                if (data) {
                    setBookedTimes(data.map(d => ({ time: d.time.substring(0, 5), duration: d.duration || 30 })));
                }
            } catch (error) {
                console.error("Error fetching booked times:", error);
            }
        };

        fetchBookedTimes();
    }, [form.date]);

    // Calendar Logic
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

    const isDateUnavailable = (d: Date) => {
        // Desabilitar dias passados
        if (isBefore(startOfDay(d), today)) return true;
        
        // Verifica se o dia da semana está ativo nas configurações
        const dayOfWeek = d.getDay();
        const settingForDay = settings.find(s => s.dia_semana === dayOfWeek);
        
        return !settingForDay?.esta_ativo;
    };

    const TIME_OPTIONS: string[] = [];
    let currentDaySettings = null;

    if (form.date) {
        const selectedDateObj = new Date(form.date + 'T12:00:00'); // Ensure logical date matching
        const dayOfWeek = selectedDateObj.getDay();
        currentDaySettings = settings.find(s => s.dia_semana === dayOfWeek);

        if (currentDaySettings && currentDaySettings.esta_ativo) {
            const startHour = parseInt(currentDaySettings.hora_inicio.split(':')[0], 10);
            const startMin = parseInt(currentDaySettings.hora_inicio.split(':')[1], 10);
            const endHour = parseInt(currentDaySettings.hora_fim.split(':')[0], 10);
            const endMin = parseInt(currentDaySettings.hora_fim.split(':')[1], 10);
            
            let currentTempHour = startHour;
            let currentTempMin = startMin;

            while (currentTempHour < endHour || (currentTempHour === endHour && currentTempMin <= endMin)) {
                // Determine duration logic in 30 min intervals as standard for this component context
                const timeStr = `${String(currentTempHour).padStart(2, '0')}:${String(currentTempMin).padStart(2, '0')}`;
                
                // Do not add the exact end time as a slot start if duration is 30m+
                if (currentTempHour !== endHour || currentTempMin !== endMin) {
                   TIME_OPTIONS.push(timeStr);
                }

                currentTempMin += 30;
                if (currentTempMin >= 60) {
                    currentTempMin = 0;
                    currentTempHour++;
                }
            }
        }
    }


    const unavailTimesForSelectedDate = (() => {
        if (!form.date) return [];
        let unavailable = new Set<string>();

        const timeToMins = (t: string) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);

        // FILTRO 1: AGENDAMENTOS EXISTENTES (Considerando duração)
        bookedTimes.forEach(appt => {
            const startMins = timeToMins(appt.time);
            const endMins = startMins + appt.duration;

            TIME_OPTIONS.forEach(time => {
                const tMins = timeToMins(time);
                if (tMins >= startMins && tMins < endMins) {
                    unavailable.add(time);
                }
            });
        });

        // FILTRO 2: ALMOÇO
        if (currentDaySettings && currentDaySettings.almoco_inicio && currentDaySettings.almoco_fim) {
             const lunchStart = timeToMins(currentDaySettings.almoco_inicio);
             const lunchEnd = timeToMins(currentDaySettings.almoco_fim);
             
             TIME_OPTIONS.forEach(time => {
                 const tMins = timeToMins(time);
                 if (tMins >= lunchStart && tMins < lunchEnd) {
                     unavailable.add(time);
                 }
             });
        }

        // FILTRO 3: BLOQUEIOS MANUAIS
        const activeBlocksForDate = blocks.filter(b => b.data === form.date);
        activeBlocksForDate.forEach(block => {
            const blockStart = timeToMins(block.hora_inicio);
            const blockEnd = timeToMins(block.hora_fim);

            TIME_OPTIONS.forEach(time => {
                const tMins = timeToMins(time);
                if (tMins >= blockStart && tMins < blockEnd) {
                    unavailable.add(time);
                }
            });
        });

        // FILTRO 4: TEMPO EXPIRADO HOJE
        if (form.date === format(new Date(), 'yyyy-MM-dd')) {
            const now = new Date();
            const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
            TIME_OPTIONS.forEach(time => {
                if (timeToMins(time) <= currentTotalMinutes) {
                    unavailable.add(time);
                }
            });
        }

        // FILTRO 5: SLOT FITTING (Duração do serviço selecionado = serviceDuration)
        const unavailArray = Array.from(unavailable);
        const finalUnavailable = new Set(unavailArray);

        TIME_OPTIONS.forEach(time => {
            if (finalUnavailable.has(time)) return; // Já indisponível

            const startMins = timeToMins(time);
            const neededEndMins = startMins + serviceDuration;

            // Verificar se as peças lógicas subsequentes estão livres para acomodar o job
            let tempMins = startMins;
            while (tempMins < neededEndMins) {
                const slotTime = `${String(Math.floor(tempMins / 60)).padStart(2, '0')}:${String(tempMins % 60).padStart(2, '0')}`;
                
                if (unavailArray.includes(slotTime)) {
                    finalUnavailable.add(time);
                    break;
                }
                tempMins += 30; // Granularidade de análise
            }
            
            // Fim de Expediente
            if (currentDaySettings && currentDaySettings.hora_fim) {
                const eodMins = timeToMins(currentDaySettings.hora_fim);
                if (neededEndMins > eodMins) {
                    finalUnavailable.add(time);
                }
            }
        });

        return Array.from(finalUnavailable);
    })();

    const handleNext = () => {
        if (currentStep === 1 && !form.serviceId) {
            alert('Por favor, selecione um serviço.');
            return;
        }
        if (currentStep === 2 && !form.date) {
            alert('Por favor, selecione uma data.');
            return;
        }
        if (currentStep === 3 && !form.time) {
            alert('Por favor, selecione um horário.');
            return;
        }
        setCurrentStep(prev => prev + 1);
    };

    const handleBack = () => {
        setCurrentStep(prev => prev - 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isLoading) return;
        if (!form.name || !form.phone || !form.serviceId || !form.date || !form.time || !form.paymentMethod) {
            alert("Por favor, preencha todos os campos obrigatórios.");
            return;
        }

        setIsLoading(true);

        try {
            // Salvar no Banco de Dados (Supabase)
            const { error: apptError } = await supabase.from('appointments').insert({
                date: form.date,
                time: form.time,
                duration: serviceDuration,
                status: 'PENDENTE',
                value: serviceValue,
                tempGuestName: form.name,
                tempGuestPhone: form.phone,
                tempGuestEmail: form.email,
                serviceName: selectedService?.name || 'Serviço Estético',
                payment_method: form.paymentMethod,
                professional_id: form.professionalId || null,
                notes: 'Agendamento via Site (Online)',
            });

            if (apptError) throw apptError;

            try {
                // Criar notificação para o Doutor(a)
                const { error: notifError } = await supabase.from('notifications').insert({
                    title: 'Novo Agendamento do Site',
                    message: `Cliente: ${form.name}\nEmail: ${form.email || 'Não informado'}\nTelefone: ${form.phone}\nServiço: ${selectedService?.name || 'Serviço'}\nData/Hora: ${format(new Date(`${form.date}T12:00:00`), 'dd/MM/yyyy')} às ${form.time}`,
                    is_read: false,
                    isRead: false,
                    created_at: new Date().toISOString()
                });
                if (notifError) console.error("Erro na notificação (não crítico):", notifError);
            } catch (notifCatch) {
                console.error("Notificação falhou silenciosamente", notifCatch);
            }

            setIsSuccess(true);
        } catch (error: any) {
            console.error(error);
            alert("Erro do Supabase: " + (error.message || JSON.stringify(error)));
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoginRedirect = () => {
        window.location.hash = '#login';
    };

    const steps = [
        { id: 1, label: 'Procedimento' },
        { id: 2, label: 'Data' },
        { id: 3, label: 'Horário' },
        { id: 4, label: 'Resumo' }
    ];

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
                <div className="bg-white p-8 sm:p-10 rounded-[40px] shadow-xl max-w-md w-full text-center animate-in zoom-in-95 duration-500 border border-slate-100">
                    <div className="w-24 h-24 bg-cyan-50 text-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 size={56} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Oba! Agendado! 🎉</h2>
                    <p className="text-slate-500 mb-8 font-medium text-sm leading-relaxed px-2">Sua reserva foi registrada no sistema da clínica com sucesso. Resumo do seu horário:</p>

                    <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl mb-8 flex flex-col gap-3.5 text-left relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-cyan-600 shadow-sm shrink-0">
                                <Clock size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procedimento</p>
                                <p className="text-sm font-bold text-slate-800">{selectedService?.name || 'Serviço Estético'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 relative z-10 mt-2">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                                <CalendarIcon size={18} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data e Hora</p>
                                <p className="text-sm font-bold text-slate-800">
                                     {form.date ? format(new Date(`${form.date}T12:00:00`), 'dd/MM/yyyy') : ''} às {form.time}
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setIsSuccess(false);
                            setForm({ name: '', phone: '', email: '', serviceId: '', date: '', time: '', paymentMethod: '', professionalId: '' });
                            setCurrentStep(1);
                        }}
                        className="w-full bg-cyan-600 text-white hover:bg-cyan-700 py-4 mb-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-cyan-600/20 active:scale-95"
                    >
                        Novo Agendamento
                    </button>
                    
                    <button
                        onClick={handleLoginRedirect}
                        className="w-full bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:bg-slate-50 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
                    >
                        Voltar para a Página Inicial
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center font-sans pb-12">
            {/* HEADER PÚBLICO */}
            <header className="w-full h-20 bg-white border-b border-slate-200 px-6 md:px-12 flex items-center justify-between sticky top-0 z-40 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-cyan-600 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                        <img src={clinicSettings.logo_url || "https://placehold.co/400x400/00a5b5/ffffff.png?text=Logo"} alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div className="text-left hidden sm:block">
                        <h1 className="font-black text-lg text-slate-800 leading-tight tracking-tight">{clinicSettings.clinic_name || 'GestãoEstética'}</h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Agendamento Online</p>
                    </div>
                </div>

                <button
                    onClick={handleLoginRedirect}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95"
                >
                    <Building2 size={16} />
                    <span className="hidden sm:inline">Sistema da Clínica</span>
                    <span className="sm:hidden">Entrar</span>
                </button>
            </header>

            {/* CONTEÚDO */}
            <div className="w-full max-w-4xl p-4 md:p-8 mt-6">

                {/* STEPPER HEADER */}
                <div className="mb-10 px-2 sm:px-8">
                    <div className="flex items-center justify-between relative">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full z-0"></div>
                        <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-cyan-500 rounded-full z-0 transition-all duration-500 ease-out"
                            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
                        ></div>

                        {steps.map((step) => {
                            const isCompleted = currentStep > step.id;
                            const isCurrent = currentStep === step.id;

                            return (
                                <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 bg-slate-50">
                                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-sm transition-all duration-300 border-4 border-slate-50
                                        ${isCompleted ? 'bg-cyan-500 text-white' : isCurrent ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30' : 'bg-slate-200 text-slate-400'}`}>
                                        {isCompleted ? <Check size={20} strokeWidth={3} /> : step.id}
                                    </div>
                                    <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider absolute -bottom-6 whitespace-nowrap
                                        ${isCurrent ? 'text-cyan-700' : isCompleted ? 'text-slate-600' : 'text-slate-400'}`}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* STEP CONTENT */}
                <div className="bg-white p-6 md:p-10 rounded-[32px] shadow-sm border border-slate-100 min-h-[400px] flex flex-col">
                    <div className="flex-1">

                        {/* STEP 1: SERVIÇOS */}
                        {currentStep === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-6">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Escolha o Procedimento</h2>
                                    <p className="text-slate-500 font-medium text-sm mt-1">Selecione qual serviço você deseja agendar hoje.</p>
                                </div>

                                {loadingServices ? (
                                    <div className="flex justify-center p-12">
                                        <div className="w-10 h-10 border-4 border-cyan-100 border-t-cyan-500 rounded-full animate-spin"></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {services.map(srv => {
                                            const isSelected = form.serviceId === srv.id;
                                            return (
                                                <div
                                                    key={srv.id}
                                                    onClick={() => setForm({ ...form, serviceId: srv.id })}
                                                    className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-3
                                                        ${isSelected ? 'border-cyan-500 bg-cyan-50/30 shadow-sm' : 'border-slate-100 hover:border-cyan-200 hover:bg-slate-50'}`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <h3 className={`font-bold ${isSelected ? 'text-cyan-800' : 'text-slate-800'}`}>{srv.name}</h3>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                                                            ${isSelected ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300'}`}>
                                                            {isSelected && <Check size={12} strokeWidth={4} />}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs font-bold mt-auto">
                                                        <div className="flex items-center gap-1.5 text-slate-500 bg-white px-2.5 py-1 rounded-md shadow-sm border border-slate-100">
                                                            <Clock size={14} className="text-cyan-600" />
                                                            {srv.duration} min
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-slate-500 bg-white px-2.5 py-1 rounded-md shadow-sm border border-slate-100">
                                                            <DollarSign size={14} className="text-emerald-500" />
                                                            {srv.value ? `R$ ${srv.value.toFixed(2)}` : 'Grátis'}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {services.length === 0 && !loadingServices && (
                                            <p className="text-slate-500 col-span-2 p-4 text-center">Nenhum serviço disponível no momento.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 2: DATA */}
                        {currentStep === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-6">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Qual o melhor dia?</h2>
                                    <p className="text-slate-500 font-medium text-sm mt-1">Selecione a data para o seu agendamento.</p>
                                </div>

                                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 max-w-md mx-auto">
                                    <div className="flex items-center justify-between mb-6">
                                        <button onClick={prevMonth} className="p-2 hover:bg-slate-200 text-slate-600 rounded-full transition-colors bg-white shadow-sm">
                                            <ChevronLeft size={20} />
                                        </button>
                                        <h4 className="font-black text-lg capitalize text-slate-800">
                                            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                                        </h4>
                                        <button onClick={nextMonth} className="p-2 hover:bg-slate-200 text-slate-600 rounded-full transition-colors bg-white shadow-sm">
                                            <ChevronRight size={20} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-7 gap-2 mb-2">
                                        {weekDays.map(day => (
                                            <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-wider py-1">
                                                {day}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-7 gap-2">
                                        {calendarDays.map((day, idx) => {
                                            const dateStr = format(day, 'yyyy-MM-dd');
                                            const isSelected = form.date === dateStr;
                                            const isCurrentMonth = isSameMonth(day, monthStart);
                                            const isTodayDate = isSameDay(day, today);
                                            const isUnavail = isDateUnavailable(day);

                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => !isUnavail && isCurrentMonth && setForm({ ...form, date: dateStr, time: '' })}
                                                    disabled={isUnavail || !isCurrentMonth}
                                                    className={`
                                                        aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-bold transition-all relative
                                                        ${!isCurrentMonth ? 'text-slate-300 cursor-default opacity-50' : ''}
                                                        ${isCurrentMonth && isUnavail ? 'text-slate-300 cursor-not-allowed bg-slate-100/50' : ''}
                                                        ${isCurrentMonth && !isUnavail && !isSelected ? 'hover:bg-cyan-100 hover:text-cyan-800 cursor-pointer text-slate-700 bg-white shadow-sm' : ''}
                                                        ${isSelected ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30 scale-105 ring-2 ring-cyan-600 ring-offset-2 ring-offset-slate-50' : ''}
                                                    `}
                                                >
                                                    <span>{format(day, 'd')}</span>
                                                    {isTodayDate && !isSelected && (
                                                        <span className="absolute bottom-1 w-1 h-1 bg-cyan-500 rounded-full"></span>
                                                    )}
                                                    {isTodayDate && isSelected && (
                                                        <span className="absolute bottom-1 w-1 h-1 bg-white rounded-full"></span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: HORÁRIO */}
                        {currentStep === 3 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-6">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Escolha o horário</h2>
                                    <p className="text-slate-500 font-medium text-sm mt-1">Horários disponíveis para {format(new Date(`${form.date}T12:00:00`), 'dd/MM/yyyy')}</p>
                                </div>

                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-w-2xl mx-auto">
                                    {TIME_OPTIONS.map((time) => {
                                        const isUnavail = unavailTimesForSelectedDate.includes(time);
                                        const isSelected = form.time === time;

                                        return (
                                            <button
                                                key={time}
                                                type="button"
                                                disabled={isUnavail}
                                                onClick={() => !isUnavail && setForm({ ...form, time })}
                                                className={`py-3 px-2 rounded-xl font-bold text-sm transition-all border-2 flex items-center justify-center gap-2
                                                    ${isSelected ? 'bg-cyan-600 border-cyan-600 text-white shadow-md shadow-cyan-600/20' :
                                                        isUnavail ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50 line-through text-slate-400' :
                                                            'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50 text-slate-700 shadow-sm'}`}
                                            >
                                                {time}
                                            </button>
                                        );
                                    })}
                                </div>

                                {TIME_OPTIONS.every(t => unavailTimesForSelectedDate.includes(t)) && (
                                    <div className="text-center p-8 bg-orange-50 rounded-2xl mt-6 border border-orange-100 text-orange-800">
                                        <p className="font-bold">Poxa, não temos mais horários disponíveis neste dia.</p>
                                        <p className="text-sm mt-1">Por favor, volte e escolha outra data.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 4: DADOS E RESUMO */}
                        {currentStep === 4 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-6">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Finalizar Agendamento</h2>
                                    <p className="text-slate-500 font-medium text-sm mt-1">Quase lá! Preencha seus dados para confirmar.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <form id="booking-form" onSubmit={handleSubmit} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo *</label>
                                            <div className="relative">
                                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    required
                                                    type="text"
                                                    value={form.name}
                                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 outline-none transition-all"
                                                    placeholder="Ex: Maria Oliveira"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">WhatsApp *</label>
                                            <div className="relative">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    required
                                                    type="tel"
                                                    value={form.phone}
                                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 outline-none transition-all"
                                                    placeholder="(00) 00000-0000"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">E-mail</label>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    type="email"
                                                    value={form.email}
                                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 outline-none transition-all"
                                                    placeholder="seu@email.com"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Profissional (Opcional)</label>
                                            <div className="relative">
                                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <select
                                                    value={form.professionalId}
                                                    onChange={(e) => setForm({ ...form, professionalId: e.target.value })}
                                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 outline-none transition-all appearance-none"
                                                >
                                                    <option value="">Qualquer Profissional</option>
                                                    {loadingProfessionals ? (
                                                        <option disabled>Carregando profissionais...</option>
                                                    ) : professionals.length === 0 ? (
                                                        <option disabled>Nenhum profissional na lista.</option>
                                                    ) : (
                                                        professionals.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))
                                                    )}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                    <ChevronRight size={16} className="rotate-90" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Forma de Pagamento *</label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <select
                                                    required
                                                    value={form.paymentMethod}
                                                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 outline-none transition-all appearance-none"
                                                >
                                                    <option value="" disabled>Selecione uma opção</option>
                                                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                                                    <option value="Cartão de Débito">Cartão de Débito</option>
                                                    <option value="PIX">PIX</option>
                                                    <option value="Dinheiro">Dinheiro</option>
                                                </select>
                                            </div>
                                        </div>
                                    </form>

                                    {/* SUMMARY CARD */}
                                    <div>
                                        <div className="bg-cyan-50 border border-cyan-100 rounded-3xl p-6 h-full flex flex-col">
                                            <h3 className="font-black text-cyan-900 uppercase tracking-widest text-xs mb-4">Resumo do Agendamento</h3>

                                            <div className="space-y-4 flex-1">
                                                <div className="flex gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-cyan-600 shadow-sm shrink-0">
                                                        <CalendarIcon size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-500">Data e Hora</p>
                                                        <p className="text-slate-800 font-bold">
                                                            {format(new Date(`${form.date}T12:00:00`), 'dd/MM/yyyy')} às {form.time}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-cyan-600 shadow-sm shrink-0">
                                                        <Clock size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-500">Procedimento</p>
                                                        <p className="text-slate-800 font-bold">{selectedService?.name}</p>
                                                        <p className="text-xs text-slate-400 font-medium">Duração: {serviceDuration} min</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-cyan-200/50 flex justify-between items-end">
                                                <span className="text-sm font-bold text-cyan-800">Total</span>
                                                <span className="text-2xl font-black text-cyan-700">R$ {serviceValue.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* NAVIGATION BUTTONS */}
                    <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between">
                        {currentStep > 1 ? (
                            <button
                                onClick={handleBack}
                                className="px-6 py-3 bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl font-bold text-sm transition-all"
                            >
                                Voltar
                            </button>
                        ) : <div></div>}

                        {currentStep < 4 ? (
                            <button
                                onClick={handleNext}
                                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-black text-sm uppercase tracking-wider transition-all shadow-md shadow-cyan-600/20 active:scale-95 flex items-center gap-2"
                            >
                                Próximo <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                form="booking-form"
                                disabled={isLoading || !form.name || !form.phone}
                                className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-black text-sm uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
                            >
                                {isLoading ? 'Processando...' : 'Confirmar Agendamento'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.02);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.2);
                }
            `}</style>
        </div>
    );
};
