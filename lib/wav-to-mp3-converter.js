const pino = require('pino');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const config = require('config');
const uploadRecordingToS3Bucket = require('./s3-uploader');

const logger = pino();
const { wavDir, mp3Dir } = config.get('recordings');

module.exports = function(callerId, destinationDid) {
  const recordFileName = `${callerId}-${destinationDid}`;

  const wavFiles = fs.readdirSync(wavDir);
  const matchingFile = wavFiles.find((file) => file.startsWith(recordFileName) && file.endsWith('.wav'));

  if (!matchingFile) {
    logger.error(`There is no file starting with ${recordFileName}`);
    return;
  }

  const fullPathToWavFile = path.join(wavDir, matchingFile);

  const mp3FileName = `${path.basename(fullPathToWavFile, '.wav')}.mp3`;
  const fullPathToMp3File = path.join(mp3Dir, mp3FileName);

  logger.info(`Converting ${fullPathToWavFile} to ${fullPathToMp3File}`);

  ffmpeg()
    .input(fullPathToWavFile)
    .audioCodec('libmp3lame')
    .save(fullPathToMp3File)
    .on('end', async() => {
      logger.info(`Successfully saved MP3: ${fullPathToMp3File}`);
      fs.unlinkSync(fullPathToWavFile);

      const uploadedFile = await uploadRecordingToS3Bucket(fullPathToMp3File);
      if (uploadedFile) {
        fs.unlinkSync(fullPathToMp3File);
      }
    })
    .on('error', (err) => {
      logger.error(`Error during conversion: ${err}`);
    });
};
