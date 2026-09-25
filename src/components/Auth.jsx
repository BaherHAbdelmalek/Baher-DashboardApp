import { useState } from "react";
import { supabase } from "../supabaseClient";
import { styles } from "../styles";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

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
        const { error: err } = await supabase.auth.resetPasswordForEmail(email);
        if (err) throw err;
        setNotice("Password reset email sent — check your inbox.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.authWrap}>
      <div style={styles.authCard}>
        <div style={styles.authTitle}>
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
        </div>
        <div style={styles.authSub}>
          {mode === "signin" && "Tasks, meetings, and reminders synced across your devices."}
          {mode === "signup" && "Your data stays private to your account."}
          {mode === "reset" && "We'll email you a link to reset it."}
        </div>

        <form onSubmit={handleSubmit}>
          <input
            style={styles.authField}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {mode !== "reset" && (
            <input
              style={styles.authField}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          )}
          {error && <div style={styles.authError}>{error}</div>}
          <button style={styles.authBtn} type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </button>
        </form>

        {notice && <div style={styles.authNotice}>{notice}</div>}

        <div style={styles.authSwitch}>
          {mode === "signin" && (
            <>
              No account?{" "}
              <span style={styles.authLink} onClick={() => { setMode("signup"); setError(null); setNotice(null); }}>
                Sign up
              </span>{" "}
              ·{" "}
              <span style={styles.authLink} onClick={() => { setMode("reset"); setError(null); setNotice(null); }}>
                Forgot password?
              </span>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <span style={styles.authLink} onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>
                Sign in
              </span>
            </>
          )}
          {mode === "reset" && (
            <span style={styles.authLink} onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>
              Back to sign in
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
