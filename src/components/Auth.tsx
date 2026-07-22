import { useState, type FormEvent } from "react";
import { dataStore } from "../data";

export function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [create, setCreate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await dataStore.signIn(
        String(data.get("email")),
        String(data.get("password")),
        create,
      );
      onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand-mark">T</div>
        <p className="eyebrow">TAP-TO-TRACK</p>
        <h1>Notice every learner.</h1>
        <p>
          A calm classroom dashboard for attendance, participation, skills, and
          quiet requests.
        </p>
        <div className="story-card">
          <span>Today, 9:42</span>
          <strong>“I caught three voices I might have missed.”</strong>
        </div>
      </section>
      <section className="auth-panel">
        <form className="card auth-card" onSubmit={submit}>
          <p className="eyebrow">TEACHER SPACE</p>
          <h2>{create ? "Create your account" : "Welcome back"}</h2>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@school.org"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete={create ? "new-password" : "current-password"}
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "One moment…" : create ? "Create account" : "Sign in"}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setCreate(!create)}
          >
            {create
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
        </form>
      </section>
    </main>
  );
}
