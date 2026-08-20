"use client";

/**
 * Last resort: the shell itself failed, so there is no layout, no theme tokens
 * and no component library to lean on. Everything here is inline and literal on
 * purpose — this file has to render when nothing else does.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "#17131a",
          color: "#f4f0f6",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "34rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Zolvora couldn&apos;t start</h1>
          <p style={{ margin: "0 0 1rem", lineHeight: 1.5, color: "#c8bed0" }}>
            Something failed before the app could load. Reloading usually fixes it. If it doesn&apos;t,
            send us the text below.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#221c25",
              border: "1px solid #3a3040",
              borderRadius: "0.75rem",
              padding: "0.75rem",
              fontSize: "0.875rem",
              margin: "0 0 1rem",
            }}
          >
            {error.message || "No message was provided."}
            {error.digest ? `\n\nDigest: ${error.digest}` : ""}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "2.75rem",
              padding: "0 1.25rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#e0479b",
              color: "#1a0a12",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
