import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

export type GstStatus = 'yes' | 'no';

export function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeWhatsAppNumber(value: unknown, countryCode = '91') {
  const raw = cleanText(value);
  if (!raw) return '';

  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) {
    digits = digits.slice(2);
  } else if (!raw.startsWith('+') && digits.length === 10 && countryCode) {
    digits = `${countryCode}${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

export function generateOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(challengeId: string, otp: string) {
  return createHash('sha256').update(`${challengeId}:${otp}`).digest('hex');
}

export function otpMatches(challengeId: string, otp: string, expectedHash: string) {
  const actual = Buffer.from(hashOtp(challengeId, otp), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function deliverWhatsAppOtp(
  to: string,
  otp: string,
  allowDevelopmentFallback: boolean
) {
  const mode = cleanText(process.env.WHATSAPP_OTP_MODE).toLowerCase();

  if (!mode || mode === 'development' || mode === 'console') {
    if (!allowDevelopmentFallback) {
      throw new Error('WhatsApp OTP delivery is not configured.');
    }

    console.info(`[otp] Development OTP for ${to}: ${otp}`);
    return { development: true, devOtp: otp };
  }

  if (mode !== 'meta') {
    throw new Error('Unsupported WhatsApp OTP delivery mode.');
  }

  const phoneNumberId = cleanText(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken = cleanText(process.env.WHATSAPP_ACCESS_TOKEN);
  const templateName = cleanText(process.env.WHATSAPP_OTP_TEMPLATE_NAME);
  const languageCode = cleanText(process.env.WHATSAPP_OTP_LANGUAGE_CODE) || 'en';

  if (!phoneNumberId || !accessToken || !templateName) {
    throw new Error('WhatsApp Cloud API OTP settings are incomplete.');
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: otp }],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: otp }],
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`WhatsApp OTP delivery failed (${response.status}): ${details.slice(0, 300)}`);
  }

  return { development: false };
}
