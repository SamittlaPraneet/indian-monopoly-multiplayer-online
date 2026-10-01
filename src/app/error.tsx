"use client";
export default function ErrorView({ reset }: { reset: () => void }) {
  return (
    <main className="shell">
      <h1>Something interrupted the game view.</h1>
      <p>Your online room remains on the server.</p>
      <button onClick={reset}>Reconnect view</button>
    </main>
  );
}
