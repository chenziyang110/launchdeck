FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    DATA_FILE=/app/data/tickets.json \
    HOST=0.0.0.0 \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY db ./db
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY test ./test

RUN addgroup -S helpdesk && adduser -S helpdesk -G helpdesk \
    && mkdir -p /app/data \
    && chown -R helpdesk:helpdesk /app

USER helpdesk

EXPOSE 3000

CMD ["node", "src/server.mjs"]
