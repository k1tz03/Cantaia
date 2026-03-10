"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
          <div style={{ textAlign: "center", padding: "2rem", maxWidth: "400px" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#111827", marginBottom: "1rem", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              Une erreur est survenue
            </h2>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              Notre équipe a été notifiée automatiquement.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#1E3A5F",
                color: "white",
                borderRadius: "0.5rem",
                border: "none",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontFamily: "Plus Jakarta Sans, sans-serif",
              }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
