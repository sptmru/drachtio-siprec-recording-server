#!/bin/bash

# Create config.json from example
cp ./config/default.json.example-freeswitch ./config/local.json

# Replace environment variables in config.json
jq '.drachtio.host = "'$DRACHTIO_HOST'" // .drachtio.host' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.drachtio.port = '$DRACHTIO_PORT' // .drachtio.port' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.drachtio.secret = "'$DRACHTIO_SECRET'" // .drachtio.secret' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.freeswitch = ["'$FREESWITCH_HOST'"]' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.redis.host = "'$REDIS_HOST'" // .redis.host' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.redis.port = '$REDIS_PORT' // .redis.port' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.recordings.mp3Dir = "'$RECORDINGS_MP3_DIR'" // .recordings.mp3Dir' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.recordings.wavDir = "'$RECORDINGS_WAV_DIR'" // .recordings.wavDir' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.aws.accessKeyId = "'$AWS_ACCESS_KEY_ID'" // .aws.accessKeyId' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.aws.secretAccessKey = "'$AWS_SECRET_ACCESS_KEY'" // .aws.secretAccessKey' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.aws.region = "'$AWS_REGION'" // .aws.region' ./config/local.json > tmp.json && mv tmp.json ./config/local.json
jq '.aws.bucketName = "'$AWS_BUCKET_NAME'" // .aws.bucketName' ./config/local.json > tmp.json && mv tmp.json ./config/local.json

# Start service
echo "Starting app"
node app.js