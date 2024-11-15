const pino = require('pino');
const fs = require('fs').promises;
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
 * @param {string} subdirectoryName - The subdirectory name for uploading the MP3 file to S3.
 *  If empty, the file will be uploaded to the root directory.
 * @returns {Promise<string | false>} - The S3 URL of the uploaded file if successful, or `false` on failure.
 *
 * @example
 * const url = await uploadRecordingToS3Bucket('/path/to/recording.mp3', 'subdirectory');
 */
module.exports = async function uploadRecordingToS3Bucket(pathToRecordingFile, subdirectoryName = '') {
  try {
    const fileContent = await fs.readFile(pathToRecordingFile);
    const mp3FileNameWithPath = pathToRecordingFile.replace(config.get('recordings.mp3Dir'), '');
    const s3Path = `${subdirectoryName}${mp3FileNameWithPath}`;
    const params = {
      Bucket: config.get('aws.bucketName'),
      Key: s3Path,
      Body: fileContent,
    };

    await s3Client.send(new PutObjectCommand(params));

    const fileUrl =
      `https://${config.get('aws.bucketName')}.s3.${config.get('aws.region')}.amazonaws.com/${s3Path}`;
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
