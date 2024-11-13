const pino = require('pino');
const fs = require('fs');
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
/**
 * Uploads a recording file to an S3 bucket.
 *
 * @param {string} pathToRecordingFile - Path to the recording file to be uploaded. If this contains the mp3Dir
 * directory, it will be removed.
 * @returns {Promise<string | false>} - The S3 URL of the uploaded file if successful, or `false` on failure.
 *
 * @example
 * const url = await uploadRecordingToS3Bucket('/path/to/recording.mp3')
 */
module.exports = async function uploadRecordingToS3Bucket(pathToRecordingFile) {
  try {
    const fileContent = fs.readFile(pathToRecordingFile);
    const mp3FileNameWithPath = pathToRecordingFile.replace(config.get('recordings.mp3Dir'), '');
    const params = {
      Bucket: config.get('aws.bucketName'),
      Key: mp3FileNameWithPath,
      Body: fileContent,
    };

    await s3Client.send(new PutObjectCommand(params));

    const fileUrl =
      `https://${config.get('aws.bucketName')}.s3.${config.get('aws.region')}.amazonaws.com${pathToRecordingFile}`;
    logger.info(`MP3 file ${pathToRecordingFile} uploaded to S3: ${fileUrl}`);

    return fileUrl;
  } catch (err) {
    if (err.name === 'S3ServiceException') {
      logger.error(`AWS S3 error while uploading ${pathToRecordingFile}: ${err.message}`, err);
    } else {
      logger.error(`Error uploading ${pathToRecordingFile} to S3:`, err);
    }

    return false;
  }
};
