import ansi from 'ansi-colors';
//------------------------------------------------------------------------------//
// Time formatting function
const getTimestamp = (): string => {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const date = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `${date} ${time}`;
};

// Log level colors and background settings
const logLevels = {
  LOG: { color: ansi.white, bg: ansi.bgBlue },
  ERROR: { color: ansi.red, bg: ansi.bgRed },
  WARN: { color: ansi.yellow, bg: ansi.bgYellow },
  INFO: { color: ansi.cyan, bg: ansi.bgCyan },
  DEBUG: { color: ansi.magenta, bg: ansi.bgMagenta },
  SUCCESS: { color: ansi.green, bg: ansi.bgGreen },
} as const;

// Log message formatting function
const formatMessage = (
  level: keyof typeof logLevels,
  ...args: unknown[]
): void => {
  const timestamp = getTimestamp();
  const { color, bg } = logLevels[level];

  const levelTag = bg(ansi.white.bold(` ${level} `));
  const timeTag = ansi.dim(timestamp);
  const message = args
    .map((arg) =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    )
    .join(' ');

  console.log(`${levelTag} ${timeTag} ${color(message)}`);
};

export const logger = {
  log: (...args: unknown[]) => formatMessage('LOG', ...args),
  error: (...args: unknown[]) => formatMessage('ERROR', ...args),
  warn: (...args: unknown[]) => formatMessage('WARN', ...args),
  info: (...args: unknown[]) => formatMessage('INFO', ...args),
  debug: (...args: unknown[]) => formatMessage('DEBUG', ...args),
  success: (...args: unknown[]) => formatMessage('SUCCESS', ...args),
};
