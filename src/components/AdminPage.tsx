import React, { FormEvent, useState } from 'react';
import { LogIn, LogOut, RefreshCw, ShieldCheck, Users } from 'lucide-react';

interface AdminLead {
  id: string;
  recordType?: string;
  fullName: string;
  businessName: string;
  industry: string;
  hasGst?: 'yes' | 'no';
  whatsappNumber: string;
  score?: number;
  maxCombo?: number;
  totalMatches?: number;
  mode?: string;
  createdAt?: string;
  verifiedAt?: string;
}

export const AdminPage: React.FC = () => {
  const [adminKey, setAdminKey] = useState('');
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLeads = async (key: string) => {
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/leads', {
        headers: { 'x-admin-key': key },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'Could not load customer data.');
      }

      setLeads(result.entries || []);
      setIsAuthenticated(true);
    } catch (requestError) {
      setIsAuthenticated(false);
      setError(requestError instanceof Error ? requestError.message : 'Could not load customer data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadLeads(adminKey);
  };

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  };

  return (
    <div className="min-h-dvh bg-[#f5fff8] px-3 py-4 text-black sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 rounded-3xl border border-[#d9e8df] bg-white/70 p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#bce8c9] bg-[#e6f8e6] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#126b34]">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin dashboard
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">Customer data</h1>
            <p className="mt-1 text-sm text-black/60">Verified registrations and their game scores.</p>
          </div>

          {isAuthenticated && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadLeads(adminKey)}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#d9e8df] px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-[#e6f8e6]"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminKey('');
                  setLeads([]);
                  setIsAuthenticated(false);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          )}
        </header>

        {!isAuthenticated ? (
          <form onSubmit={handleLogin} className="mx-auto max-w-md rounded-3xl border border-[#d9e8df] bg-white/70 p-5 shadow-lg sm:p-7">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e6f8e6] text-[#126b34]">
              <LogIn className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight">Admin sign in</h2>
            <p className="mt-2 text-sm leading-relaxed text-black/60">Enter the admin key configured on the server.</p>
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="Admin key"
              autoComplete="current-password"
              required
              className="mt-5 w-full rounded-xl border border-[#d9e8df] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#1b9e4b]"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1b9e4b] px-4 py-3.5 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-[#17903f] disabled:cursor-wait disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" /> {isLoading ? 'Checking…' : 'Open dashboard'}
            </button>
          </form>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label="Records" value={leads.length.toLocaleString()} />
              <SummaryCard label="Scores" value={leads.filter((lead) => typeof lead.score === 'number').length.toLocaleString()} />
              <SummaryCard label="GST yes" value={leads.filter((lead) => lead.hasGst === 'yes').length.toLocaleString()} />
              <SummaryCard label="Categories" value={new Set(leads.map((lead) => lead.industry).filter(Boolean)).size.toLocaleString()} />
            </div>

            {leads.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#b8d9c2] bg-white/60 p-10 text-center text-sm text-black/60">
                No customer records found yet.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {leads.map((lead) => (
                  <article key={lead.id} className="rounded-2xl border border-[#d9e8df] bg-white/75 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-black">{lead.fullName}</h2>
                        <p className="truncate text-sm text-black/60">{lead.businessName}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#e6f8e6] px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[#126b34]">
                        {typeof lead.score === 'number' ? 'Score' : 'Registration'}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
                      <DataPoint label="Business name" value={lead.businessName || '—'} wide />
                      <DataPoint label="Category" value={lead.industry || '—'} wide />
                      <DataPoint label="GST" value={lead.hasGst === 'yes' ? 'Yes' : lead.hasGst === 'no' ? 'No' : '—'} />
                      <DataPoint label="WhatsApp number" value={lead.whatsappNumber || '—'} />
                      <DataPoint label="Score" value={typeof lead.score === 'number' ? lead.score.toLocaleString() : 'Not played'} />
                      <DataPoint label="Mode" value={lead.mode || '—'} />
                      <DataPoint label="Created" value={formatDate(lead.createdAt)} />
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-[#d9e8df] bg-white/70 p-4 shadow-sm">
    <p className="text-[10px] font-bold uppercase tracking-widest text-black/50">{label}</p>
    <p className="mt-1 text-2xl font-black text-[#087a37]">{value}</p>
  </div>
);

const DataPoint: React.FC<{ label: string; value: string; wide?: boolean }> = ({ label, value, wide }) => (
  <div className={wide ? 'col-span-2' : 'min-w-0'}>
    <dt className="text-[9px] font-bold uppercase tracking-widest text-black/45">{label}</dt>
    <dd className="truncate font-semibold text-black" title={value}>{value}</dd>
  </div>
);
