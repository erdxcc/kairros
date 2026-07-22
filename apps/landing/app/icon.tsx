import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Generated favicon: the accent tile from the logo mark, with a "k". */
export default function Icon() {
    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '7px',
                background: '#7c6cff',
                color: '#0a0a0e',
                fontSize: '22px',
                fontWeight: 700,
                fontFamily: 'sans-serif',
            }}
        >
            k
        </div>,
        { ...size },
    );
}
