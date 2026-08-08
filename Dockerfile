FROM node:20-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci --prefix backend --ignore-scripts
RUN npm ci --prefix frontend
RUN npm run build --prefix frontend

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "backend/src/server.js"]