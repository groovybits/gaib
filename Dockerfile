FROM node:20.1.0-alpine3.17

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
RUN pnpm run build

# Service must listen to $PORT environment variable.
# This default value facilitates local development.
ENV PORT 3000

# Run the web service on container startup.
CMD [ "pnpm", "start" ]

