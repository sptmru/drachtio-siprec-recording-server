const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const config = require('config');
const tmp = require('tmp');
const uploadRecordingToS3Bucket = require('./s3-uploader');

const logger = pino();
const { pcapDir, mp3Dir } = config.get('recordings');

/**
 * Converts a pcap file to an MP3 audio file, processing RTP packets within the pcap file.
 * Extracts and decodes RTP payloads, sorts the extracted data, and converts it to MP3.
 * Then, uploads the MP3 to an S3 bucket and deletes temporary files.
 *
 * @param {string} pcapFilePrefix - The prefix of the pcap file to find and process.
 * @param {string} recordingIdWithPath - The path and filename to save the resulting MP3.
 *
 * @throws {Error} Throws if directory read or file processing fails.
 *
 * @example
 * ```javascript
 * convertPcapToMp3('CALL123', 'output/recording-123');
 * ```
 */
module.exports = function(pcapFilePrefix, recordingIdWithPath) {
  let pcapFiles;
  try {
    pcapFiles = fs.readdirSync(pcapDir);
  } catch (err) {
    logger.error(`Error reading directory: ${pcapDir}`, err);
    return;
  }

  const matchingFiles = pcapFiles
    .filter((file) => file.startsWith(pcapFilePrefix) && file.endsWith('.pcap'))
    .map((file) => {
      const fullPath = path.join(pcapDir, file);
      try {
        const stats = fs.statSync(fullPath);
        return { file, time: stats.mtime }; // Prefer `mtime` over `birthtime`
      } catch (err) {
        logger.error(`Error retrieving stats for file: ${fullPath}`, err);
        return null;
      }
    });

  if (matchingFiles.length === 0) {
    logger.error(`There is no file starting with ${pcapFilePrefix}`);
    return;
  }

  const matchingFile = matchingFiles.sort((a, b) => b.time - a.time)[0].file;
  const fullPathToPcapFile = path.join(pcapDir, matchingFile);
  const mp3FileName = `${recordingIdWithPath}.mp3`;
  const fullPathToMp3File = path.join(mp3Dir, mp3FileName);

  logger.info(`Converting ${fullPathToPcapFile} to ${fullPathToMp3File}`);

  const tempRawFile = tmp.fileSync({ postfix: '.raw' });
  const tempSortedRawFile = tmp.fileSync({ postfix: '.sorted.raw' });

  const udpPorts = spawnSync('tshark', [
    '-r', fullPathToPcapFile,
    '-Y', 'udp',
    '-T', 'fields',
    '-e', 'udp.srcport',
    '-e', 'udp.dstport'
  ]);

  const udpPortsOutput = udpPorts.stdout.toString().split('\n').filter(Boolean);
  if (udpPortsOutput.length === 0) {
    logger.error('No UDP ports found in the pcap file.');
    return;
  }

  try {
    udpPortsOutput.forEach((line) => {
      const [srcPort, dstPort] = line.split(/\s+/);
      if (!srcPort || !dstPort) {
        return;
      }

      logger.info(`Processing RTP for src port ${srcPort}, dst port ${dstPort}`);

      // Force decode UDP ports as RTP and extract RTP payloads
      const tshark = spawnSync('tshark', [
        '-r', fullPathToPcapFile,
        '-d', `udp.port==${srcPort},rtp`,
        '-d', `udp.port==${dstPort},rtp`,
        '-Y', 'rtp',
        '-T', 'fields',
        '-e', 'rtp.payload'
      ]);

      const rtpPayloads = tshark.stdout.toString();
      if (rtpPayloads) {
        fs.appendFileSync(tempRawFile.name, rtpPayloads.replace(/\n/g, ''));
      }
    });

    if (fs.statSync(tempRawFile.name).size === 0) {
      logger.error('No valid RTP payloads found, exiting.');
      tempRawFile.removeCallback();
      return;
    }

    const sortCommand = spawnSync('sort', ['-n', tempRawFile.name]);
    fs.writeFileSync(tempSortedRawFile.name, sortCommand.stdout);

    ffmpeg()
      .input(tempSortedRawFile.name)
      .inputFormat('mulaw')
      .audioFrequency(8000)
      .audioChannels(1)
      .audioCodec('libmp3lame')
      .save(fullPathToMp3File)
      .on('end', async() => {
        logger.info(`Successfully saved MP3: ${fullPathToMp3File}`);
        tempRawFile.removeCallback();
        tempSortedRawFile.removeCallback();

        fs.unlink(fullPathToPcapFile, (err) => {
          if (err) logger.error(`Failed to delete pcap file: ${fullPathToPcapFile}`, err);
        });

        uploadRecordingToS3Bucket(fullPathToMp3File)
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
        tempRawFile.removeCallback();
        tempSortedRawFile.removeCallback();
      });
  } catch (error) {
    logger.error('An unexpected error occurred during processing', error);
    tempRawFile.removeCallback();
    tempSortedRawFile.removeCallback();
  }
};
