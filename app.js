const assert = require('assert');
const config = require('config');
const pino = require('pino');
const Srf = require('drachtio-srf');
const srf = new Srf() ;
const logger = srf.locals.logger = pino();

const convert = require('xml-js');

const util = require('util');


let callHandler;

getInviteData = (req) => {
  const data = {};
  data.invite = {};

  data.invite.via = req.get('Via');
  data.invite.from = req.get('From');
  data.invite.to = req.get('To');
  data.invite.cseq = req.get('cseq');
  data.invite.contact = req.get('Contact');
  data.invite.subject = req.get('Subject');

  const sdp_payload = req.payload[0];
  const metadata_payload = req.payload[1];

  data.sdp_object = {};
  data.metadata_object = {};

  data.sdp_object.type = sdp_payload.type || false;
  data.sdp_object.content = sdp_payload.content || false;

  data.metadata_object.type = metadata_payload.type || false;
  data.metadata_object.content = false;
  data.metadata_object.content = convert.xml2js(metadata_payload.content, {compact: true, spaces: 4, nativeType: true, nativeTypeAttributes: true}) || false;

  return data;
}


if (config.has('drachtio.host')) {
  logger.info(config.get('drachtio'), 'attempting inbound connection');
  srf.connect(config.get('drachtio'));
  srf
    .on('connect', (err, hp) => { logger.info(`inbound connection to drachtio listening on ${hp}`);})
    .on('error', (err) => { logger.error(err, `Error connecting to drachtio server: ${err}`); });
}
else {
  logger.info(config.get('drachtio'), 'listening for outbound connections');
  srf.listen(config.get('drachtio'));
}

if (config.has('rtpengine')) {
  logger.info(config.get('rtpengine'), 'using rtpengine as the recorder');
  callHandler = require('./lib/rtpengine-call-handler');

  // we only want to deal with siprec invites (having multipart content) in this application
  srf.use('invite', (req, res, next) => {

    const ctype = req.get('Content-Type') || '';
    if (!ctype.includes('multipart/mixed')) {
      logger.info(`rejecting non-SIPREC INVITE with call-id ${req.get('Call-ID')}`);
      return res.send(488);
    } else {
      const inviteData = getInviteData(req);
      console.log(util.inspect(inviteData, false, null))
    }

    next();
  });

}
else if (config.has('freeswitch')) {
  logger.info(config.get('freeswitch'), 'using freeswitch as the recorder');
  callHandler = require('./lib/freeswitch-call-handler')(logger);
}
else {
  assert('recorder type not specified in configuration: must be either rtpengine or freeswitch');
}

srf.invite(callHandler);

module.exports = srf;
