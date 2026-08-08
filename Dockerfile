FROM node:20-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci --prefix backend --ignore-scripts
RUN cd backend && npx playwright install --with-deps chromium
RUN npm ci --prefix frontend
RUN npm run build --prefix frontend

RUN rm -rf backend/public \
    && mkdir -p backend/public \
    && cp -r frontend/dist/* backend/public/

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "backend/src/server.js"]
