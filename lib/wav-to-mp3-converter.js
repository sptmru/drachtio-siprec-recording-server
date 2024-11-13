const pino = require('pino');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const config = require('config');
const uploadRecordingToS3Bucket = require('./s3-uploader');

const logger = pino();
const { wavDir } = config.get('recordings');

module.exports = function(callerId, destinationDid, recordingIdWithPath) {
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

  const mp3FileNameWithPath = `${recordingIdWithPath}.mp3`;

  logger.info(`Converting ${fullPathToWavFile} to ${mp3FileNameWithPath}`);

  ffmpeg()
    .input(fullPathToWavFile)
    .audioCodec('libmp3lame')
    .save(mp3FileNameWithPath)
    .on('end', () => {
      logger.info(`Successfully saved MP3: ${mp3FileNameWithPath}`);

      fs.unlink(fullPathToWavFile, (err) => {
        if (err) logger.error(`Failed to delete WAV file: ${fullPathToWavFile}`, err);
      });

      uploadRecordingToS3Bucket(mp3FileNameWithPath)
        .then((uploadedFileUrl) => {
          if (uploadedFileUrl) {
            fs.unlink(mp3FileNameWithPath, (err) => {
              if (err) logger.error(`Failed to delete MP3 file: ${mp3FileNameWithPath}`, err);
            });
          }
          return;
        })
        .catch((err) => {
          logger.error(`Failed to upload MP3 file to S3: ${mp3FileNameWithPath}`, err);
        });
    })
    .on('error', (err) => {
      logger.error(`Error during conversion: ${err}`);
    });
};
