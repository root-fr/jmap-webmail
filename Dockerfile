# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Update npm to pinned version
RUN npm install -g npm@11.7.0

# Install dependencies
RUN npm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy package files
COPY package*.json ./

# Update npm to pinned version
RUN npm install -g npm@11.7.0

# Install production dependencies
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy public assets
COPY --from=builder /app/public ./public

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV APP_NAME=Webmail

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Labels for Kubernetes
LABEL org.opencontainers.image.title="JMAP Webmail"
LABEL org.opencontainers.image.description="A modern, privacy-focused webmail client built with Next.js and the JMAP protocol"
LABEL org.opencontainers.image.source="https://github.com/root-fr/jmap-webmail"
LABEL org.opencontainers.image.licenses="MIT"

# Start the application
CMD ["npm", "start"]