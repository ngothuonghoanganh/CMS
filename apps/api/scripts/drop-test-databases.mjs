// Drops the E2E or visual-capture database of `MONGODB_URI` and the workspace databases it made
// (ADR-025), so a run starts empty and the API does not build indexes for every earlier run's
// workspaces. Refuses any other database: never the development or a production one.
import mongoose from 'mongoose';

const uri = process.env['MONGODB_URI'];
if (!uri) {
  throw new Error('MONGODB_URI is not set');
}
const connection = await mongoose.createConnection(uri).asPromise();
try {
  const master = connection.name;
  if (!/^plp_(e2e|visual)$/.test(master)) {
    throw new Error(`Refusing to drop "${master}": only plp_e2e and plp_visual are test databases`);
  }
  const { db } = connection;
  if (!db) {
    throw new Error(`No database for ${master}`);
  }
  const { databases } = await db.admin().listDatabases({ nameOnly: true });
  for (const { name } of databases) {
    if (name === master || name.startsWith(`${master}_ws_`)) {
      await connection.useDb(name).dropDatabase();
    }
  }
} finally {
  await connection.close();
}
