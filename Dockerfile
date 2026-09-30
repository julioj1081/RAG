# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# npm install (not ci): reconciles optional per-platform deps (@emnapi/*) that
# differ between the machine that generated the lockfile and the container.
RUN npm install --no-audit --no-fund --loglevel=error

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The standalone output prunes pdfjs-dist to a single file, but pdfjs needs
# pdf.worker.js at runtime (fake worker) to open documents. Restore the package:
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]