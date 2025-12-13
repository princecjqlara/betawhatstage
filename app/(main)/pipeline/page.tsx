import { supabase } from '@/app/lib/supabase';
import PipelineClient from './components/PipelineClient';

// Force dynamic rendering for fresh data on each request
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Lead {
    id: string;
    sender_id: string;
    name: string | null;
    phone: string | null;
    message_count: number;
    last_message_at: string | null;
    ai_classification_reason: string | null;
    current_stage_id: string | null;
}

interface Stage {
    id: string;
    name: string;
    display_order: number;
    color: string;
    leads: Lead[];
}

async function getPipelineData(): Promise<{ stages: Stage[] }> {
    const { data: stages, error: stagesError } = await supabase
        .from('pipeline_stages')
        .select('*')
        .order('display_order', { ascending: true });

    if (stagesError) {
        console.error('Error fetching stages:', stagesError);
        return { stages: [] };
    }

    const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .order('last_message_at', { ascending: false });

    if (leadsError) {
        console.error('Error fetching leads:', leadsError);
        return { stages: stages?.map(s => ({ ...s, leads: [] })) || [] };
    }

    const stagesWithLeads: Stage[] = stages?.map(stage => ({
        ...stage,
        leads: leads?.filter(lead => lead.current_stage_id === stage.id) || [],
    })) || [];

    return { stages: stagesWithLeads };
}

export default async function PipelinePage() {
    const { stages } = await getPipelineData();

    return (
        <div className="h-full w-full bg-white">
            <PipelineClient initialStages={stages} />
        </div>
    );
}
