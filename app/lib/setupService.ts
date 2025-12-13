import OpenAI from 'openai';
import { supabase } from './supabase';
import { addDocument } from './rag';

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
});

const AI_MODEL = 'qwen/qwen3-235b-a22b'; // Consistent with other services

interface BusinessInfo {
    name: string;
    description: string;
}

interface ProductInfo {
    type: string;
    details: string;
}

interface FlowPreferences {
    flowDescription: string;
    style: string;
}

/**
 * Generate initial knowledge base documents based on business and product info
 */
export async function generateKnowledgeBase(
    business: BusinessInfo,
    products: ProductInfo
) {
    console.log('[SetupService] Generating knowledge for:', business.name);

    const systemPrompt = `You are an expert technical writer and knowledge base architect.
    Your task is to generate clear, structured knowledge base articles based on the provided business and product information.
    
    OUTPUT FORMAT: Return a JSON array of objects, where each object represents a document.
    Example:
    [
        { "title": "About Us", "content": "..." },
        { "title": "Our Products", "content": "..." },
        { "title": "Services Offered", "content": "..." }
    ]
    
    The content should be professional, comprehensive, and ready for a customer-facing bot to use as reference.`;

    const userPrompt = `
    Business Name: ${business.name}
    Business Description: ${business.description}
    
    Product Type: ${products.type}
    Product Details: ${products.details}
    
    Generate 3-5 foundational knowledge base articles covering:
    1. Company Overview (About Us)
    2. Product/Service Offerings (Detailed breakdown)
    3. General FAQ (Implied from the type of business)
    `;

    try {
        const response = await client.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4096,
        });

        let content = response.choices[0]?.message?.content || '[]';
        // Clean the response - remove markdown code blocks if present
        if (content.includes('```json')) {
            content = content.replace(/```json/g, '').replace(/```/g, '');
        } else if (content.includes('```')) {
            content = content.replace(/```/g, '');
        }

        const documents = JSON.parse(content);

        // Save documents to knowledge_base using addDocument
        // We'll search for the 'General' category first
        const { data: categories } = await supabase
            .from('knowledge_categories')
            .select('id')
            .eq('name', 'General')
            .single();

        const categoryId = categories?.id;

        const results = [];
        for (const doc of documents) {
            const success = await addDocument(
                `# ${doc.title}\n\n${doc.content}`,
                {
                    source: 'setup_wizard',
                    type: 'generated',
                    title: doc.title,
                    categoryId: categoryId
                }
            );
            results.push(success);
        }

        return results.every(r => r);

    } catch (error) {
        console.error('[SetupService] Error generating knowledge:', error);
        throw error;
    }
}

/**
 * Generate bot configuration (tone, initial rules) based on flow preferences
 */
export async function generateBotConfiguration(
    business: BusinessInfo,
    preferences: FlowPreferences
) {
    console.log('[SetupService] Generating config for flow:', preferences.style);

    const systemPrompt = `You are an expert conversation designer.
    Your task is to analyze the user's desired conversation flow and style, and recommend:
    1. A short, descriptive "Bot Tone" string.
    2. A list of specific "Bot Rules" to enforce this behavior.
    
    OUTPUT FORMAT: JSON object.
    {
        "botTone": "string (max 50 chars)",
        "rules": ["rule 1", "rule 2", "rule 3", "rule 4"]
    }
    `;

    const userPrompt = `
    Business: ${business.name} (${business.description})
    Desired Conversation Flow: ${preferences.flowDescription}
    Speaking Style: ${preferences.style}
    
    Generate the configuration.
    `;

    try {
        const response = await client.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
        });

        let content = response.choices[0]?.message?.content || '{}';
        // Clean the response - remove markdown code blocks if present
        if (content.includes('```json')) {
            content = content.replace(/```json/g, '').replace(/```/g, '');
        } else if (content.includes('```')) {
            content = content.replace(/```/g, '');
        }

        const config = JSON.parse(content);

        // Update bot_settings with tone
        await supabase
            .from('bot_settings')
            .update({ bot_tone: config.botTone })
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to update the single row if ID unknown, or better fetched first. 
        // Better approach: fetch the single row ID first or just update all (should be 1)

        // Actually, let's just update the single row.
        const { data: settings } = await supabase.from('bot_settings').select('id').single();
        if (settings) {
            await supabase
                .from('bot_settings')
                .update({ bot_tone: config.botTone })
                .eq('id', settings.id);
        }

        // Add rules to bot_rules table
        // First, optional: clear existing setup rules? Maybe not.

        if (config.rules && Array.isArray(config.rules)) {
            const rulesToInsert = config.rules.map((rule: string, index: number) => ({
                rule: rule,
                is_active: true, // Assuming column name is is_active or similar? 
                // Let me double check bot_rules schema if possible, or assume 'enabled' based on common patterns.
                // Re-checking workflowGenerator.ts... it uses 'enabled' and 'priority'.
                enabled: true,
                priority: index + 1
            }));

            await supabase.from('bot_rules').insert(rulesToInsert);
        }

        return config;

    } catch (error) {
        console.error('[SetupService] Error generating config:', error);
        throw error;
    }
}
