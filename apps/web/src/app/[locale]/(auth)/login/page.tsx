import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { MicrosoftButton } from "@/components/auth/MicrosoftButton";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function LoginPage() {
  const t = useTranslations("auth");

  return (
    <AuthCard title={t("login")}>
      {/* OAuth providers */}
      <div className="space-y-3">
        <MicrosoftButton />
        <GoogleButton />
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">
            {t("orContinueWith")}
          </span>
        </div>
      </div>

      <LoginForm />
    </AuthCard>
  );
}
