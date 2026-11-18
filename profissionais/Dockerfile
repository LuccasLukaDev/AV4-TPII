FROM node:18-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache wget

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "start"]
