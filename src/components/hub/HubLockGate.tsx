"use client";

// Verrou renforcé du Hub Perso.
// <HubLockGate> : n'affiche ses enfants que si le hub est déverrouillé
// (écran PIN sinon). <HubLockManager> : bouton de gestion du verrou
// (activer / changer / désactiver / verrouiller maintenant).

import { useCallback, useEffect, useState } from "react";
import { Lock, Loader2, ShieldCheck, AlertTriangle, X, Unlock } from "lucide-react";

interface LockStatus {
  pinEnabled: boolean;
  unlocked: boolean;
  lockedUntil: string | null;
}

export function HubLockGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LockStatus | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/lock");
      if (!res.ok) {
        // 401/403 gérés par la page elle-même — on laisse passer
        setStatus({ pinEnabled: false, unlocked: true, lockedUntil: null });
        return;
      }
      const data = await res.json();
      setStatus({
        pinEnabled: !!data.pinEnabled,
        unlocked: !!data.unlocked,
        lockedUntil: data.lockedUntil || null,
      });
    } catch {
      setStatus({ pinEnabled: false, unlocked: true, lockedUntil: null });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleVerify() {
    if (!/^\d{6}$/.test(pin)) {
      setError("Le PIN doit contenir 6 chiffres");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/hub/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.code === "RATE_LIMITED"
            ? "Trop de tentatives — réessayez dans 15 minutes"
            : data.error || "PIN incorrect"
        );
        setPin("");
        return;
      }
      setPin("");
      setStatus((s) => (s ? { ...s, unlocked: true } : s));
    } catch {
      setError("Erreur réseau");
    } finally {
      setVerifying(false);
    }
  }

  if (!status) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#0F0F11] p-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
      </div>
    );
  }

  if (status.pinEnabled && !status.unlocked) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#0F0F11] p-8">
        <div className="w-full max-w-sm rounded-xl border border-[#27272A] bg-[#18181B] p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C]">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-4 font-display text-lg font-bold text-[#FAFAFA]">Hub verrouillé</h1>
          <p className="mt-1 text-[13px] text-[#71717A]">
            Saisissez votre PIN à 6 chiffres pour accéder à votre espace privé.
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            className="mt-5 w-full rounded-lg border border-[#27272A] bg-[#0F0F11] py-3 text-center font-mono text-2xl tracking-[0.5em] text-[#FAFAFA] outline-none focus:border-[#F97316]/60"
            placeholder="••••••"
          />
          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-left text-[12px] text-[#EF4444]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
          <button
            onClick={handleVerify}
            disabled={verifying || pin.length !== 6}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] py-2.5 text-[13px] font-semibold text-white hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
            Déverrouiller
          </button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#52525B]">
            <ShieldCheck className="h-3 w-3" />
            Session déverrouillée pendant 30 minutes
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function HubLockManager() {
  const [pinEnabled, setPinEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"setup" | "disable">("setup");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/hub/lock")
      .then((r) => r.json())
      .then((d) => setPinEnabled(!!d.pinEnabled))
      .catch(() => setPinEnabled(false));
  }, []);

  async function lockNow() {
    await fetch("/api/hub/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lock" }),
    }).catch(() => {});
    window.location.reload();
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload =
        mode === "disable"
          ? { action: "disable", pin: currentPin }
          : pinEnabled
            ? { action: "setup", pin: newPin, current_pin: currentPin }
            : { action: "setup", pin: newPin };
      const res = await fetch("/api/hub/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec");
        return;
      }
      setPinEnabled(mode !== "disable");
      setOpen(false);
      setCurrentPin("");
      setNewPin("");
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-[#FAFAFA] outline-none focus:border-[#F97316]/50";

  return (
    <>
      <div className="flex items-center gap-2">
        {pinEnabled && (
          <button
            onClick={lockNow}
            className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-[12px] font-medium text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#D4D4D8] transition-colors"
            title="Verrouiller le hub maintenant"
          >
            <Lock className="h-3.5 w-3.5" />
            Verrouiller
          </button>
        )}
        <button
          onClick={() => {
            setMode("setup");
            setOpen(true);
            setError(null);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-[12px] font-medium text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#D4D4D8] transition-colors"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {pinEnabled ? "Modifier le PIN" : "Activer le verrou"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-xl border border-[#27272A] bg-[#18181B] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[#FAFAFA]">
                {mode === "disable" ? "Désactiver le verrou" : pinEnabled ? "Modifier le PIN" : "Activer le verrou PIN"}
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-[#71717A] hover:bg-[#27272A]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {(pinEnabled || mode === "disable") && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#71717A]">PIN actuel</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                    className={inputClass}
                    placeholder="••••••"
                  />
                </div>
              )}
              {mode === "setup" && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#71717A]">
                    {pinEnabled ? "Nouveau PIN (6 chiffres)" : "PIN (6 chiffres)"}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    className={inputClass}
                    placeholder="••••••"
                  />
                </div>
              )}
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-[#EF4444]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
              <button
                onClick={submit}
                disabled={saving || (mode === "setup" && newPin.length !== 6)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] py-2 text-[13px] font-semibold text-white hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {mode === "disable" ? "Désactiver" : "Enregistrer"}
              </button>
              {pinEnabled && mode === "setup" && (
                <button
                  onClick={() => {
                    setMode("disable");
                    setError(null);
                  }}
                  className="w-full text-center text-[11px] text-[#71717A] hover:text-[#EF4444] transition-colors"
                >
                  Désactiver le verrou PIN
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
