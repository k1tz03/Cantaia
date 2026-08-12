"use client";

// Connexion au Hub Perso — Supabase Auth (email/mot de passe ou lien magique).
// Utilise le MÊME projet Supabase que Cantaia : ton compte existant fonctionne.

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Loader2, AlertTriangle, Mail, KeyRound, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signInWithPassword() {
    if (!email.trim() || !password) {
      setError("Email et mot de passe requis");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError("Identifiants incorrects");
        return;
      }
      const redirectTo = searchParams.get("redirectTo") || "/";
      router.replace(redirectTo.startsWith("/") ? redirectTo : "/");
      router.refresh();
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) {
      setError("Saisissez votre email");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + "/" },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      setInfo("Lien de connexion envoyé — vérifiez votre boîte mail.");
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2.5 text-[13px] text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F0F11] p-6">
      <div className="w-full max-w-sm rounded-xl border border-[#27272A] bg-[#18181B] p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C]">
          <Lock className="h-6 w-6 text-white" />
        </div>
        <h1 className="mt-4 text-center font-display text-lg font-bold text-[#FAFAFA]">
          Hub Perso
        </h1>
        <p className="mt-1 text-center text-[12px] text-[#71717A]">
          Espace privé — connexion requise
        </p>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") signInWithPassword();
            }}
            placeholder="Mot de passe"
            autoComplete="current-password"
            className={inputClass}
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-[#EF4444]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
          {info && (
            <div className="flex items-center gap-2 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-2 text-[12px] text-[#10B981]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {info}
            </div>
          )}

          <button
            onClick={signInWithPassword}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] py-2.5 text-[13px] font-semibold text-white hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Se connecter
          </button>
          <button
            onClick={sendMagicLink}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#27272A] bg-[#0F0F11] py-2.5 text-[13px] font-medium text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#D4D4D8] disabled:opacity-50 transition-colors"
          >
            <Mail className="h-4 w-4" />
            Recevoir un lien magique
          </button>
        </div>
      </div>
    </div>
  );
}
