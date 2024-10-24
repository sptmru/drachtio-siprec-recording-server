const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('config');
const AWS = require('aws-sdk');

const logger = pino();
const s3 = new AWS.S3({
  accessKeyId: config.get('aws.accessKeyId'),
  secretAccessKey: config.get('aws.secretAccessKey'),
  region: config.get('aws.region'),
});

module.exports = async function(pathToRecordingFile) {
  try {
    const fileContent = fs.readFileSync(pathToRecordingFile);
    const params = {
      Bucket: config.get('aws.bucketName'),
      Key: path.basename(pathToRecordingFile),
      Body: fileContent,
    };

    const data = await s3.upload(params).promise();
    logger.info(`MP3 file ${pathToRecordingFile} uploaded to S3: ${data.Location}`);

    return data;
  } catch (err) {
    logger.error(`Error while trying to upload ${pathToRecordingFile} to S3: ${err}`);

    return false;
  }
};
