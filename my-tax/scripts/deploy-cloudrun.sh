#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-mypeer-501909}"
REGION="${GCP_REGION:-asia-southeast1}"
SERVICE="${CLOUD_RUN_SERVICE:-my-tax}"
REPO="${ARTIFACT_REPO:-my-tax}"

export PATH="${PATH}:/tmp/google-cloud-sdk/bin"

echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Service: $SERVICE"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  identitytoolkit.googleapis.com \
  --project "$PROJECT_ID"

gcloud artifacts repositories describe "$REPO" \
  --location="$REGION" \
  --project="$PROJECT_ID" >/dev/null 2>&1 || \
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="my-tax images" \
  --project="$PROJECT_ID"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE}" \
  --project "$PROJECT_ID"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 3 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},MY_TAX_GCS_BUCKET=mypeer-501909-my-tax,MY_TAX_REQUIRE_GCS=1,VERTEX_LOCATION=asia-southeast1,VERTEX_MODEL=gemini-2.5-flash,NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD_b7TASutFOmoUKskH6yLjmxJzVpTUIn4,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mypeer-501909.firebaseapp.com,NEXT_PUBLIC_FIREBASE_PROJECT_ID=mypeer-501909,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=mypeer-501909.firebasestorage.app,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=470549580687,NEXT_PUBLIC_FIREBASE_APP_ID=1:470549580687:web:5447b1c7b95e991ab719fa" \
  --project "$PROJECT_ID"

URL=$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.url)')

echo ""
echo "LIVE URL: $URL"
