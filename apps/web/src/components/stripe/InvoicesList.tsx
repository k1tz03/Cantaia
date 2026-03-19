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
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          Paye
        </span>
      );
    case "open":
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          Ouverte
        </span>
      );
    case "void":
      return (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          Annulee
        </span>
      );
    default:
      return (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
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
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <Inbox className="mb-2 h-8 w-8" />
        <p className="text-sm">Aucune facture</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
              Date
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
              Numero
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
              Montant
            </th>
            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">
              Statut
            </th>
            <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">
              PDF
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 text-gray-700">
                {new Date(invoice.date * 1000).toLocaleDateString("fr-CH", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                {invoice.number || "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900">
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
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
