import mongoose from 'mongoose';

let isConnected = false;

interface MongoConnectionOptions {
  maxPoolSize?: number;
  minPoolSize?: number;
  serverSelectionTimeoutMS?: number;
  connectTimeoutMS?: number;
}

export async function connectMongoDB(customUri?: string, options?: MongoConnectionOptions): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const uri = customUri || process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined in the environment configuration.');
  }

  const maxPoolSize = options?.maxPoolSize || parseInt(process.env.MONGODB_MAX_POOL_SIZE || '50', 10);
  const minPoolSize = options?.minPoolSize || parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10);
  const serverSelectionTimeoutMS = options?.serverSelectionTimeoutMS || 10000;
  const connectTimeoutMS = options?.connectTimeoutMS || 15000;

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log('[MongoDB] Connection pool established to cluster.');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Connection error occurred:', err);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] Connection disconnected.');
  });

  try {
    await mongoose.connect(uri, {
      maxPoolSize,
      minPoolSize,
      serverSelectionTimeoutMS,
      connectTimeoutMS,
      autoIndex: process.env.NODE_ENV !== 'production', // Build indexes in dev, managed in prod
    });

    isConnected = true;
    return mongoose;
  } catch (err: any) {
    isConnected = false;
    console.error('[MongoDB] Failed to connect to MongoDB cluster:', err.message);
    throw err;
  }
}

export async function disconnectMongoDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Disconnected successfully.');
  }
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// Graceful shutdown registration
process.on('SIGINT', async () => {
  if (isMongoConnected()) {
    await disconnectMongoDB();
  }
});

process.on('SIGTERM', async () => {
  if (isMongoConnected()) {
    await disconnectMongoDB();
  }
});
