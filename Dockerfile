FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js .
COPY web ./web

RUN mkdir data && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "server.js"]
