import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Cantaia — AI-powered construction management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0A1F30 0%, #1E3A5F 50%, #2563EB 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo / Brand name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 20,
              fontSize: 36,
              fontWeight: 800,
              color: "white",
            }}
          >
            C
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: "white",
              letterSpacing: "-1px",
            }}
          >
            Cantaia
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.85)",
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          L'IA au service du chantier
        </div>

        {/* Features pills */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 24,
          }}
        >
          {["Soumissions CFC", "Triage Email IA", "PV automatiques", "Estimation prix"].map((f) => (
            <div
              key={f}
              style={{
                padding: "10px 20px",
                borderRadius: 50,
                background: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 16,
                fontWeight: 500,
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {f}
            </div>
          ))}
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            color: "rgba(255,255,255,0.5)",
            fontSize: 18,
          }}
        >
          cantaia.ch
        </div>
      </div>
    ),
    { ...size },
  );
}
