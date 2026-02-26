FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3001
# Bind to 0.0.0.0 so the dev server is reachable via Docker port publishing.
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3001"]

FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
