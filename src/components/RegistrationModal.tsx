import React, { FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileCheck2,
  Loader2,
  MessageCircle,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

type GstStatus = 'yes' | 'no';

export interface RegistrationDetails {
  fullName: string;
  businessName: string;
  hasGst: GstStatus;
  whatsappNumber: string;
}

interface RegistrationModalProps {
  initialName?: string;
  onClose: () => void;
  onVerified: (details: RegistrationDetails) => void;
}

type RegistrationStep = 'details' | 'otp';

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
  initialName = '',
  onClose,
  onVerified,
}) => {
  const [step, setStep] = useState<RegistrationStep>('details');
  const [details, setDetails] = useState<RegistrationDetails>({
    fullName: initialName,
    businessName: '',
    hasGst: 'no',
    whatsappNumber: '',
  });
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const updateDetails = <K extends keyof RegistrationDetails>(
    field: K,
    value: RegistrationDetails[K]
  ) => {
    setDetails((current) => ({ ...current, [field]: value }));
  };

  const sendOtp = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'Could not send the OTP. Please try again.');
      }

      setChallengeId(result.challengeId);
      setDevelopmentOtp(result.developmentOtp || '');
      setCooldown(Number(result.resendAfterSeconds) || 30);
      setStep('otp');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send the OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, otp }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'That OTP is not valid. Please try again.');
      }

      onVerified(details);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not verify the OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#f5fff8]/90 p-3 backdrop-blur-md sm:p-4">
      <div className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#d9e8df] bg-[#f5fff8] p-5 text-left shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close registration form"
          className="absolute right-4 top-4 rounded-full p-2 text-black/50 transition-colors hover:bg-[#e6f8e6] hover:text-black"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 pr-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#bce8c9] bg-[#e6f8e6] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#126b34]">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure player registration
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-black sm:text-3xl">
            {step === 'details' ? 'Before you play' : 'Verify WhatsApp'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-black/60">
            {step === 'details'
              ? 'Share your details to unlock the 60-second Expo Blitz.'
              : `We sent a 6-digit OTP to ${details.whatsappNumber}.`}
          </p>
        </div>

        {step === 'details' ? (
          <form className="space-y-4" onSubmit={sendOtp}>
            <Field
              icon={<UserRound className="h-4 w-4" />}
              label="Name"
              value={details.fullName}
              onChange={(value) => updateDetails('fullName', value)}
              placeholder="Enter your full name"
              autoComplete="name"
              required
            />
            <Field
              icon={<Building2 className="h-4 w-4" />}
              label="Business name"
              value={details.businessName}
              onChange={(value) => updateDetails('businessName', value)}
              placeholder="Enter your business name"
              autoComplete="organization"
              required
            />

            <fieldset>
              <legend className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/60">
                <FileCheck2 className="h-4 w-4" /> Do you have GST?
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(['yes', 'no'] as GstStatus[]).map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
                      details.hasGst === value
                        ? 'border-[#1b9e4b] bg-[#e6f8e6] text-[#126b34]'
                        : 'border-[#d9e8df] bg-white/50 text-black/60 hover:bg-[#e6f8e6]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="hasGst"
                      value={value}
                      checked={details.hasGst === value}
                      onChange={() => updateDetails('hasGst', value)}
                      className="accent-[#1b9e4b]"
                    />
                    {value === 'yes' ? 'Yes' : 'No'}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              icon={<MessageCircle className="h-4 w-4" />}
              label="WhatsApp number"
              value={details.whatsappNumber}
              onChange={(value) => updateDetails('whatsappNumber', value)}
              placeholder="98765 43210"
              autoComplete="tel"
              type="tel"
              required
            />
            <p className="text-[11px] text-black/50">We'll send the OTP to this WhatsApp number.</p>

            <SubmitButton loading={isSubmitting}>
              <MessageCircle className="h-4 w-4" /> Send OTP on WhatsApp
            </SubmitButton>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={verifyOtp}>
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-black/60">
                Enter OTP
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
                className="w-full rounded-xl border border-[#d9e8df] bg-white/70 px-4 py-4 text-center text-2xl font-black tracking-[0.45em] text-black outline-none transition-colors placeholder:font-bold placeholder:tracking-[0.35em] placeholder:text-black/20 focus:border-[#1b9e4b]"
              />
            </label>

            {developmentOtp && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Development mode OTP: <strong>{developmentOtp}</strong>
              </p>
            )}

            <SubmitButton loading={isSubmitting}>
              <CheckCircle2 className="h-4 w-4" /> Verify &amp; Play
            </SubmitButton>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setStep('details');
                }}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-black/60 hover:text-black"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Edit details
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || isSubmitting}
                onClick={() => {
                  void sendOtp();
                }}
                className="text-xs font-bold uppercase tracking-widest text-[#126b34] disabled:cursor-not-allowed disabled:text-black/30"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  type?: string;
  required?: boolean;
}

const Field: React.FC<FieldProps> = ({
  icon,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  type = 'text',
  required = false,
}) => (
  <label className="block">
    <span className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/60">
      {icon} {label}
    </span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      required={required}
      maxLength={100}
      className="w-full rounded-xl border border-[#d9e8df] bg-white/70 px-4 py-3 text-sm font-bold text-black outline-none transition-colors placeholder:font-medium placeholder:text-black/35 focus:border-[#1b9e4b]"
    />
  </label>
);

const SubmitButton: React.FC<{ loading: boolean; children: React.ReactNode }> = ({
  loading,
  children,
}) => (
  <button
    type="submit"
    disabled={loading}
    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1b9e4b] px-5 py-3.5 text-xs font-bold uppercase tracking-widest text-black shadow-lg transition-colors hover:bg-[#17903f] disabled:cursor-wait disabled:opacity-60"
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
  </button>
);
