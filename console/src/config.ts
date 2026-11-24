// Where the Console reads live data from. The page falls back to the bundled snapshot
// (src/data/v2.json, v1.json) when this is unreachable, so the site still works if n8n is off.
// The data API is read-only and serves only the fictional test data, so the URL is not a secret.
export const DATA_API: string =
  import.meta.env.VITE_DATA_API ?? 'https://ai-project-yatharth.app.n8n.cloud/webhook/kesar-data-9d4f2a71c3';

export const REPO_URL = 'https://github.com/yatharthchopra2424/kesar-support-copilot';
