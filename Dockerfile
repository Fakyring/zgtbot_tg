FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY bot.js ./
COPY src ./src

CMD ["node", "bot.js"]
