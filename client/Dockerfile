# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the React + Phaser client.
#   - builder: node:22-alpine installs deps and runs Vite
#   - runtime: nginx:alpine serves the static bundle with SPA fallback
#
# Build context is `./client` (see docker-compose.yml and the
# `make docker-client` target). Inside the container we treat the
# client as a standalone npm package; vite build emits /repo/dist
# which we then copy into the runtime layer.

FROM node:22-alpine AS builder

WORKDIR /repo

# Cache deps on the manifest layer so source edits don't bust the
# install layer. The package-lock copy is optional: npm ci needs it,
# npm install does not. We use a wildcard so both modes work.
COPY package.json ./
COPY package-lock.jso[n] ./

RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund --ignore-scripts; \
    else \
      npm install --no-audit --no-fund --ignore-scripts; \
    fi

# Copy the rest of the client sources and build the production bundle.
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime

# Drop the default config and install the SPA-friendly one.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets land in /usr/share/nginx/html.
COPY --from=builder /repo/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
