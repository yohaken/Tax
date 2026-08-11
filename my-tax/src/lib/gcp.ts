export const GCP_PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "mypeer-501909";

export const MY_TAX_BUCKET =
  process.env.MY_TAX_GCS_BUCKET || "mypeer-501909-my-tax";

export const VERTEX_LOCATION =
  process.env.VERTEX_LOCATION || "asia-southeast1";

export const VERTEX_MODEL =
  process.env.VERTEX_MODEL || "gemini-2.5-flash";
