'use client';

import { useState, useEffect } from 'react';
import {
    Calendar,
    Clock,
    ChevronLeft,
    ChevronRight,
    Loader2,
    CheckCircle2,
    User,
    Phone,
    Mail,
    MessageSquare,
    AlertCircle,
    XCircle,
    CalendarCheck,
} from 'lucide-react';

interface TimeSlot {
    start_time: string;
    end_time: string;
    available: boolean;
}

interface AvailableSlotsResponse {
    date: string;
    available: boolean;
    reason?: string;
    settings?: {
        slot_duration_minutes: number;
        business_hours_start: string;
        business_hours_end: string;
    };
    slots: TimeSlot[];
}

interface Appointment {
    id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: string;
    customer_name?: string;
    notes?: string;
}

interface AppointmentSettings {
    business_hours_start: string;
    business_hours_end: string;
    slot_duration_minutes: number;
    days_available: number[];
    booking_lead_time_hours: number;
    max_advance_booking_days: number;
    buffer_between_slots_minutes: number;
    is_active: boolean;
}

interface BookingPageClientProps {
    initialSettings: AppointmentSettings;
    initialAppointments: Appointment[];
    senderPsid: string;
    pageId: string;
}

export default function BookingPageClient({
    initialSettings,
    initialAppointments,
    senderPsid,
    pageId
}: BookingPageClientProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [booking, setBooking] = useState(false);
    const [bookingComplete, setBookingComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Existing appointments state (initialized from SSR)
    const [existingAppointments, setExistingAppointments] = useState<Appointment[]>(initialAppointments);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    // Form fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');

    // Use pre-fetched settings
    const daysAvailable = initialSettings.days_available;
    const maxAdvanceDays = initialSettings.max_advance_booking_days;

    useEffect(() => {
        if (selectedDate) {
            fetchAvailableSlots(selectedDate);
        }
    }, [selectedDate]);

    // Cancel an appointment (sends confirmation to Messenger)
    const handleCancelAppointment = async (appointmentId: string) => {
        if (!confirm('A confirmation will be sent to your Messenger. You must confirm there to cancel the appointment. Continue?')) return;

        setCancellingId(appointmentId);
        try {
            const res = await fetch('/api/appointments/cancel-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appointment_id: appointmentId,
                    sender_psid: senderPsid,
                    page_id: pageId
                }),
            });

            const data = await res.json();

            if (res.ok) {
                alert('✅ Confirmation sent to your Messenger!\n\nPlease check your messages and confirm the cancellation there.');
            } else {
                alert(data.error || 'Failed to send confirmation. Please try again.');
            }
        } catch (err) {
            console.error('Error requesting cancellation:', err);
            alert('Failed to request cancellation. Please try again.');
        } finally {
            setCancellingId(null);
        }
    };

    // Check if a date has an existing appointment
    const hasExistingAppointment = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        return existingAppointments.some(apt => apt.appointment_date === dateStr);
    };

    const fetchAvailableSlots = async (date: Date) => {
        setLoadingSlots(true);
        setSlots([]);
        setSelectedSlot(null);
        setError(null);

        try {
            const dateStr = date.toISOString().split('T')[0];
            const res = await fetch(`/api/appointments/available?date=${dateStr}`);
            const data: AvailableSlotsResponse = await res.json();

            if (!data.available) {
                setError(data.reason || 'This date is not available');
                setSlots([]);
            } else {
                setSlots(data.slots);
            }
        } catch (err) {
            console.error('Failed to fetch slots:', err);
            setError('Failed to load available time slots');
        } finally {
            setLoadingSlots(false);
        }
    };

    const handleBooking = async () => {
        if (!selectedDate || !selectedSlot) return;

        // Validation
        if (!phone) {
            setError('Please provide a phone number so we can contact you.');
            return;
        }

        if (!senderPsid && !name) {
            setError('Please provide your name.');
            return;
        }

        setBooking(true);
        setError(null);

        try {
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_psid: senderPsid,
                    page_id: pageId,
                    customer_name: name || undefined,
                    customer_email: email || undefined,
                    customer_phone: phone,
                    appointment_date: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`,
                    start_time: selectedSlot.start_time,
                    end_time: selectedSlot.end_time,
                    notes: notes || undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Booking failed');
            }

            setBookingComplete(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Booking failed');
        } finally {
            setBooking(false);
        }
    };

    // Calendar helpers
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        return { daysInMonth, startingDay };
    };

    const isDateDisabled = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + maxAdvanceDays);

        if (date < today) return true;
        if (date > maxDate) return true;
        if (!daysAvailable.includes(date.getDay())) return true;

        return false;
    };

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    };

    const renderCalendar = () => {
        const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < startingDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-10 sm:h-12"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const isDisabled = isDateDisabled(date);
            const isSelected = selectedDate?.toDateString() === date.toDateString();
            const isToday = date.toDateString() === today.toDateString();
            const hasAppointment = hasExistingAppointment(date);

            days.push(
                <button
                    key={day}
                    onClick={() => !isDisabled && setSelectedDate(date)}
                    disabled={isDisabled}
                    className={`
                        h-10 sm:h-12 rounded-xl font-medium text-sm sm:text-base transition-all relative
                        ${isDisabled
                            ? 'text-gray-300 cursor-not-allowed'
                            : isSelected
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105'
                                : isToday
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : hasAppointment
                                        ? 'bg-teal-50 text-teal-700 hover:bg-teal-100 ring-2 ring-teal-300'
                                        : 'hover:bg-gray-100 text-gray-700'
                        }
                    `}
                >
                    {day}
                    {hasAppointment && !isDisabled && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-teal-500 rounded-full" />
                    )}
                </button>
            );
        }

        return days;
    };

    if (bookingComplete) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="text-emerald-500" size={40} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
                    <p className="text-gray-600 mb-6">
                        Your appointment has been scheduled for{' '}
                        <span className="font-semibold text-gray-900">
                            {selectedDate?.toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                            })}
                        </span>{' '}
                        at{' '}
                        <span className="font-semibold text-gray-900">
                            {selectedSlot && formatTime(selectedSlot.start_time)}
                        </span>
                    </p>
                    <p className="text-sm text-gray-500">
                        You can close this window and return to Messenger.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
                        <Calendar size={16} />
                        Book an Appointment
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                        Choose Your Preferred Time
                    </h1>
                    <p className="text-gray-600">
                        Select a date and time slot that works best for you
                    </p>
                </div>

                {/* My Appointments Section */}
                {senderPsid && existingAppointments.length > 0 && (
                    <div className="mb-6">
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-3xl p-6 shadow-lg border border-emerald-100">
                            <div className="flex items-center gap-2 mb-4">
                                <CalendarCheck size={20} className="text-emerald-600" />
                                <h2 className="text-lg font-semibold text-gray-900">Your Upcoming Appointments</h2>
                            </div>
                            <div className="space-y-3">
                                {existingAppointments.map((apt) => {
                                    const [year, month, day] = apt.appointment_date.split('-').map(Number);
                                    const aptDate = new Date(year, month - 1, day);

                                    return (
                                        <div
                                            key={apt.id}
                                            className="flex items-center justify-between bg-white rounded-2xl p-4 border border-emerald-100"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                                    <Calendar size={20} className="text-emerald-600" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-900">
                                                        {aptDate.toLocaleDateString('en-US', {
                                                            weekday: 'short',
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })}
                                                    </p>
                                                    <p className="text-sm text-gray-600">
                                                        {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full capitalize">
                                                    {apt.status}
                                                </span>
                                                <button
                                                    onClick={() => handleCancelAppointment(apt.id)}
                                                    disabled={cancellingId === apt.id}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                    title="Cancel appointment"
                                                >
                                                    {cancellingId === apt.id ? (
                                                        <Loader2 className="animate-spin" size={18} />
                                                    ) : (
                                                        <XCircle size={18} />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-gray-500 mt-4 text-center">
                                💡 Dates with existing appointments are highlighted in teal on the calendar
                            </p>
                        </div>
                    </div>
                )}
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Calendar */}
                    <div className="bg-white rounded-3xl p-6 shadow-lg">
                        <div className="flex items-center justify-between mb-6">
                            <button
                                onClick={() =>
                                    setCurrentMonth(
                                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
                                    )
                                }
                                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                <ChevronLeft size={20} className="text-gray-600" />
                            </button>
                            <h2 className="text-lg font-semibold text-gray-900">
                                {currentMonth.toLocaleDateString('en-US', {
                                    month: 'long',
                                    year: 'numeric',
                                })}
                            </h2>
                            <button
                                onClick={() =>
                                    setCurrentMonth(
                                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
                                    )
                                }
                                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                <ChevronRight size={20} className="text-gray-600" />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                                <div
                                    key={day}
                                    className="text-center text-xs font-medium text-gray-500 py-2"
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
                    </div>

                    {/* Time Slots & Form */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-3xl p-6 shadow-lg">
                            <div className="flex items-center gap-2 mb-4">
                                <Clock size={20} className="text-emerald-500" />
                                <h3 className="font-semibold text-gray-900">Available Times</h3>
                            </div>

                            {!selectedDate ? (
                                <p className="text-gray-500 text-center py-8">
                                    Please select a date first
                                </p>
                            ) : loadingSlots ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="animate-spin text-emerald-500" size={24} />
                                </div>
                            ) : error ? (
                                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-4 rounded-xl">
                                    <AlertCircle size={20} />
                                    <span>{error}</span>
                                </div>
                            ) : slots.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">
                                    No available slots for this date
                                </p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                    {slots.map((slot) => (
                                        <button
                                            key={slot.start_time}
                                            onClick={() => slot.available && setSelectedSlot(slot)}
                                            disabled={!slot.available}
                                            className={`
                                                px-3 py-2 rounded-xl text-sm font-medium transition-all
                                                ${!slot.available
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                    : selectedSlot?.start_time === slot.start_time
                                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                                        : 'bg-gray-50 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
                                                }
                                            `}
                                        >
                                            {formatTime(slot.start_time)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Contact Form */}
                        {selectedSlot && (
                            <div className="bg-white rounded-3xl p-6 shadow-lg animate-in slide-in-from-bottom-4">
                                <h3 className="font-semibold text-gray-900 mb-4">Your Details (Optional)</h3>
                                <div className="space-y-4">
                                    <div className="relative">
                                        <User
                                            size={18}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Your Name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full pl-11 text-black pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Mail
                                            size={18}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                        />
                                        <input
                                            type="email"
                                            placeholder="Email Address"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-11 pr-4 text-black py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Phone
                                            size={18}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                                        />
                                        <input
                                            type="tel"
                                            placeholder="Phone Number"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            className="w-full pl-11 pr-4 text-black py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div className="relative">
                                        <MessageSquare
                                            size={18}
                                            className="absolute left-4 top-4 text-gray-400"
                                        />
                                        <textarea
                                            placeholder="Additional notes (optional)"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={3}
                                            className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Summary & Book Button */}
                        {selectedDate && selectedSlot && (
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-3xl p-6 text-white shadow-lg animate-in slide-in-from-bottom-4">
                                <div className="mb-4">
                                    <p className="text-emerald-100 text-sm mb-1">You&apos;re booking:</p>
                                    <p className="text-lg font-semibold">
                                        {selectedDate.toLocaleDateString('en-US', {
                                            weekday: 'long',
                                            month: 'long',
                                            day: 'numeric',
                                        })}
                                    </p>
                                    <p className="text-emerald-100">
                                        {formatTime(selectedSlot.start_time)} - {formatTime(selectedSlot.end_time)}
                                    </p>
                                </div>
                                <button
                                    onClick={handleBooking}
                                    disabled={booking}
                                    className="w-full bg-white text-emerald-600 font-semibold py-4 rounded-2xl hover:bg-emerald-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {booking ? (
                                        <>
                                            <Loader2 className="animate-spin" size={20} />
                                            Booking...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={20} />
                                            Confirm Booking
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
