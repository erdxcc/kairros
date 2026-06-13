/**
 * Placeholder landing page. The merchant dashboard UI is built in Phase 3;
 * until then this app exists to serve the REST API under /api/v1.
 */
export default function Home() {
    return (
        <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 640 }}>
            <h1>kairos</h1>
            <p>Open-source merchant billing layer for the native Solana Subscriptions program.</p>
            <p>
                The REST API is live under <code>/api/v1</code>. The merchant dashboard arrives in the next
                phase.
            </p>
        </main>
    );
}
