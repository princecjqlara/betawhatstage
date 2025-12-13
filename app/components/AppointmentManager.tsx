'use client';

import { useState, useEffect } from 'react';
import {
    Calendar as CalendarIcon,
    Clock,
    Settings2,
    Trash2,
    Loader2,
    User,
    Phone,
    MapPin,
    ChevronLeft,
    ChevronRight,
    Search,
    MoreVertical,
    X,
    Save,
    CheckCircle2
} from 'lucide-react';

interface AppointmentSettings {
    id?: string;
    business_hours_start: string;
    business_hours_end: string;
    slot_duration_minutes: number;
    days_available: number[];
    booking_lead_time_hours: number;
    max_advance_booking_days: number;
    buffer_between_slots_minutes: number;
    is_active: boolean;
}

interface Appointment {
    id: string;
    sender_psid: string;
    customer_name: string | null;
    facebook_name?: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    appointment_date: string; // YYYY-MM-DD
    start_time: string; // HH:MM:SS
    end_time: string; // HH:MM:SS
    notes: string | null;
    status: string;
    created_at: string;
}

const DAYS_OF_WEEK = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
];

const SLOT_DURATIONS = [
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1.5 hours' },
    { value: 120, label: '2 hours' },
];

interface AppointmentManagerProps {
    initialAppointments?: Appointment[];
    initialSettings?: AppointmentSettings;
}

export default function AppointmentManager({ initialAppointments = [], initialSettings }: AppointmentManagerProps) {
    const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
    const [settings, setSettings] = useState<AppointmentSettings>(initialSettings || {
        business_hours_start: '09:00:00',
        business_hours_end: '17:00:00',
        slot_duration_minutes: 60,
        days_available: [1, 2, 3, 4, 5],
        booking_lead_time_hours: 24,
        max_advance_booking_days: 30,
        buffer_between_slots_minutes: 0,
        is_active: true,
    });

    // UI State
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [showSettings, setShowSettings] = useState(false);
    const [loading, setLoading] = useState(!initialAppointments.length && !initialSettings);
    const [saving, setSaving] = useState(false);
    const [cancelling, setCancelling] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!initialAppointments.length && !initialSettings) {
            fetchData();
        }
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [appointmentsRes, settingsRes] = await Promise.all([
                fetch('/api/appointments'),
                fetch('/api/appointment-settings'),
            ]);

            const appointmentsData = await appointmentsRes.json();
            const settingsData = await settingsRes.json();

            if (Array.isArray(appointmentsData)) {
                setAppointments(appointmentsData);
            }
            if (settingsData && !settingsData.error) {
                setSettings(settingsData);
            }
        } catch (err) {
            console.error('Failed to fetch appointment data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/appointment-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });

            if (res.ok) {
                alert('Settings saved successfully!');
                setShowSettings(false);
            } else {
                alert('Failed to save settings');
            }
        } catch (err) {
            console.error('Failed to save settings:', err);
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleCancelAppointment = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to cancel this appointment?')) return;

        setCancelling(id);
        try {
            const res = await fetch(`/api/appointments?id=${id}&reason=Cancelled by admin`, {
                method: 'DELETE',
            });

            if (res.ok) {
                setAppointments(prev =>
                    prev.map(a => (a.id === id ? { ...a, status: 'cancelled' } : a))
                );
            } else {
                alert('Failed to cancel appointment');
            }
        } catch (err) {
            console.error('Failed to cancel:', err);
        } finally {
            setCancelling(null);
        }
    };

    // --- Helpers ---

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    };

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    // Filter appointments for the selected date
    const dailyAppointments = appointments.filter(apt => {
        const aptDate = new Date(apt.appointment_date);
        // Fix timezone issue by comparing date strings or using UTC consistently
        // Simple approach: compare YYYY-MM-DD strings
        const selStr = selectedDate.toISOString().split('T')[0];
        const matchesDate = apt.appointment_date === selStr;
        const matchesStatus = apt.status !== 'cancelled';

        if (!searchQuery) return matchesDate && matchesStatus;

        const query = searchQuery.toLowerCase();
        const matchesSearch =
            (apt.customer_name?.toLowerCase().includes(query) || false) ||
            (apt.facebook_name?.toLowerCase().includes(query) || false) ||
            (apt.customer_email?.toLowerCase().includes(query) || false) ||
            (apt.customer_phone?.toLowerCase().includes(query) || false) ||
            (apt.notes?.toLowerCase().includes(query) || false);

        return matchesDate && matchesStatus && matchesSearch;
    }).sort((a, b) => a.start_time.localeCompare(b.start_time));

    // Get days in month for calendar
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();
        return { daysInMonth, startingDay };
    };

    const renderCalendar = () => {
        const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
        const days = [];

        // Empty cells
        for (let i = 0; i < startingDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-14 sm:h-24 bg-gray-50/30"></div>);
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const dateStr = date.toISOString().split('T')[0];
            const isToday = isSameDay(date, new Date());
            const isSelected = isSameDay(date, selectedDate);

            // Check if day has appointments
            const hasAppointments = appointments.some(a =>
                a.appointment_date === dateStr && a.status !== 'cancelled'
            );
            const aptCount = appointments.filter(a =>
                a.appointment_date === dateStr && a.status !== 'cancelled'
            ).length;

            days.push(
                <button
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className={`
                        h-14 sm:h-24 p-2 text-left relative transition-all border border-gray-100 hover:bg-gray-50
                        ${isSelected ? 'bg-blue-50/50 ring-2 ring-inset ring-blue-400 z-10' : 'bg-white'}
                    `}
                >
                    <span className={`
                        inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium
                        ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700'}
                    `}>
                        {day}
                    </span>

                    {hasAppointments && (
                        <div className="absolute bottom-2 left-2 right-2">
                            <div className="hidden sm:flex flex-col gap-1">
                                {appointments
                                    .filter(a => a.appointment_date === dateStr && a.status !== 'cancelled')
                                    .slice(0, 2)
                                    .map(apt => (
                                        <div key={apt.id} className="text-[10px] truncate bg-emerald-100 text-emerald-800 rounded px-1 py-0.5">
                                            {formatTime(apt.start_time)}
                                        </div>
                                    ))
                                }
                                {aptCount > 2 && (
                                    <div className="text-[10px] text-gray-400 pl-1">+{aptCount - 2} more</div>
                                )}
                            </div>
                            {/* Mobile dot indicator */}
                            <div className="sm:hidden flex justify-center mt-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                            </div>
                        </div>
                    )}
                </button>
            );
        }
        return days;
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
        );
    }

    return (
        <div className="bg-gray-100 min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            {/* Main Dashboard Layout */}
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 h-[85vh] min-h-[600px]">

                {/* Left Panel: Schedule List (approx 35% width) */}
                <div className="w-full lg:w-[35%] bg-white rounded-3xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-6 pb-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Calendar</h2>
                            <button
                                onClick={() => setShowSettings(true)}
                                className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                            >
                                <Settings2 size={20} />
                            </button>
                        </div>

                        <div className="mb-6">
                            <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">
                                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                            <h3 className="text-3xl font-semibold text-gray-900 mt-1">
                                You Have {dailyAppointments.length} Meetings
                            </h3>
                        </div>

                        {/* Search (Visual Placeholder) */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search event, meetings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-blue-200 rounded-xl outline-none transition-all text-sm"
                            />
                        </div>
                    </div>

                    {/* Scrollable List */}
                    <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
                        {dailyAppointments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-center">
                                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                                    <CalendarIcon size={20} />
                                </div>
                                <p>No meetings scheduled<br />for this day.</p>
                            </div>
                        ) : (
                            dailyAppointments.map((apt) => (
                                <div key={apt.id} className="group relative bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-100 transition-all">
                                    <div className="flex items-start gap-4">
                                        <div className="flex flex-col items-center pt-1">
                                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mb-1"></div>
                                            <div className="w-0.5 h-full bg-gray-100 group-last:hidden min-h-[20px]"></div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-semibold text-blue-600">
                                                    {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                                                </span>
                                                <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                                                    onClick={(e) => handleCancelAppointment(apt.id, e)}
                                                    disabled={cancelling === apt.id}>
                                                    {cancelling === apt.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                </button>
                                            </div>

                                            <h4 className="text-base font-bold text-gray-900 mb-1 truncate">
                                                {apt.customer_name || 'Guest User'}
                                            </h4>

                                            {/* Facebook Name Tag */}
                                            {apt.facebook_name && apt.facebook_name !== apt.customer_name && (
                                                <div className="flex items-center gap-1 mb-2">
                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                                                        FB: {apt.facebook_name}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Extra details */}
                                            <div className="space-y-1">
                                                {apt.customer_email && (
                                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                        <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                            <span className="text-[10px] font-bold text-gray-600">
                                                                {(apt.customer_name?.[0] || 'G').toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <span className="truncate">{apt.customer_email}</span>
                                                    </div>
                                                )}
                                                {apt.customer_phone && (
                                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                        <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                            <Phone size={10} className="text-gray-600" />
                                                        </div>
                                                        <span className="truncate">{apt.customer_phone}</span>
                                                    </div>
                                                )}
                                                {apt.notes && (
                                                    <div className="bg-gray-50 rounded-lg p-2 mt-2 text-xs text-gray-600 italic">
                                                        "{apt.notes}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* End of list decorator */}
                        {dailyAppointments.length > 0 && (
                            <div className="flex justify-center pt-4">
                                <div className="w-16 h-1 rounded-full bg-gray-200/50"></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Calendar Grid (approx 65% width) */}
                <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 flex flex-col p-6 overflow-hidden">
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 border border-gray-200 text-gray-600 transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <h2 className="text-xl font-bold text-gray-900 min-w-[140px] text-center">
                                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </h2>
                            <button
                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 border border-gray-200 text-gray-600 transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                            {['Day', 'Week', 'Month'].map(view => (
                                <button
                                    key={view}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${view === 'Month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {view}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Weekday Header */}
                    <div className="grid grid-cols-7 border-b border-gray-200 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Body */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                            {renderCalendar()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Settings2 size={24} className="text-blue-500" />
                                Configuration
                            </h3>
                            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-8">
                            {/* Business Hours Section */}
                            <section>
                                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Availability</h4>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-4 rounded-2xl">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Business Opens</label>
                                        <input
                                            type="time"
                                            value={settings.business_hours_start.slice(0, 5)}
                                            onChange={e => setSettings(prev => ({ ...prev, business_hours_start: e.target.value + ':00' }))}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-2xl">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Business Closes</label>
                                        <input
                                            type="time"
                                            value={settings.business_hours_end.slice(0, 5)}
                                            onChange={e => setSettings(prev => ({ ...prev, business_hours_end: e.target.value + ':00' }))}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <label className="block text-xs font-medium text-gray-500 mb-2">Working Days</label>
                                    <div className="flex flex-wrap gap-2">
                                        {DAYS_OF_WEEK.map(day => (
                                            <button
                                                key={day.value}
                                                onClick={() => setSettings(prev => ({
                                                    ...prev,
                                                    days_available: prev.days_available.includes(day.value)
                                                        ? prev.days_available.filter(d => d !== day.value)
                                                        : [...prev.days_available, day.value].sort()
                                                }))}
                                                className={`
                                                    px-4 py-2 rounded-xl text-sm font-medium transition-all
                                                    ${settings.days_available.includes(day.value)
                                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                                                `}
                                            >
                                                {day.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {/* Divider */}
                            <div className="h-px bg-gray-100"></div>

                            {/* Slot Configuration */}
                            <section>
                                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Slot Rules</h4>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
                                        <select
                                            value={settings.slot_duration_minutes}
                                            onChange={e => setSettings(prev => ({ ...prev, slot_duration_minutes: parseInt(e.target.value) }))}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900"
                                        >
                                            {SLOT_DURATIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Buffer Time</label>
                                        <select
                                            value={settings.buffer_between_slots_minutes}
                                            onChange={e => setSettings(prev => ({ ...prev, buffer_between_slots_minutes: parseInt(e.target.value) }))}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900"
                                        >
                                            <option value={0}>No buffer</option>
                                            <option value={5}>5 min</option>
                                            <option value={10}>10 min</option>
                                            <option value={15}>15 min</option>
                                            <option value={30}>30 min</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Lead Time (Hours)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={settings.booking_lead_time_hours}
                                            onChange={e => setSettings(prev => ({ ...prev, booking_lead_time_hours: parseInt(e.target.value) || 0 }))}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Max Advance Days</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={settings.max_advance_booking_days}
                                            onChange={e => setSettings(prev => ({ ...prev, max_advance_booking_days: parseInt(e.target.value) || 30 }))}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3 sticky bottom-0 rounded-b-3xl">
                            <button
                                onClick={() => setShowSettings(false)}
                                className="px-6 py-2.5 rounded-xl font-medium text-gray-600 hover:bg-gray-200/80 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveSettings}
                                disabled={saving}
                                className="px-6 py-2.5 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2"
                            >
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
