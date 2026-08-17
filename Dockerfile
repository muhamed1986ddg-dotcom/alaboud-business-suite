FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV JAD_CONNECTOR_MODE=browser
ENV JAD_HTTP_FALLBACK=false

COPY package.json package-lock.json .npmrc .gitignore ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci --prefix backend --include=dev --ignore-scripts --no-audit --no-fund
RUN npm ci --prefix frontend --include=dev --ignore-scripts --no-audit --no-fund

# Copy only files required by the production build and its regression gates.
# This keeps unrelated archives, reports, Android resources and local artifacts
# out of the Cloud Run image.
COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts
COPY app/build.gradle.kts ./app/build.gradle.kts
COPY app/src/main/java/com/alaboud/businesssuite/MainActivity.kt ./app/src/main/java/com/alaboud/businesssuite/MainActivity.kt

# Hard startup-symbol guard: Cloud Run must never receive an image whose API middleware references mutate without importing it.
RUN node -e "const fs=require('fs');const s=fs.readFileSync('backend/src/server.js','utf8');if(!/\{[^}]*\bmutate\b[^}]*\}\s*=\s*require\(['\"]\.\/store['\"]\)/s.test(s))throw new Error('STARTUP_GUARD: backend/src/server.js does not import mutate from ./store');"

# Production build gate: catch runtime startup regressions and financial/reliability regressions before image publication.
RUN npm run check:sensitive && npm run check:v251492 && npm run check:reliability && npm run check:regressions

RUN cd backend && npx playwright install --with-deps chromium

RUN npm run build --prefix frontend
RUN rm -rf backend/public \
    && mkdir -p backend/public \
    && cp -r frontend/dist/* backend/public/

# Cloud Run rejects images whose filesystem contains non-UTF-8 path names.
RUN node scripts/check-container-paths.js

EXPOSE 8080

CMD ["node", "backend/src/server.js"]
