import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import { MongoClient, ServerApiVersion } from 'mongodb';
import {
  cleanText,
  deliverWhatsAppOtp,
  generateOtp,
  hashOtp,
  normalizeWhatsAppNumber,
  otpMatches,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '../lib/otp';

type ApiRequest = {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => ApiResponse;
};

type RequestBody = Record<string, unknown>;

const mongoUri = process.env.MONGODB_URI?.trim();
const mongoDbName = process.env.MONGODB_DB_NAME ?? 'saas_crush';
const mongoCollectionName = process.env.MONGODB_COLLECTION_NAME ?? 'expo_leads';
const mongoOtpCollectionName = process.env.MONGODB_OTP_COLLECTION_NAME ?? 'otp_challenges';

type OtpChallenge = {
  _id: string;
  fullName: string;
  businessName: string;
  hasGst: 'yes' | 'no';
  whatsappNumber: string;
  otpHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
};

const configuredDnsServers = process.env.MONGODB_DNS_SERVERS
  ?.split(',')
  .map((server) => server.trim())
  .filter(Boolean);
const currentDnsServers = dns.getServers();
if (configuredDnsServers?.length) {
  dns.setServers(configuredDnsServers);
} else if (
  currentDnsServers.length > 0 &&
  currentDnsServers.every((server) => server === '127.0.0.1' || server === '::1')
) {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
}

let mongoClientPromise: Promise<MongoClient> | undefined;

async function getMongoClient() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured.');
  }

  if (!mongoClientPromise) {
    const client = new MongoClient(mongoUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });

    mongoClientPromise = client.connect().catch((error) => {
      mongoClientPromise = undefined;
      throw error;
    });
  }

  return mongoClientPromise;
}

async function getLeadsCollection() {
  const client = await getMongoClient();
  return client.db(mongoDbName).collection(mongoCollectionName);
}

async function getOtpCollection() {
  const client = await getMongoClient();
  return client.db(mongoDbName).collection<OtpChallenge>(mongoOtpCollectionName);
}

function requestBody(req: ApiRequest): RequestBody {
  if (req.body && typeof req.body === 'object') {
    return req.body as RequestBody;
  }

  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function databaseErrorMessage() {
  return mongoUri
    ? 'Database is temporarily unavailable. Please try again.'
    : 'Database is not configured for this deployment.';
}

function userAgent(req: ApiRequest) {
  const value = req.headers?.['user-agent'];
  return typeof value === 'string' ? value : '';
}

function validateRegistration(body: RequestBody) {
  const fullName = cleanText(body.fullName);
  const businessName = cleanText(body.businessName);
  const hasGst = body.hasGst === 'yes' || body.hasGst === 'no' ? body.hasGst : '';
  const whatsappNumber = normalizeWhatsAppNumber(
    body.whatsappNumber,
    cleanText(process.env.WHATSAPP_COUNTRY_CODE) || '91'
  );

  if (!fullName || fullName.length > 100) {
    return { error: 'Please enter your full name.' };
  }
  if (!businessName || businessName.length > 120) {
    return { error: 'Please enter your business name.' };
  }
  if (!hasGst) {
    return { error: 'Please choose whether you have GST.' };
  }
  if (!whatsappNumber) {
    return { error: 'Please enter a valid WhatsApp number.' };
  }

  return { fullName, businessName, hasGst, whatsappNumber } as const;
}

async function handleSendOtp(req: ApiRequest, res: ApiResponse) {
  const registration = validateRegistration(requestBody(req));
  if ('error' in registration) {
    return res.status(400).json({ message: registration.error });
  }

  const challengeId = randomUUID();
  const otp = generateOtp();
  const now = new Date();
  const challenge: OtpChallenge = {
    _id: challengeId,
    ...registration,
    otpHash: hashOtp(challengeId, otp),
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
  };

  try {
    const delivery = await deliverWhatsAppOtp(registration.whatsappNumber, otp, false);
    const collection = await getOtpCollection();
    await collection.replaceOne({ _id: challengeId }, challenge, { upsert: true });

    return res.json({
      challengeId,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      ...(delivery.development ? { developmentOtp: delivery.devOtp } : {}),
    });
  } catch (error) {
    console.error('[otp] Vercel send failed', error);
    return res.status(503).json({ message: 'Could not send the WhatsApp OTP. Please try again.' });
  }
}

async function handleVerifyOtp(req: ApiRequest, res: ApiResponse) {
  const body = requestBody(req);
  const challengeId = cleanText(body.challengeId);
  const otp = cleanText(body.otp);

  if (!challengeId || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: 'Please enter the 6-digit OTP.' });
  }

  try {
    const otpCollection = await getOtpCollection();
    const challenge = await otpCollection.findOne({ _id: challengeId });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'This OTP has expired. Please request a new one.' });
    }
    if (challenge.attempts >= 5) {
      return res.status(429).json({ message: 'Too many attempts. Please request a new OTP.' });
    }

    if (!otpMatches(challengeId, otp, challenge.otpHash)) {
      await otpCollection.updateOne({ _id: challengeId }, { $inc: { attempts: 1 } });
      return res.status(400).json({ message: 'That OTP is incorrect. Please try again.' });
    }

    const lead = {
      recordType: 'registration',
      fullName: challenge.fullName,
      businessName: challenge.businessName,
      hasGst: challenge.hasGst,
      whatsappNumber: challenge.whatsappNumber,
      verifiedAt: new Date(),
      createdAt: challenge.createdAt,
      userAgent: userAgent(req),
    };
    const collection = await getLeadsCollection();
    const result = await collection.insertOne(lead);
    await otpCollection.deleteOne({ _id: challengeId });

    return res.json({ id: result.insertedId.toString(), fullName: challenge.fullName });
  } catch (error) {
    console.error('[otp] Vercel verify failed', error);
    return res.status(503).json({ message: 'Could not verify the OTP right now. Please try again.' });
  }
}

async function handleLeaderboard(res: ApiResponse) {
  try {
    const collection = await getLeadsCollection();
    const records = await collection
      .find(
        {
          fullName: { $type: 'string', $ne: '' },
          score: { $type: 'number', $gt: 0 },
        },
        {
          projection: {
            fullName: 1,
            score: 1,
            updatedAt: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ score: -1, updatedAt: -1, createdAt: -1 })
      .limit(25)
      .toArray();

    return res.json({
      entries: records.map((record) => ({
        id: record._id.toString(),
        playerName: record.fullName,
        score: typeof record.score === 'number' ? record.score : 0,
      })),
    });
  } catch (error) {
    console.error('[database] Vercel leaderboard load failed', error);
    return res.status(503).json({ message: databaseErrorMessage() });
  }
}

async function handleScore(req: ApiRequest, res: ApiResponse) {
  const body = requestBody(req);
  const playerName = cleanText(body.playerName);
  const score = Number(body.score);
  const maxCombo = Number(body.maxCombo);
  const totalMatches = Number(body.totalMatches);
  const mode = cleanText(body.mode);

  if (!playerName || playerName.length > 80) {
    return res.status(400).json({ message: 'Please enter a valid player name.' });
  }

  if (!Number.isFinite(score) || score <= 0) {
    return res.status(400).json({ message: 'Please enter a valid score.' });
  }

  try {
    const collection = await getLeadsCollection();
    const scoreFields = {
      fullName: playerName,
      score,
      maxCombo: Number.isFinite(maxCombo) ? maxCombo : 0,
      totalMatches: Number.isFinite(totalMatches) ? totalMatches : 0,
      mode,
      updatedAt: new Date(),
    };

    const result = await collection.insertOne({
      ...scoreFields,
      createdAt: new Date(),
      userAgent: userAgent(req),
    });

    return res.status(201).json({ id: result.insertedId.toString() });
  } catch (error) {
    console.error('[database] Vercel score save failed', error);
    return res.status(503).json({ message: databaseErrorMessage() });
  }
}

async function handleHealth(res: ApiResponse) {
  try {
    const collection = await getLeadsCollection();
    await collection.findOne({}, { projection: { _id: 1 } });
    return res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('[database] Vercel health check failed', error);
    return res.status(503).json({
      ok: false,
      database: mongoUri ? 'unavailable' : 'not_configured',
    });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '');
  const method = (req.method ?? 'GET').toUpperCase();

  if (pathname === '/api/health' && method === 'GET') {
    return handleHealth(res);
  }

  if (pathname === '/api/leaderboard' && method === 'GET') {
    return handleLeaderboard(res);
  }

  if (pathname === '/api/scores' && method === 'POST') {
    return handleScore(req, res);
  }

  if (pathname === '/api/otp/send' && method === 'POST') {
    return handleSendOtp(req, res);
  }

  if (pathname === '/api/otp/verify' && method === 'POST') {
    return handleVerifyOtp(req, res);
  }

  return res.status(404).json({ message: 'API route not found.' });
}
