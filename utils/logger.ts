import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';

const logsDir = path.join(process.cwd(), 'logs');
fs.ensureDirSync(logsDir);

const getLogFileName = () => {
  const now = new Date();
  return `logs-${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()}-${now.getHours()}-${now.getMinutes()}.log`;
};

interface TransportWithFile extends winston.transport {
  filename?: string;
  close?: () => void;
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level}]: ${message}`;
        })
      ),
    }),
    new winston.transports.File({ filename: path.join(logsDir, getLogFileName()) }),
  ] as TransportWithFile[],
});

console.log('GAIB is logging to file', logsDir, getLogFileName());

// Update the log file every minute
setInterval(() => {
  const newLogFile = path.join(logsDir, getLogFileName());
  const fileTransportIndex = logger.transports.findIndex((transport) => transport instanceof winston.transports.File);

  if (fileTransportIndex !== -1) {
    const fileTransportInstance = logger.transports[fileTransportIndex] as TransportWithFile;

    if (fileTransportInstance.filename !== newLogFile) {
      if (fileTransportInstance.close) {
        fileTransportInstance.close();
      }
      console.log('GAIB rotating logging to file', newLogFile);
      logger.add(new winston.transports.File({ filename: newLogFile }));
      logger.remove(fileTransportInstance);
    }
  }
}, (60 * 60 * 24) * 1000); // new logfile every hour (in ms)

export default logger;
