FROM node:18

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy package.json, pnpm-lock.yaml (if you have one), and other necessary files for installation
COPY package*.json pnpm-lock.yaml ./

# Install production dependencies.
RUN npm install -g pnpm
RUN pnpm install --prod
RUN pnpm install --save-dev eslint

# Copy local code to the container image.
COPY . .

# Set environment variables
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY

ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN

ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID

ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID

ARG NEXT_PUBLIC_FIREBASE_REGION
ENV NEXT_PUBLIC_FIREBASE_REGION=$NEXT_PUBLIC_FIREBASE_REGION

ARG NEXT_PUBLIC_STRIPE_PUBLIC_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLIC_KEY=$NEXT_PUBLIC_STRIPE_PUBLIC_KEY

ARG NEXT_PUBLIC_STRIPE_PRICE_ID
ENV NEXT_PUBLIC_STRIPE_PRICE_ID=$NEXT_PUBLIC_STRIPE_PRICE_ID

ARG STRIPE_SECRET_KEY
ENV STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY

ARG NEXT_PUBLIC_PREMIUM_TOKEN_BALANCE
ENV NEXT_PUBLIC_PREMIUM_TOKEN_BALANCE=$NEXT_PUBLIC_PREMIUM_TOKEN_BALANCE

ARG NEXT_PUBLIC_FREE_TOKEN_START
ENV NEXT_PUBLIC_FREE_TOKEN_START=$NEXT_PUBLIC_FREE_TOKEN_START

ARG HOST
ENV HOST=$HOST

ARG NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL
ENV NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL=$NEXT_PUBLIC_GAIB_IMAGE_DIRECTORY_URL

ARG NEXT_PUBLIC_GAIB_IMAGE_MAX_NUMBER
ENV NEXT_PUBLIC_GAIB_IMAGE_MAX_NUMBER=$NEXT_PUBLIC_GAIB_IMAGE_MAX_NUMBER

ARG NEXT_PUBLIC_GAIB_DEFAULT_IMAGE
ENV NEXT_PUBLIC_GAIB_DEFAULT_IMAGE=$NEXT_PUBLIC_GAIB_DEFAULT_IMAGE

ARG GPT_MAX_TOKENS
ENV GPT_MAX_TOKENS=$GPT_MAX_TOKENS
RUN pnpm run build

# Service must listen to $PORT environment variable.
# This default value facilitates local development.
ENV PORT 3000

# Run the web service on container startup.
ENTRYPOINT ["pnpm", "start"]
