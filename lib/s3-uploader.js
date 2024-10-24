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
    const fileName = path.basename(pathToRecordingFile);
    const params = {
      Bucket: config.get('aws.bucketName'),
      Key: fileName,
      Body: fileContent,
    };

    await s3Client.send(new PutObjectCommand(params));

    const fileUrl = `https://${config.get('aws.bucketName')}.s3.${config.get('aws.region')}.amazonaws.com/${fileName}`;
    logger.info(`MP3 file ${pathToRecordingFile} uploaded to S3: ${fileUrl}`);

    return fileUrl;
  } catch (err) {
    logger.error(`Error while trying to upload ${pathToRecordingFile} to S3: ${err}`);

    return false;
  }
};
