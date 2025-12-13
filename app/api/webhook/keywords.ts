// Payment-related keywords to detect
const PAYMENT_KEYWORDS = [
    'payment', 'bayad', 'magbayad', 'pay', 'gcash', 'maya', 'paymaya',
    'bank', 'transfer', 'account', 'qr', 'qr code', 'send payment',
    'how to pay', 'paano magbayad', 'payment method', 'payment option',
    'where to pay', 'saan magbabayad', 'bank details', 'account number',
    'bdo', 'bpi', 'metrobank', 'unionbank', 'landbank', 'pnb',
    'remittance', 'padala', 'deposit', 'magkano', 'price', 'presyo'
];

// Product-related keywords
const PRODUCT_KEYWORDS = [
    'product', 'products', 'item', 'items', 'inventory', 'tinda', 'benta',
    'store', 'shop', 'katalogo', 'catalogue', 'menu', 'list', 'available'
];

// Property-related keywords
const PROPERTY_KEYWORDS = [
    'property', 'properties', 'house', 'bahay', 'lupa', 'lot', 'condo',
    'apartment', 'rent', 'sale', 'studio', 'bedroom', 'model', 'townhouse',
    'investment', 'preselling', 'reopen', 'inventory', 'available'
];

// Check if message is asking about products
export function isProductQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Check for "anong tinda niyo" or "patingin ng products" patterns
    if (lowerMessage.includes('ano') && (lowerMessage.includes('tinda') || lowerMessage.includes('benta'))) return true;
    if (lowerMessage.includes('available') && (lowerMessage.includes('ba') || lowerMessage.includes('kayo'))) return true;

    return PRODUCT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Check if message is asking about properties
export function isPropertyQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Check for "anong property meron" or "house and lot" patterns
    if (lowerMessage.includes('house') && lowerMessage.includes('lot')) return true;
    if (lowerMessage.includes('property') && lowerMessage.includes('list')) return true;

    return PROPERTY_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Check if message is asking about payment methods
export function isPaymentQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return PAYMENT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Appointment-related keywords
const APPOINTMENT_KEYWORDS = [
    'appointment', 'schedule', 'book', 'booking', 'reserve', 'reservation',
    'available', 'slot', 'slots', 'time', 'date', 'calendar', 'meet', 'meeting',
    'consultation', 'consult', 'visit', 'sched', 'magbook', 'magschedule',
    'ibook', 'isched', 'paki-book', 'pakibook', 'set appointment', 'set sched'
];

// Check if message is asking about appointments
export function isAppointmentQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Check for specific patterns
    if (lowerMessage.includes('book') && (lowerMessage.includes('appointment') || lowerMessage.includes('sched'))) return true;
    if (lowerMessage.includes('set') && (lowerMessage.includes('appointment') || lowerMessage.includes('schedule'))) return true;
    if (lowerMessage.includes('available') && (lowerMessage.includes('time') || lowerMessage.includes('slot') || lowerMessage.includes('sched'))) return true;

    return APPOINTMENT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}
