FROM amd64/node:14.11.0-alpine

WORKDIR /app

RUN apk update
RUN apk add build-base python3 py3-pip

COPY . .
RUN npm install
CMD ["node", "bot.js"]
