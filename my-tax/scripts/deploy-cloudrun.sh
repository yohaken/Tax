#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-mynote-f1bbc}"
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
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},MY_TAX_GCS_BUCKET=mynote-f1bbc-my-tax,MY_TAX_REQUIRE_GCS=1,VERTEX_LOCATION=asia-southeast1,VERTEX_MODEL=gemini-2.5-flash,NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAswz15_kbwp0owNI0R2_6x8YoNHmZfeeI,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mynote-f1bbc.firebaseapp.com,NEXT_PUBLIC_FIREBASE_PROJECT_ID=mynote-f1bbc,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=mynote-f1bbc.firebasestorage.app,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=570843838870,NEXT_PUBLIC_FIREBASE_APP_ID=" \
  --project "$PROJECT_ID"

URL=$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.url)')

echo ""
echo "LIVE URL: $URL"
