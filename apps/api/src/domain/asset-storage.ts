import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';

export const ASSET_STORAGE = Symbol('ASSET_STORAGE');

export type AssetStorageProvider = {
  put(key: string, data: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  read(key: string): Promise<Buffer>;
  publicUrl(key: string): string;
};

/** Local provider for development and self-hosted deployments. The interface
 * keeps S3/R2/GCS swaps out of the AssetService and upload controller. */
export class LocalFilesystemAssetStorageProvider implements AssetStorageProvider {
  private readonly root = resolve(
    process.env.ASSET_STORAGE_ROOT ?? join(process.cwd(), '.data', 'assets'),
  );

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.safePath(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data, { flag: 'wx' });
  }

  async delete(key: string): Promise<void> {
    await unlink(this.safePath(key)).catch((error: unknown) => {
      if (isNodeError(error) && error.code === 'ENOENT') return;
      throw error;
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.safePath(key));
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.safePath(key));
  }

  publicUrl(key: string): string {
    return `/api/v1/public/assets/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private safePath(key: string): string {
    const normalized = normalize(key).replace(/^([/\\])+/, '');
    const file = resolve(this.root, normalized);
    if (file !== this.root && !file.startsWith(`${this.root}/`)) {
      throw new Error('Asset storage key escapes the configured root');
    }
    return file;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
