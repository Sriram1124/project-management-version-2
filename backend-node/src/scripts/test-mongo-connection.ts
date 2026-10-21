import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

async function testConnection() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('ERROR: MONGODB_URI is not set in backend-node/.env');
    process.exit(1);
  }

  // Mask credentials safely for logging
  let maskedUri = uri;
  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = '*****';
    }
    maskedUri = parsed.toString();
  } catch {
    const atIndex = uri.indexOf('@');
    const schemeIndex = uri.indexOf('://');
    if (atIndex !== -1 && schemeIndex !== -1 && atIndex > schemeIndex + 3) {
      const authPart = uri.substring(schemeIndex + 3, atIndex);
      const colonIndex = authPart.indexOf(':');
      if (colonIndex !== -1) {
        maskedUri = `${uri.substring(0, schemeIndex + 3)}${authPart.substring(0, colonIndex)}:*****${uri.substring(atIndex)}`;
      }
    }
  }
  console.log(`Testing MongoDB connection to: ${maskedUri}`);

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
    });

    // Ping admin database
    const admin = conn.connection.db?.admin();
    const pingResult = await admin?.ping();

    console.log('SUCCESS: Connected to MongoDB Atlas successfully!');
    console.log('Ping result:', pingResult);
    console.log('Database name:', conn.connection.name);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err: any) {
    console.error('FAILURE: Could not connect to MongoDB Atlas.');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);

    if (err.message?.includes('bad auth') || err.message?.includes('Authentication failed')) {
      console.error('\n--> Diagnosis: Authentication failed. Please check the username and password set for your database user.');
    } else if (err.name === 'MongooseServerSelectionError' || err.message?.includes('timed out')) {
      console.error('\n--> Diagnosis: Connection timed out. Make sure your current IP address is added to the IP Access List in Atlas Network Access.');
    }

    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

void testConnection().catch((err) => {
  console.error('Unexpected error during connection test:', err);
  process.exit(1);
});
