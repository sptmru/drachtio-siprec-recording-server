const pino = require('pino');
const logger = pino();

module.exports = function(recordingId) {
  const parts = recordingId.split('/');
  if (parts.length === 1) {
    logger.info(`Recording ID ${recordingId} should be uploaded to the root directory`);
    return { subdirectoryName: '', recordingId: parts[0] };
  } else {
    logger.info(`Recording ID ${recordingId} should be uploaded to the subdirectory ${parts[0]}`);
    return { subdirectoryName: parts[0], recordingId: parts[1] };
  }
};
