FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV JAD_CONNECTOR_MODE=browser
ENV JAD_HTTP_FALLBACK=false

COPY . .

RUN npm ci --prefix backend --include=dev --ignore-scripts --no-audit --no-fund
RUN npm ci --prefix frontend --include=dev --ignore-scripts --no-audit --no-fund

RUN cd backend && npx playwright install --with-deps chromium

RUN npm run build --prefix frontend
RUN rm -rf backend/public \
    && mkdir -p backend/public \
    && cp -r frontend/dist/* backend/public/

EXPOSE 8080

CMD ["node", "backend/src/server.js"]
