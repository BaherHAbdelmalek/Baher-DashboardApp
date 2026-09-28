import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  function go(next) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setNotice("Account created. Check your email to confirm it, then sign in.");
      } else if (mode === "reset") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (err) throw err;
        setNotice("Password reset email sent — check your inbox.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password";

  return (
    <main className="auth">
      <div className="auth__card">
        <h1 className="auth__title">{heading}</h1>
        <p className="auth__sub">
          {mode === "signin" && "Tasks, meetings, and reminders synced across your devices."}
          {mode === "signup" && "Your data stays private to your account."}
          {mode === "reset" && "We'll email you a link to reset it."}
        </p>

        <form onSubmit={handleSubmit} className="auth__form">
          <input
            className="field"
            type="email"
            name="email"
            placeholder="Email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck="false"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            required
          />
          {mode !== "reset" && (
            <input
              className="field"
              type="password"
              name="password"
              placeholder="Password"
              // Tells iOS/Android password managers which flow this is, so they
              // offer to save a new password instead of autofilling the old one.
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
              minLength={6}
              required
            />
          )}
          {error && <div className="banner banner--error" role="alert">{error}</div>}
          <button className="btn btn--primary auth__submit" type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </button>
        </form>

        {notice && <div className="banner banner--info" role="status" style={{ marginTop: 14, marginBottom: 0 }}>{notice}</div>}

        <div className="auth__switch">
          {mode === "signin" && (
            <>
              No account? <button type="button" className="auth__link" onClick={() => go("signup")}>Sign up</button>
              {" · "}
              <button type="button" className="auth__link" onClick={() => go("reset")}>Forgot password?</button>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button type="button" className="auth__link" onClick={() => go("signin")}>Sign in</button>
            </>
          )}
          {mode === "reset" && (
            <button type="button" className="auth__link" onClick={() => go("signin")}>Back to sign in</button>
          )}
        </div>
      </div>
    </main>
  );
}
