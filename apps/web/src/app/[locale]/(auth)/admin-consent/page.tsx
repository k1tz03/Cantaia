"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import {
  Shield,
  Copy,
  Check,
  ExternalLink,
  Mail,
  HelpCircle,
} from "lucide-react";

const SCOPES = [
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "User.Read",
  "offline_access",
  "openid",
  "email",
  "profile",
];

const SCOPE_DESCRIPTIONS: Record<string, { fr: string; why: string }> = {
  "Mail.Read": {
    fr: "Lire vos emails",
    why: "Synchroniser et classer vos emails par projet",
  },
  "Mail.ReadWrite": {
    fr: "Gérer vos emails",
    why: "Déplacer et archiver les emails classifiés",
  },
  "Mail.Send": {
    fr: "Envoyer des emails",
    why: "Répondre aux emails et envoyer des demandes de prix",
  },
  "User.Read": {
    fr: "Lire votre profil",
    why: "Récupérer votre nom et email pour le compte",
  },
  "offline_access": {
    fr: "Accès hors-ligne",
    why: "Garder la connexion active sans re-demander le mot de passe",
  },
  "openid": {
    fr: "Authentification",
    why: "Vérifier votre identité de manière sécurisée",
  },
  "email": {
    fr: "Adresse email",
    why: "Identifier votre compte Cantaia",
  },
  "profile": {
    fr: "Informations de profil",
    why: "Pré-remplir votre nom dans l'application",
  },
};

export default function AdminConsentPage() {
  const [copied, setCopied] = useState(false);
  const [showScopes, setShowScopes] = useState(false);
  const [adminConsentUrl, setAdminConsentUrl] = useState("");

  useEffect(() => {
    fetch("/api/auth/admin-consent-url")
      .then((r) => r.json())
      .then((data) => {
        if (data.url) setAdminConsentUrl(data.url);
      })
      .catch(() => {});
  }, []);

  // Build email template for IT admin
  const emailSubject = encodeURIComponent(
    "Demande d'approbation — Application Cantaia (gestion de chantier)",
  );
  const emailBody = encodeURIComponent(
    `Bonjour,

Je souhaite utiliser l'application Cantaia (cantaia.io) pour la gestion de mes projets de construction. Cette application nécessite une approbation administrateur pour se connecter à Microsoft 365.

Cantaia est une application de gestion de chantier certifiée qui utilise les permissions Microsoft suivantes :
- Lecture et gestion des emails (classification automatique par projet)
- Envoi d'emails (réponses et demandes de prix)
- Lecture du profil utilisateur (identification)

Lien d'approbation administrateur :
${adminConsentUrl}

En cliquant sur ce lien, vous pourrez approuver l'application pour notre organisation. L'approbation est sécurisée et révocable à tout moment depuis le portail Azure AD.

Plus d'informations sur l'application : https://cantaia.io
Politique de confidentialité : https://cantaia.io/fr/legal/privacy

Merci pour votre aide.
Cordialement`,
  );

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-4">
          <Shield className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Approbation administrateur requise
        </h1>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          Votre organisation Microsoft 365 nécessite l&apos;approbation d&apos;un
          administrateur IT pour autoriser Cantaia.
        </p>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {/* Step 1 */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm shrink-0">
              1
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">
                Copiez le lien d&apos;approbation
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Ce lien permet à votre administrateur IT d&apos;approuver
                Cantaia pour toute votre organisation en un clic.
              </p>
              {adminConsentUrl ? (
                <div className="mt-3">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <code className="text-xs text-gray-600 break-all flex-1 select-all">
                      {adminConsentUrl.substring(0, 80)}...
                    </code>
                    <button
                      onClick={() => handleCopy(adminConsentUrl)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copié
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copier
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  Configuration Microsoft non disponible. Contactez le support
                  Cantaia.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm shrink-0">
              2
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">
                Envoyez-le à votre administrateur IT
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Transmettez le lien à la personne qui gère Microsoft 365 dans
                votre entreprise. Nous avons préparé un email type.
              </p>
              <div className="mt-3 flex gap-2">
                <a
                  href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  Ouvrir un email pré-rempli
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm shrink-0">
              3
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">
                Une fois approuvé, reconnectez-vous
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Après l&apos;approbation par votre admin, revenez sur Cantaia et
                connectez-vous normalement avec Microsoft 365.
              </p>
              <div className="mt-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Retour à la connexion
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions detail (collapsible) */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setShowScopes(!showScopes)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              Quelles permissions sont demandées ?
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {showScopes ? "Masquer" : "Voir le détail"}
          </span>
        </button>
        {showScopes && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left text-gray-400 text-xs uppercase">
                  <th className="pb-2 font-medium">Permission</th>
                  <th className="pb-2 font-medium">Utilisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {SCOPES.map((scope) => (
                  <tr key={scope}>
                    <td className="py-2 text-gray-700 font-mono text-xs">
                      {SCOPE_DESCRIPTIONS[scope]?.fr || scope}
                    </td>
                    <td className="py-2 text-gray-500 text-xs">
                      {SCOPE_DESCRIPTIONS[scope]?.why || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-3">
              Toutes les permissions sont de type &quot;déléguées&quot; — Cantaia
              n&apos;accède qu&apos;aux données de l&apos;utilisateur connecté,
              jamais à celles d&apos;autres utilisateurs.
            </p>
          </div>
        )}
      </div>

      {/* Security note */}
      <p className="text-center text-xs text-gray-400 mt-6">
        Cantaia est hébergé en Europe. Vos données restent privées.
        <br />
        <a
          href="https://cantaia.io/fr/legal/privacy"
          className="underline hover:text-gray-600"
        >
          Politique de confidentialité
        </a>
      </p>
    </div>
  );
}
