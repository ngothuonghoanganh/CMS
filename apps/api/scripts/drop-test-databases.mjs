// Drops an E2E or visual-capture database of `MONGODB_URI` and the workspace databases it made
// (ADR-025), so a run starts empty and the API does not build indexes for every earlier run's
// workspaces. Refuses any other database: never the development or a production one.
import mongoose from 'mongoose';

const uri = process.env['MONGODB_URI'];
if (!uri) {
  throw new Error('MONGODB_URI is not set');
}
// A test database on this machine only: never one on a shared cluster.
const { hostname } = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:'));
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
  throw new Error(`Refusing to drop databases on ${hostname}: only a local MongoDB is a test one`);
}
const connection = await mongoose.createConnection(uri).asPromise();
try {
  const master = connection.name;
  if (!/^plp_(e2e|e2e_addresses|visual)$/.test(master)) {
    throw new Error(
      `Refusing to drop "${master}": only plp_e2e, plp_e2e_addresses and plp_visual are test databases`,
    );
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
