import { config as loadEnv } from 'dotenv';
import express from 'express';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
} from './lib/otp';

// Load local secrets first, then fall back to the standard .env file.
// Both files are ignored by git; .env.example is documentation only.
loadEnv({ path: '.env.local' });
loadEnv();

// Some local DNS proxies refuse MongoDB SRV lookups. Allow an explicit DNS
// override and fall back to public resolvers only when Node is using loopback
// DNS, which keeps mongodb+srv connection strings usable in that environment.
const configuredMongoDnsServers = process.env.MONGODB_DNS_SERVERS
  ?.split(',')
  .map((server) => server.trim())
  .filter(Boolean);
const currentDnsServers = dns.getServers();
if (configuredMongoDnsServers?.length) {
  dns.setServers(configuredMongoDnsServers);
} else if (
  currentDnsServers.length > 0 &&
  currentDnsServers.every((server) => server === '127.0.0.1' || server === '::1')
) {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction =
  process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
const allowInMemoryFallback = !isProduction;
const port = Number(process.env.PORT ?? 3000);
const mongoUri = process.env.MONGODB_URI?.trim();
const mongoDbName = process.env.MONGODB_DB_NAME ?? 'saas_crush';
const mongoCollectionName = process.env.MONGODB_COLLECTION_NAME ?? 'expo_leads';
const mongoOtpCollectionName = process.env.MONGODB_OTP_COLLECTION_NAME ?? 'otp_challenges';

const app = express();
app.use(express.json({ limit: '20kb' }));

// Keep the legacy browser favicon request working for browsers that do not
// honor the explicit SVG link in index.html.
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

let mongoClient: MongoClient | null = null;
// In-memory fallback is intentionally limited to local development.
const inMemoryRecords: any[] = [];
const inMemoryOtpChallenges = new Map<string, OtpChallenge>();

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

async function getLeadsCollection() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured.');
  }

  if (!mongoClient) {
    const client = new MongoClient(mongoUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
    await client.connect();
    mongoClient = client;
  }

  return mongoClient.db(mongoDbName).collection(mongoCollectionName);
}

function databaseErrorMessage() {
  return mongoUri
    ? 'Database is temporarily unavailable. Please try again.'
    : 'Database is not configured for this deployment.';
}

async function getOtpCollection() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured.');
  }

  if (!mongoClient) {
    const client = new MongoClient(mongoUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
    await client.connect();
    mongoClient = client;
  }

  return mongoClient.db(mongoDbName).collection<OtpChallenge>(mongoOtpCollectionName);
}

function validateRegistration(body: any) {
  const fullName = cleanText(body?.fullName);
  const businessName = cleanText(body?.businessName);
  const hasGst = body?.hasGst === 'yes' || body?.hasGst === 'no' ? body.hasGst : '';
  const whatsappNumber = normalizeWhatsAppNumber(
    body?.whatsappNumber,
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

async function saveOtpChallenge(challenge: OtpChallenge) {
  try {
    const collection = await getOtpCollection();
    await collection.replaceOne({ _id: challenge._id }, challenge, { upsert: true });
  } catch (error) {
    console.error('[database] Failed to save OTP challenge', error);
    if (!allowInMemoryFallback) throw error;
    inMemoryOtpChallenges.set(challenge._id, challenge);
  }
}

async function findOtpChallenge(challengeId: string) {
  try {
    const collection = await getOtpCollection();
    return await collection.findOne({ _id: challengeId });
  } catch (error) {
    if (!allowInMemoryFallback) throw error;
    return inMemoryOtpChallenges.get(challengeId) ?? null;
  }
}

async function updateOtpAttempts(challenge: OtpChallenge) {
  try {
    const collection = await getOtpCollection();
    await collection.updateOne({ _id: challenge._id }, { $set: { attempts: challenge.attempts } });
  } catch (error) {
    if (!allowInMemoryFallback) throw error;
    inMemoryOtpChallenges.set(challenge._id, challenge);
  }
}

async function removeOtpChallenge(challengeId: string) {
  try {
    const collection = await getOtpCollection();
    await collection.deleteOne({ _id: challengeId });
  } catch (error) {
    if (!allowInMemoryFallback) throw error;
  }
  inMemoryOtpChallenges.delete(challengeId);
}

app.post('/api/otp/send', async (req, res) => {
  const registration = validateRegistration(req.body);
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
    const delivery = await deliverWhatsAppOtp(
      registration.whatsappNumber,
      otp,
      allowInMemoryFallback
    );
    await saveOtpChallenge(challenge);

    return res.json({
      challengeId,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      ...(delivery.development ? { developmentOtp: delivery.devOtp } : {}),
    });
  } catch (error) {
    console.error('[otp] Failed to send OTP', error);
    return res.status(503).json({ message: 'Could not send the WhatsApp OTP. Please try again.' });
  }
});

app.post('/api/otp/verify', async (req, res) => {
  const challengeId = cleanText(req.body?.challengeId);
  const otp = cleanText(req.body?.otp);

  if (!challengeId || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: 'Please enter the 6-digit OTP.' });
  }

  try {
    const challenge = await findOtpChallenge(challengeId);
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'This OTP has expired. Please request a new one.' });
    }
    if (challenge.attempts >= 5) {
      return res.status(429).json({ message: 'Too many attempts. Please request a new OTP.' });
    }

    if (!otpMatches(challengeId, otp, challenge.otpHash)) {
      challenge.attempts += 1;
      await updateOtpAttempts(challenge);
      return res.status(400).json({ message: 'That OTP is incorrect. Please try again.' });
    }

    await removeOtpChallenge(challengeId);
    const verifiedAt = new Date();
    const lead = {
      recordType: 'registration',
      fullName: challenge.fullName,
      businessName: challenge.businessName,
      hasGst: challenge.hasGst,
      whatsappNumber: challenge.whatsappNumber,
      verifiedAt,
      createdAt: challenge.createdAt,
      userAgent: req.get('user-agent') ?? '',
    };

    try {
      const collection = await getLeadsCollection();
      const result = await collection.insertOne(lead);
      return res.json({ id: result.insertedId.toString(), fullName: challenge.fullName });
    } catch (error) {
      console.error('[database] Failed to save verified registration', error);
      if (!allowInMemoryFallback) {
        return res.status(503).json({ message: databaseErrorMessage() });
      }
      const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      inMemoryRecords.push({ _id: id, ...lead });
      return res.json({ id, fullName: challenge.fullName });
    }
  } catch (error) {
    console.error('[otp] Failed to verify OTP', error);
    return res.status(503).json({ message: 'Could not verify the OTP right now. Please try again.' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const collection = await getLeadsCollection();
    await collection.findOne({}, { projection: { _id: 1 } });
    return res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('[database] Health check failed', error);
    return res.status(503).json({
      ok: false,
      database: mongoUri ? 'unavailable' : 'not_configured',
    });
  }
});

app.get('/api/leaderboard', async (_req, res) => {
  try {
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
    } catch (err) {
      console.error('[database] Failed to load leaderboard', err);
      if (!allowInMemoryFallback) {
        return res.status(503).json({ message: databaseErrorMessage() });
      }

      const sorted = inMemoryRecords
        .filter((r) => typeof r.fullName === 'string' && (typeof r.score === 'number' ? r.score > 0 : false))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 25);

      return res.json({
        entries: sorted.map((record) => ({
          id: String(record._id),
          playerName: record.fullName,
          score: typeof record.score === 'number' ? record.score : 0,
        })),
      });
    }
  } catch (error) {
    console.error('Failed to load leaderboard', error);
    return res.status(500).json({ message: 'Could not load leaderboard.' });
  }
});

app.post('/api/scores', async (req, res) => {
  const playerName = cleanText(req.body?.playerName);
  const score = Number(req.body?.score);
  const maxCombo = Number(req.body?.maxCombo);
  const totalMatches = Number(req.body?.totalMatches);
  const mode = cleanText(req.body?.mode);

  if (!playerName || playerName.length > 80) {
    return res.status(400).json({ message: 'Please enter a valid player name.' });
  }

  if (!Number.isFinite(score) || score <= 0) {
    return res.status(400).json({ message: 'Please enter a valid score.' });
  }

  try {
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
        userAgent: req.get('user-agent') ?? '',
      });

      return res.status(201).json({ id: result.insertedId.toString() });
    } catch (err) {
      console.error('[database] Failed to save score', err);
      if (!allowInMemoryFallback) {
        return res.status(503).json({ message: databaseErrorMessage() });
      }

      const id = String(Date.now()) + '-' + Math.floor(Math.random() * 10000);
      inMemoryRecords.push({
        _id: id,
        fullName: playerName,
        score,
        maxCombo: Number.isFinite(maxCombo) ? maxCombo : 0,
        totalMatches: Number.isFinite(totalMatches) ? totalMatches : 0,
        mode,
        createdAt: new Date(),
        updatedAt: new Date(),
        userAgent: req.get('user-agent') ?? '',
      });

      return res.status(201).json({ id });
    }
  } catch (error) {
    console.error('Failed to save score', error);
    return res.status(500).json({ message: 'Could not save score.' });
  }
});

if (isProduction) {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      hmr: false,
      middlewareMode: true,
    },
    appType: 'spa',
  });

  app.use(vite.middlewares);
}

const maxPortAttempts = 10;

function listenOnPort(portToTry: number) {
  return new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const server = app.listen(portToTry, '::');

    server.once('listening', () => resolve(server));
    server.once('error', (error: NodeJS.ErrnoException) => {
      server.close();
      reject(error);
    });
  });
}

let httpServer: ReturnType<typeof app.listen> | null = null;
let activePort = port;

for (let attempt = 0; attempt < maxPortAttempts; attempt += 1) {
  try {
    activePort = port + attempt;
    httpServer = await listenOnPort(activePort);
    break;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt === maxPortAttempts - 1) {
      throw error;
    }
  }
}

console.log(`SaaS Crush running at http://localhost:${activePort}`);

process.on('SIGINT', async () => {
  httpServer?.close();
  await mongoClient?.close();
  process.exit(0);
});
