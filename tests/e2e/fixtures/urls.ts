const apiPort = Number(process.env.E2E_API_PORT ?? 3001);
const cmsPort = Number(process.env.E2E_CMS_PORT ?? 3000);
const rendererPort = Number(process.env.E2E_RENDERER_PORT ?? 3002);

export const E2E_API_ORIGIN = `http://127.0.0.1:${apiPort}`;
export const E2E_API_BASE_URL =
  process.env.E2E_API_BASE_URL ?? `${E2E_API_ORIGIN}/api/v1`;
export const E2E_CMS_ORIGIN = `http://127.0.0.1:${cmsPort}`;
export const E2E_RENDERER_ORIGIN =
  process.env.E2E_RENDERER_BASE_URL ??
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ??
  `http://127.0.0.1:${rendererPort}`;
