const pino = require('pino');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const config = require('config');
const uploadRecordingToS3Bucket = require('./s3-uploader');

const logger = pino();
const { wavDir, mp3Dir } = config.get('recordings');

module.exports = function(callerId, destinationDid, recordingId) {
  const recordFileName = `${callerId}-${destinationDid}`;

  const wavFiles = fs.readdirSync(wavDir);

  const matchingFiles = wavFiles
    .filter((file) => file.startsWith(recordFileName) && file.endsWith('.wav'))
    .map((file) => {
      const fullPath = path.join(wavDir, file);
      const stats = fs.statSync(fullPath);
      return { file, time: stats.birthtime }; // You can also use stats.mtime if needed
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
    .on('end', async() => {
      logger.info(`Successfully saved MP3: ${fullPathToMp3File}`);
      fs.unlinkSync(fullPathToWavFile);

      const uploadedFileUrl = await uploadRecordingToS3Bucket(fullPathToMp3File);
      if (uploadedFileUrl) {
        fs.unlinkSync(fullPathToMp3File);
      }
    })
    .on('error', (err) => {
      logger.error(`Error during conversion: ${err}`);
    });
};
