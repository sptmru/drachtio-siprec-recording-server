const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const config = require('config');
const tmp = require('tmp');

const logger = pino();
const { pcapDir, mp3Dir } = config.get('recordings');

module.exports = function(pcapFilePrefix) {
  const pcapFiles = fs.readdirSync(pcapDir);
  const matchingFile = pcapFiles.find((file) => file.startsWith(pcapFilePrefix) && file.endsWith('.pcap'));

  if (!matchingFile) {
    logger.error(`There is no file starting with ${pcapFilePrefix}`);
    return;
  }

  const fullPathToPcapFile = path.join(pcapDir, matchingFile);
  const mp3FileName = `${path.basename(fullPathToPcapFile, '.pcap')}.mp3`;
  const fullPathToMp3File = path.join(mp3Dir, mp3FileName);

  logger.info(`Converting ${fullPathToPcapFile} to ${fullPathToMp3File}`);

  const tshark = spawn('tshark', [
    '-r', fullPathToPcapFile,
    '-d', 'udp.port==30248,rtp', '-d', 'udp.port==30228,rtp',
    '-Y', 'rtp',
    '-T', 'fields',
    '-e', 'rtp.payload'
  ]);

  let audioData = '';
  tshark.stdout.on('data', (data) => {
    audioData += data.toString().replace(/\n/g, '');
  });

  tshark.on('close', (code) => {
    if (code === 0) {
      logger.info(`tshark completed: Extracted audio from ${fullPathToPcapFile}`);

      const tempAudioFile = tmp.fileSync({ postfix: '.raw' });

      const buffer = Buffer.from(audioData, 'hex');
      fs.writeFileSync(tempAudioFile.name, buffer);

      ffmpeg()
        .input(tempAudioFile.name)
        .inputFormat('mulaw')
        .audioFrequency(8000)
        .audioChannels(1)
        .audioCodec('libmp3lame')
        .save(fullPathToMp3File)
        .on('end', () => {
          logger.info(`Successfully saved MP3: ${fullPathToMp3File}`);
          tempAudioFile.removeCallback();
        })
        .on('error', (err) => {
          logger.error(`Error during conversion: ${err}`);
        });
    } else {
      logger.error(`Error processing ${fullPathToPcapFile} with tshark`);
    }
  });
};
