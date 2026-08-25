"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

/**
 * Root error boundary. It renders its own <html>/<body>, so it gets no
 * global stylesheet and every colour has to be inline — hence the literal
 * design-system hexes rather than Tailwind classes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const font = "Plus Jakarta Sans, Inter, system-ui, sans-serif";

  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0F0F11",
            padding: "1rem",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#18181B",
              border: "1px solid #27272A",
              borderRadius: "12px",
              padding: "1.5rem",
              fontFamily: font,
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "999px",
                background: "rgba(239,68,68,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1rem",
                color: "#EF4444",
                fontSize: "20px",
              }}
              aria-hidden="true"
            >
              !
            </div>

            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#FAFAFA",
                margin: "0 0 0.5rem",
              }}
            >
              Une erreur est survenue
            </h2>
            <p
              style={{
                color: "#A1A1AA",
                fontSize: "0.8125rem",
                lineHeight: 1.6,
                margin: "0 0 1.5rem",
              }}
            >
              Notre équipe a été notifiée automatiquement. Vous pouvez réessayer&nbsp;;
              si le problème persiste, contactez le support.
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                onClick={reset}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#F97316",
                  color: "#0F0F11",
                  borderRadius: "0.5rem",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  fontFamily: font,
                }}
              >
                Réessayer
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "transparent",
                  color: "#D4D4D8",
                  borderRadius: "0.5rem",
                  border: "1px solid #27272A",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  fontFamily: font,
                }}
              >
                Retour à l&apos;accueil
              </button>
            </div>

            <div
              style={{
                marginTop: "1.25rem",
                borderTop: "1px solid #27272A",
                paddingTop: "0.75rem",
              }}
            >
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "#A1A1AA",
                  fontSize: "0.6875rem",
                  cursor: "pointer",
                  fontFamily: font,
                }}
              >
                {showDetails ? "▾" : "▸"} Détails techniques
              </button>
              {showDetails && (
                <pre
                  style={{
                    marginTop: "0.5rem",
                    maxHeight: "10rem",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#0F0F11",
                    borderRadius: "0.5rem",
                    padding: "0.75rem",
                    color: "#A1A1AA",
                    fontSize: "0.6875rem",
                    lineHeight: 1.6,
                    fontFamily: "JetBrains Mono, ui-monospace, monospace",
                  }}
                >
                  {error.message || "Erreur inconnue"}
                  {error.digest ? `\n\nDigest : ${error.digest}` : ""}
                </pre>
              )}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
