import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
            width: 98,
            height: 21,
            background: '#f97316',
            borderRadius: '6px 6px 0 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 28,
              height: 7,
              background: '#ea6c0a',
              borderRadius: 2,
            }}
          />
        </div>
        {/* Body */}
        <div
          style={{
            width: 98,
            height: 77,
            background: '#fb923c',
            borderRadius: '0 0 6px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 21,
              height: 42,
              background: '#ea6c0a',
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </div>,
    { ...size }
  )
}
