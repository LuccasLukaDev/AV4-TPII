FROM node:18-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache wget openssl

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate || true

EXPOSE 3000

CMD ["npm", "run", "start"]
