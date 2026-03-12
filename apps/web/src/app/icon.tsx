import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0A1F30, #1E3A5F)",
          borderRadius: 6,
          fontSize: 20,
          fontWeight: 800,
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
