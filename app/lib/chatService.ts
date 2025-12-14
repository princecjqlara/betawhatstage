import OpenAI from 'openai';
import { searchDocuments } from './rag';
import { supabase } from './supabase';
import { getRecentActivities, buildActivityContextForAI, LeadActivity } from './activityTrackingService';
import { getCatalogContext } from './productRagService';
import { getCurrentCart, buildCartContextForAI } from './cartContextService';

const MAX_HISTORY = 10; // Reduced to prevent context overload

// Cache settings to avoid database calls on every request
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSettings: any = null;
let settingsLastRead = 0;
const SETTINGS_CACHE_MS = 60000; // 1 minute cache

// Fetch bot settings from database with caching
async function getBotSettings() {
    const now = Date.now();
    if (cachedSettings && now - settingsLastRead < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching bot settings:', error);
            return { bot_name: 'Assistant', bot_tone: 'helpful and professional', ai_model: 'qwen/qwen3-235b-a22b' };
        }

        cachedSettings = data;
        settingsLastRead = now;
        return data;
    } catch (error) {
        console.error('Error fetching bot settings:', error);
        return { bot_name: 'Assistant', bot_tone: 'helpful and professional', ai_model: 'qwen/qwen3-235b-a22b' };
    }
}

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

// Fetch bot rules from database
async function getBotRules(): Promise<string[]> {
    try {
        const { data: rules, error } = await supabase
            .from('bot_rules')
            .select('rule')
            .eq('enabled', true)
            .order('priority', { ascending: true });

        if (error) {
            console.error('Error fetching bot rules:', error);
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rules?.map((r: any) => r.rule) || [];
    } catch (error) {
        console.error('Error fetching bot rules:', error);
        return [];
    }
}

// Fetch bot instructions from database
async function getBotInstructions(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('bot_instructions')
            .select('instructions')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('Error fetching bot instructions:', error);
            return '';
        }

        return data?.instructions || '';
    } catch (error) {
        console.error('Error fetching bot instructions:', error);
        return '';
    }
}

// Payment-related keywords to detect
const PAYMENT_KEYWORDS = [
    'payment', 'bayad', 'magbayad', 'pay', 'gcash', 'maya', 'paymaya',
    'bank', 'transfer', 'account', 'qr', 'qr code', 'send payment',
    'how to pay', 'paano magbayad', 'payment method', 'payment option',
    'where to pay', 'saan magbabayad', 'bank details', 'account number',
    'bdo', 'bpi', 'metrobank', 'unionbank', 'landbank', 'pnb',
    'remittance', 'padala', 'deposit'
];

// Check if message is asking about payment methods
function isPaymentQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return PAYMENT_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Fetch active payment methods from database
async function getPaymentMethods(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('name, account_name, account_number, instructions, qr_code_url')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error || !data || data.length === 0) {
            console.log('No payment methods found or error:', error);
            return '';
        }

        // Format payment methods for the AI
        let formatted = 'AVAILABLE PAYMENT METHODS:\n';
        data.forEach((pm, index) => {
            formatted += `\n${index + 1}. ${pm.name}`;
            if (pm.account_name) formatted += `\n   Account Name: ${pm.account_name}`;
            if (pm.account_number) formatted += `\n   Account/Number: ${pm.account_number}`;
            if (pm.instructions) formatted += `\n   Instructions: ${pm.instructions}`;
            if (pm.qr_code_url) formatted += `\n   [QR Code Available]`;
        });
        formatted += '\n';

        console.log('[Payment Methods]:', formatted);
        return formatted;
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return '';
    }
}

// Fetch conversation history for a sender (last 20 messages)
async function getConversationHistory(senderId: string): Promise<{ role: string; content: string }[]> {
    try {
        const { data: messages, error } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: true })
            .limit(MAX_HISTORY);

        if (error) {
            console.error('Error fetching conversation history:', error);
            return [];
        }

        return messages || [];
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        return [];
    }
}

// Store a message (fire and forget - don't await)
function storeMessageAsync(senderId: string, role: 'user' | 'assistant', content: string) {
    // Run in background - don't block the response
    (async () => {
        try {
            // Delete oldest if over limit (simple approach - just insert and let periodic cleanup handle it)
            const { error: insertError } = await supabase
                .from('conversations')
                .insert({
                    sender_id: senderId,
                    role,
                    content,
                });

            if (insertError) {
                console.error('Error storing message:', insertError);
            }

            // Cleanup old messages in background
            const { count } = await supabase
                .from('conversations')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', senderId);

            if (count && count > MAX_HISTORY + 5) {
                // Delete oldest ones to get back to MAX_HISTORY
                const { data: oldMessages } = await supabase
                    .from('conversations')
                    .select('id')
                    .eq('sender_id', senderId)
                    .order('created_at', { ascending: true })
                    .limit(count - MAX_HISTORY);

                if (oldMessages && oldMessages.length > 0) {
                    await supabase
                        .from('conversations')
                        .delete()
                        .in('id', oldMessages.map(m => m.id));
                }
            }
        } catch (error) {
            console.error('Error in storeMessage:', error);
        }
    })();
}

// Fetch the latest conversation summary for a sender
export async function getLatestConversationSummary(senderId: string): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('conversation_summaries')
            .select('summary')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            return '';
        }

        return data?.summary || '';
    } catch (error) {
        console.error('Error fetching conversation summary:', error);
        return '';
    }
}

// Generate a new conversation summary (to be called periodically)
export async function generateConversationSummary(senderId: string, leadId?: string): Promise<string | void> {
    console.log(`Generating conversation summary for ${senderId}...`);
    try {
        // 1. Get last 20 messages
        const { data: messages } = await supabase
            .from('conversations')
            .select('role, content')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false }) // Get newest first
            .limit(20);

        if (!messages || messages.length === 0) return;

        // Reverse to chronological order for the AI
        const history = messages.reverse().map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

        // 2. Get recent activities (last 10)
        const recentActivities = await getRecentActivities(senderId, 10);
        const activityContext = buildActivityContextForAI(recentActivities);

        // 3. Get previous summary
        const previousSummary = await getLatestConversationSummary(senderId);

        // Fetch settings for model
        const settings = await getBotSettings();
        const aiModel = settings.ai_model || "qwen/qwen3-235b-a22b";

        // 4. Generate new summary using LLM
        const prompt = `You are an expert conversation summarizer. Your goal is to create a concise but comprehensive summary of the customer's context.

PREVIOUS CONTEXT:
${previousSummary || 'None'}

RECENT ACTIVITY:
${activityContext || 'None'}

RECENT CONVERSATION (Last 20 messages):
${history}

INSTRUCTIONS:
Create a new summary that merges the Previous Context with new information from Recent Conversation and Activity.
Key details to track:
- Customer's name, preferences, budget, and specific interests (products/properties).
- Any questions they asked that are still unresolved.
- Verification status (payments, receipts).
- Tone and sentiment.
- Key milestones (ordered, booked appointment, etc.).

OUTPUT:
Return ONLY the summary text. Do not add "Here is the summary" or other filler.`;

        const completion = await client.chat.completions.create({
            model: aiModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 512,
        });

        const newSummary = completion.choices[0]?.message?.content || '';
        console.log('Generated summary:', newSummary);

        if (newSummary) {
            // 5. Save new summary
            const { error: insertError } = await supabase
                .from('conversation_summaries')
                .insert({
                    sender_id: senderId,
                    summary: newSummary,
                    meta: {
                        messages_analyzed: messages.length,
                        has_lead_id: !!leadId
                    }
                });

            if (insertError) {
                console.error('Error saving conversation summary:', insertError);
                throw insertError;
            }

            console.log('✅ New conversation summary generated and saved.');
        }

        return newSummary;

    } catch (error) {
        console.error('Error generating conversation summary:', error);
        throw error; // Rethrow to allow caller to handle/see it
    }
}

// Image context type for passing image analysis to the chatbot
export interface ImageContext {
    isReceipt: boolean;
    confidence: number;
    details?: string;
    extractedAmount?: string;
    extractedDate?: string;
    imageUrl?: string;
    // Receipt verification fields
    receiverName?: string;
    receiverNumber?: string;
    paymentPlatform?: string;
    verificationStatus?: 'verified' | 'mismatch' | 'unknown';
    verificationDetails?: string;
}

export async function getBotResponse(
    userMessage: string,
    senderId: string = 'web_default',
    imageContext?: ImageContext
): Promise<string> {
    const startTime = Date.now();

    // Read bot configuration from database (cached)
    const settings = await getBotSettings();
    const botName = settings.bot_name || 'Assistant';
    const botTone = settings.bot_tone || 'helpful and professional';

    // Store user message immediately (fire and forget)
    storeMessageAsync(senderId, 'user', userMessage);

    // Check if this is a payment-related query
    const isPaymentRelated = isPaymentQuery(userMessage);
    let paymentMethodsContext = '';
    if (isPaymentRelated) {
        paymentMethodsContext = await getPaymentMethods();
    }

    // Run independent operations in PARALLEL
    const results = await Promise.all([
        getBotRules(),
        getConversationHistory(senderId),
        searchDocuments(userMessage),
        getBotInstructions(),
        getRecentActivities(senderId, 5), // Get last 5 activities for context
        getCatalogContext(), // Get products, properties, payment methods
        getLatestConversationSummary(senderId), // Get long-term context summary
        getCurrentCart(senderId), // Get current cart status
    ]);

    // Deference the promise results correctly (added summary and cart)
    const [rules, history, context, instructions, activities, catalogContext] = results.slice(0, 6) as [string[], { role: string; content: string }[], string, string, LeadActivity[], string];
    const summary = results[6] as string;
    const cart = results[7] as Awaited<ReturnType<typeof getCurrentCart>>;

    console.log(`Parallel fetch took ${Date.now() - startTime}ms - rules: ${rules.length}, history: ${history.length}, activities: ${activities.length}, catalog: ${catalogContext.length} chars, isPaymentQuery: ${isPaymentRelated}, summary len: ${summary.length}, cart items: ${cart?.item_count || 0}`);
    console.log('[RAG CONTEXT]:', context ? context.substring(0, 500) + '...' : 'NO CONTEXT RETRIEVED');


    // Check what's available in the catalog to conditionally enable tools
    const hasProducts = catalogContext && catalogContext.includes('PRODUCT CATALOG:');
    const hasProperties = catalogContext && catalogContext.includes('PROPERTY LISTINGS:');

    // Build dynamic UI TOOLS list
    let uiToolsList = '';
    let examplesList = '';

    if (hasProducts) {
        uiToolsList += `- [SHOW_PRODUCTS] : When user asks to see items/products or looking for recommendations.\n`;
        uiToolsList += `- [SHOW_CART] : When user asks to see their cart, order, or what they've added. Example: "ano na sa cart ko?" / "what's in my cart?"\n`;
        uiToolsList += `- [REMOVE_CART:product_name] : When user wants to REMOVE an item from their cart. Replace "product_name" with the actual product name they want removed.\n`;

        examplesList += `- Example: "Yes, meron kaming available. Check mo dito: [SHOW_PRODUCTS]"\n`;
        examplesList += `- Example: "Okay po, aalisin ko na yan sa cart mo. [REMOVE_CART:Product Name Here]"\n`;
    }

    if (hasProperties) {
        uiToolsList += `- [SHOW_PROPERTIES] : When user asks about houses, lots, or properties for sale/rent.\n`;
        examplesList += `- Example: "Meron kaming available na properties. [SHOW_PROPERTIES]"\n`;
    }

    // General tools always available
    uiToolsList += `- [SHOW_BOOKING] : When user wants to schedule a visit, appointment, or consultation.\n`;
    uiToolsList += `- [SHOW_PAYMENT_METHODS] : When user asks how to pay or asks for bank details.\n`;

    examplesList += `- Example: "Pwede tayo mag-schedule. [SHOW_BOOKING]"`;

    // Build a clear system prompt optimized for Llama 3.1
    let systemPrompt = `You are ${botName}. Your style: ${botTone}.

STYLE: Use Taglish, keep messages short, use 1-2 emojis max.

UI TOOLS (Use these tags when relevant):
${uiToolsList}

IMPORTANT: 
- Answer the user's question FIRST, then add the appropriate tag at the end.
- You can recommend checking products/properties ONLY if they are available and relevant.
${examplesList}

CRITICAL RULES:
- DO NOT generate links like [LINK], [LINK_TO_BOOKING], or any URL. Use the UI TOOLS tags above instead.
- DO NOT sign off your messages (e.g., "WhatStage PH", "Galaxy Coffee"). Just send the message.
- If asking to book/schedule, ALWAYS use [SHOW_BOOKING]. DO NOT say "click this link".
- DO NOT list options if you don't have their specific names. NEVER say "Pwede kang mag-choose: , , ,".
`;

    if (hasProducts) {
        systemPrompt += `
CART REMOVAL DETECTION:
When a customer says things like:
- "wag na po yung..." / "alisin mo na yung..." / "remove..." / "tanggalin..."
- "ayoko na ng..." / "cancel ko yung..."
Use the [REMOVE_CART:product_name] tag with the product name they mentioned.
`;
    }

    systemPrompt += `\n`;

    // Add instructions from database if available
    if (instructions) {
        systemPrompt += `${instructions}

`;
    }

    if (rules.length > 0) {
        systemPrompt += `RULES:\n${rules.join('\n')}\n\n`;
    }

    // Add knowledge base FIRST (HIGHEST PRIORITY)
    if (context && context.trim().length > 0) {
        systemPrompt += `PRIORITY SOURCE - REFERENCE DATA (Knowledge Base):
${context}

IMPORTANT: 
- This is your PRIMARY source of truth. 
- When asked about price/magkano/cost, use the EXACT price above.
- Do NOT make up prices or add details not in the reference data.

`;
    } else {
        systemPrompt += `NOTE: No reference data available. If asked for specific prices or details, say "Ipa-check ko muna sa team."

`;
    }

    // Add product/property catalog context (SECONDARY PRIORITY)
    if (catalogContext && catalogContext.trim().length > 0) {
        systemPrompt += `SECONDARY SOURCE - PRODUCT/PROPERTY CATALOG:
${catalogContext}

IMPORTANT: 
- Use this ONLY if the user explicitly asks about products, properties, or items for sale.
- Do NOT proactively offer products/properties if the user is asking about general topics or from the Reference Data above.
- Use the EXACT prices and details from the catalog above when answering.

`;
    }

    // Add payment methods details for specific questions
    if (paymentMethodsContext) {
        systemPrompt += `${paymentMethodsContext}

INSTRUCTION FOR PAYMENT QUERIES:
- Explain the options briefly if asked.
- Add [SHOW_PAYMENT_METHODS] tag to show the full list UI.

`;
    }

    // Add Long-Term Context Summary (Memory)
    if (summary && summary.trim().length > 0) {
        systemPrompt += `LONG TERM MEMORY (Customer Context):
${summary}

IMPORTANT: Use this context to remember what the customer previously said, their name, preferences, and past actions.
`;
    }


    // Add customer activity history context
    const activityContext = buildActivityContextForAI(activities);
    if (activityContext) {
        systemPrompt += `${activityContext}
`;
    }

    // Add current cart context
    const cartContext = buildCartContextForAI(cart);
    if (cartContext) {
        systemPrompt += `${cartContext}
`;
    }

    // Add image context if customer sent an image
    if (imageContext) {
        systemPrompt += `IMAGE ANALYSIS (Customer sent an image):
`;
        if (imageContext.isReceipt && imageContext.confidence >= 0.7) {
            systemPrompt += `- This appears to be a RECEIPT/PROOF OF PAYMENT (${Math.round(imageContext.confidence * 100)}% confidence)
`;
            if (imageContext.details) {
                systemPrompt += `- Details: ${imageContext.details}
`;
            }
            if (imageContext.extractedAmount) {
                systemPrompt += `- Amount shown: ${imageContext.extractedAmount}
`;
            }
            if (imageContext.extractedDate) {
                systemPrompt += `- Date: ${imageContext.extractedDate}
`;
            }
            if (imageContext.receiverName) {
                systemPrompt += `- Receiver Name: ${imageContext.receiverName}
`;
            }
            if (imageContext.receiverNumber) {
                systemPrompt += `- Receiver Number: ${imageContext.receiverNumber}
`;
            }
            if (imageContext.paymentPlatform) {
                systemPrompt += `- Platform: ${imageContext.paymentPlatform}
`;
            }

            // Add verification status
            if (imageContext.verificationStatus === 'verified') {
                systemPrompt += `
✅ PAYMENT VERIFIED: ${imageContext.verificationDetails}

INSTRUCTION: The payment details MATCH our records! Thank the customer warmly, confirm the payment is verified and correct. Let them know their order will be processed. Be enthusiastic and appreciative!

`;
            } else if (imageContext.verificationStatus === 'mismatch') {
                systemPrompt += `
⚠️ PAYMENT MISMATCH: ${imageContext.verificationDetails}

INSTRUCTION: Politely inform the customer that the payment details don't match our records. Ask them to double-check if they sent to the correct account. Provide our correct payment details (use [SHOW_PAYMENT_METHODS] if helpful). Be helpful and understanding - maybe they made an honest mistake.

`;
            } else {
                systemPrompt += `
INSTRUCTION: Thank the customer for their payment proof. Confirm you received it and will process it. Be warm and appreciative.

`;
            }
        } else if (imageContext.isReceipt) {
            systemPrompt += `- This might be a receipt but confidence is low (${Math.round(imageContext.confidence * 100)}%)
`;
            if (imageContext.details) {
                systemPrompt += `- What I see: ${imageContext.details}
`;
            }
            systemPrompt += `
INSTRUCTION: Politely ask the customer if this is their payment proof. If the image is unclear, ask them to resend a clearer photo.

`;
        } else {
            systemPrompt += `- This does NOT appear to be a receipt (${Math.round(imageContext.confidence * 100)}% confidence)
`;
            if (imageContext.details) {
                systemPrompt += `- What I see: ${imageContext.details}
`;
            }
            systemPrompt += `
INSTRUCTION: Respond naturally about the image. If they might be trying to send payment proof, guide them on what to send.

`;
        }
    }

    // Build messages array with history
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of history) {
        messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    try {
        const llmStart = Date.now();

        // Use selected model or default to Qwen
        const aiModel = settings.ai_model || "qwen/qwen3-235b-a22b";

        // Prepare completion options
        const completionOptions: OpenAI.Chat.ChatCompletionCreateParams & { chat_template_kwargs?: { thinking: boolean } } = {
            model: aiModel,
            messages,
            temperature: 0.3,
            top_p: 0.7,
            max_tokens: 1024,
            stream: true,
        };

        // Add DeepSeek specific options if selected
        if (aiModel.includes('deepseek')) {
            completionOptions.chat_template_kwargs = { "thinking": true };
            completionOptions.max_tokens = 8192; // DeepSeek supports larger context
        }

        const stream = await client.chat.completions.create(completionOptions as OpenAI.Chat.ChatCompletionCreateParams) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

        let responseContent = '';
        let reasoningContent = '';

        // Process the stream
        for await (const chunk of stream) {
            // Collect reasoning (thinking) content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reasoning = (chunk.choices[0]?.delta as any)?.reasoning_content;
            if (reasoning) {
                reasoningContent += reasoning;
            }

            // Collect actual response content
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                responseContent += content;
            }
        }

        console.log(`LLM call took ${Date.now() - llmStart} ms`);
        if (reasoningContent) {
            console.log('Reasoning:', reasoningContent.substring(0, 200) + '...');
        }

        // Handle empty responses with a fallback
        if (!responseContent || responseContent.trim() === '') {
            console.warn('Empty response from LLM, using fallback');
            const fallback = "Pasensya na po, may technical issue. Pwede po ba ulitin ang tanong niyo?";
            storeMessageAsync(senderId, 'assistant', fallback);
            return fallback;
        }

        // Store bot response (fire and forget)
        storeMessageAsync(senderId, 'assistant', responseContent);

        console.log(`Total response time: ${Date.now() - startTime} ms`);
        return responseContent;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("Error calling NVIDIA API:", error.response?.data || error.message || error);
        return "Pasensya na po, may problema sa connection. Subukan ulit mamaya.";
    }
}
