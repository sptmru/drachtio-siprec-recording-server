const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('config');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const logger = pino();

const s3Client = new S3Client({
  region: config.get('aws.region'),
  credentials: {
    accessKeyId: config.get('aws.accessKeyId'),
    secretAccessKey: config.get('aws.secretAccessKey'),
  },
});

module.exports = async function(pathToRecordingFile) {
  try {
    const fileContent = fs.readFileSync(pathToRecordingFile);
    const params = {
      Bucket: config.get('aws.bucketName'),
      Key: path.basename(pathToRecordingFile),
      Body: fileContent,
    };

    const data = await s3Client.send(new PutObjectCommand(params));
    logger.info(`MP3 file ${pathToRecordingFile} uploaded to S3: ${data.Location}`);

    return data;
  } catch (err) {
    logger.error(`Error while trying to upload ${pathToRecordingFile} to S3: ${err}`);

    return false;
  }
};
