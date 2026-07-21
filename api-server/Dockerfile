FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
# Ensure the esbuild Linux binary is present (fresh container installs can miss the optional platform pkg)
RUN npm install @esbuild/linux-x64 --no-save

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.mjs"]
