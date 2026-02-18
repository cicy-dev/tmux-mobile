FROM node:20-alpine

RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

EXPOSE 6901

USER node

CMD ["node", "dist/index.js"]
