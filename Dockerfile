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

# Compile TypeScript into JavaScript
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
RUN pnpm run build

# Service must listen to $PORT environment variable.
# This default value facilitates local development.
ENV PORT 3000

# Run the web service on container startup.
ENTRYPOINT ["pnpm", "start"]
