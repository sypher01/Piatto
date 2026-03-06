import type { Metadata } from 'next';
import ImpostazioniClient from '../../components/ImpostazioniClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Impostazioni | Piatto',
    description: 'Configura scraper, LLM e visualizza le statistiche del database.',
};

export default function ImpostazioniPage() {
    return <ImpostazioniClient />;
}
