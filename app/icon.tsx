import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Box body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {/* Lid */}
        <div
          style={{
            width: 280,
            height: 60,
            background: '#f97316',
            borderRadius: '16px 16px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 80,
              height: 20,
              background: '#ea6c0a',
              borderRadius: 4,
            }}
          />
        </div>
        {/* Body */}
        <div
          style={{
            width: 280,
            height: 220,
            background: '#fb923c',
            borderRadius: '0 0 16px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 60,
              height: 120,
              background: '#ea6c0a',
              borderRadius: 6,
            }}
          />
        </div>
      </div>
    </div>,
    { ...size }
  )
}
