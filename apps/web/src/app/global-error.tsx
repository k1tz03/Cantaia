"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <h2>Erreur critique</h2>
            <p>{error.message}</p>
            <button onClick={reset} style={{ padding: "0.5rem 1rem", marginTop: "1rem", cursor: "pointer" }}>
              Recharger
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
