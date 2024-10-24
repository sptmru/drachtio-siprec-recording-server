FROM node:18.16.0
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .

RUN apt-get update && apt-get install -y ffmpeg tshark

CMD [ "app.js" ]
