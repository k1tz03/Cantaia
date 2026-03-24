"use client";

import { useState, useEffect } from "react";
import { ExternalLink, FileText, Inbox } from "lucide-react";

interface Invoice {
  id: string;
  number: string | null;
  date: number;
  amount: number;
  currency: string;
  status: string | null;
  pdf_url: string | null;
  hosted_url: string | null;
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "paid":
      return (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
          Paye
        </span>
      );
    case "open":
      return (
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Ouverte
        </span>
      );
    case "void":
      return (
        <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-xs font-medium text-[#71717A]">
          Annulee
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-xs font-medium text-[#71717A]">
          {status || "—"}
        </span>
      );
  }
}

export default function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stripe/invoices")
      .then((r) => r.json())
      .then((data) => setInvoices(data.invoices || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[#71717A]">
        <Inbox className="mb-2 h-8 w-8" />
        <p className="text-sm">Aucune facture</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#27272A]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#27272A] bg-[#27272A]">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-[#71717A]">
              Date
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-[#71717A]">
              Numero
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-[#71717A]">
              Montant
            </th>
            <th className="px-4 py-2.5 text-center text-xs font-medium text-[#71717A]">
              Statut
            </th>
            <th className="px-4 py-2.5 text-center text-xs font-medium text-[#71717A]">
              PDF
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-[#27272A]">
              <td className="px-4 py-2.5 text-[#FAFAFA]">
                {new Date(invoice.date * 1000).toLocaleDateString("fr-CH", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-[#71717A]">
                {invoice.number || "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-[#FAFAFA]">
                {invoice.amount.toFixed(2)} {(invoice.currency || "chf").toUpperCase()}
              </td>
              <td className="px-4 py-2.5 text-center">
                {getStatusBadge(invoice.status)}
              </td>
              <td className="px-4 py-2.5 text-center">
                {invoice.pdf_url ? (
                  <a
                    href={invoice.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#F97316] hover:text-[#F97316]/80"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-[#71717A]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
