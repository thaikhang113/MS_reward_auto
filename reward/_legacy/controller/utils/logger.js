// =============================================
// CENTRALIZED LOGGER
// Consistent logging across the application
// =============================================

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

class Logger {
    constructor(level = LOG_LEVELS.INFO, prefix = '') {
        this.level = level;
        this.prefix = prefix ? `[${prefix}] ` : '';
    }

    setLevel(level) {
        this.level = level;
    }

    shouldLog(level) {
        return level <= this.level;
    }

    format(message, type = 'INFO') {
        const timestamp = new Date().toISOString();
        const prefix = this.prefix ? this.prefix : '';
        return `${timestamp} ${prefix}[${type}] ${message}`;
    }

    error(message, error = null) {
        if (this.shouldLog(LOG_LEVELS.ERROR)) {
            console.error(this.format(message, 'ERROR'));
            if (error) {
                if (error instanceof Error) {
                    console.error(`  └─ Error: ${error.message}`);
                    if (error.stack) console.error(`  └─ Stack: ${error.stack.split('\n')[0]}`);
                } else {
                    console.error(`  └─ Details: ${JSON.stringify(error)}`);
                }
            }
        }
    }

    warn(message) {
        if (this.shouldLog(LOG_LEVELS.WARN)) {
            console.warn(this.format(message, 'WARN'));
        }
    }

    info(message) {
        if (this.shouldLog(LOG_LEVELS.INFO)) {
            console.info(this.format(message, 'INFO'));
        }
    }

    debug(message) {
        if (this.shouldLog(LOG_LEVELS.DEBUG)) {
            console.debug(this.format(message, 'DEBUG'));
        }
    }

    trace(message) {
        if (this.shouldLog(LOG_LEVELS.TRACE)) {
            console.log(this.format(message, 'TRACE'));
        }
    }
}

module.exports = {
    Logger,
    LOG_LEVELS
};
