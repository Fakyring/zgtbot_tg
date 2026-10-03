FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY bot.js ./
COPY src ./src

CMD ["node", "bot.js"]
