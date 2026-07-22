import { site } from '@/lib/site';
import { ImageResponse } from 'next/og';

export const alt = site.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Generated Open Graph image (no external assets): dark canvas, accent mark,
 * and the same headline the hero leads with.
 */
export default function OpengraphImage() {
    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '80px',
                background: 'radial-gradient(1200px 600px at 18% -10%, #1a1140 0%, #0a0a0e 55%)',
                color: '#ededf1',
                fontFamily: 'sans-serif',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                    style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: '#7c6cff',
                    }}
                />
                <div style={{ fontSize: '34px', letterSpacing: '-0.02em' }}>kairos</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div
                    style={{
                        fontSize: '76px',
                        lineHeight: 1.05,
                        letterSpacing: '-0.03em',
                        maxWidth: '900px',
                    }}
                >
                    Subscriptions that settle on-chain.
                </div>
                <div style={{ fontSize: '30px', color: '#9b9baa' }}>
                    Capped and revocable for payers. Automatic and observable for merchants.
                </div>
            </div>
        </div>,
        { ...size },
    );
}
