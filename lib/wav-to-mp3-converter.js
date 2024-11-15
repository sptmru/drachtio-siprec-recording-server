const pino = require('pino');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const config = require('config');
const uploadRecordingToS3Bucket = require('./s3-uploader');

const logger = pino();
const { wavDir, mp3Dir } = config.get('recordings');

/**
 * Converts a WAV recording file to MP3, uploads the MP3 file to S3,
 * and deletes the original WAV and MP3 files after processing.
 *
 * @param {string} callerId - The caller's ID used to identify the recording file.
 * @param {string} destinationDid - The destination DID used to identify the recording file.
 * @param {string} recordingId - Recording file name (without extension) for saving the MP3 file.
 * @param {string} subdirectoryName - The subdirectory name for uploading the MP3 file to S3.
 *  If empty, the file will be uploaded to the root directory.
 * //  @param {string} recordingIdWithPath - The full path and file name (without extension) for saving the MP3 file.
 *
 * @description
 * This function reads the specified directory for WAV files matching the pattern `callerId-destinationDid`,
 * finds the latest modified file, converts it to MP3, uploads the MP3 file to an S3 bucket, and deletes
 * the WAV and MP3 files after processing.
 *
 * @example
 * ```javascript
 * // convertWavToMp3('1234567890', '0987654321', '/path/to/recordings/recording-123');
 * coiwnvertWavToMp3('1234567890', '0987654321', 'recording-123', 'subdirectory');
 * ```
 *
 * @throws Will log an error and return if the directory cannot be read or if there are no matching WAV files.
 */
module.exports = function(callerId, destinationDid, recordingId, subdirectoryName = '') {
  const recordFileName = `${callerId}-${destinationDid}`;

  let wavFiles;
  try {
    wavFiles = fs.readdirSync(wavDir);
  } catch (err) {
    logger.error(`Error reading directory: ${wavDir}`, err);
    return;
  }

  const matchingFiles = wavFiles
    .filter((file) => file.startsWith(recordFileName) && file.endsWith('.wav'))
    .map((file) => {
      const fullPath = path.join(wavDir, file);
      try {
        const stats = fs.statSync(fullPath);
        return { file, time: stats.mtime }; // Prefer `mtime` over `birthtime`
      } catch (err) {
        logger.error(`Error retrieving stats for file: ${fullPath}`, err);
        return null;
      }
    });

  if (matchingFiles.length === 0) {
    logger.error(`There is no file starting with ${recordFileName}`);
    return;
  }

  const matchingFile = matchingFiles.sort((a, b) => b.time - a.time)[0].file;
  const fullPathToWavFile = path.join(wavDir, matchingFile);

  const mp3FileName = `${recordingId}.mp3`;
  const fullPathToMp3File = path.join(mp3Dir, mp3FileName);

  logger.info(`Converting ${fullPathToWavFile} to ${fullPathToMp3File}`);

  ffmpeg()
    .input(fullPathToWavFile)
    .audioCodec('libmp3lame')
    .save(fullPathToMp3File)
    .on('end', () => {
      logger.info(`Successfully saved MP3: ${fullPathToMp3File}`);

      fs.unlink(fullPathToWavFile, (err) => {
        if (err) logger.error(`Failed to delete WAV file: ${fullPathToWavFile}`, err);
      });

      uploadRecordingToS3Bucket(fullPathToMp3File, subdirectoryName)
        .then((uploadedFileUrl) => {
          if (uploadedFileUrl) {
            fs.unlink(fullPathToMp3File, (err) => {
              if (err) logger.error(`Failed to delete MP3 file: ${fullPathToMp3File}`, err);
            });
          }
          return;
        })
        .catch((err) => {
          logger.error(`Failed to upload MP3 file to S3: ${fullPathToMp3File}`, err);
        });
    })
    .on('error', (err) => {
      logger.error(`Error during conversion: ${err}`);
    });
};
