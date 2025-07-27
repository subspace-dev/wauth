export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    OFF = 4
}

export class WAuthLogger {
    private static instance: WAuthLogger;
    private logLevel: LogLevel = LogLevel.INFO;
    private prefix: string = '[WAuth SDK]';
    private isFirstLog: boolean = true;

    private constructor() {
        // Set log level from environment or default
        const envLogLevel = (typeof process !== 'undefined' && process.env?.WAUTH_LOG_LEVEL) || 'INFO';
        this.logLevel = LogLevel[envLogLevel.toUpperCase() as keyof typeof LogLevel] || LogLevel.INFO;
    }

    static getInstance(): WAuthLogger {
        if (!WAuthLogger.instance) {
            WAuthLogger.instance = new WAuthLogger();
        }
        return WAuthLogger.instance;
    }

    private showWAuthHeader(): void {
        if (this.isFirstLog) {
            console.log('%c┌─────────────────────────────────────────────┐', 'color: #FF6B35;');
            console.log('%c│           🔐 WAUTH SDK LOGS 🔐             │', 'color: #FF6B35; font-weight: bold;');
            console.log('%c└─────────────────────────────────────────────┘', 'color: #FF6B35;');
            console.log('');
            this.isFirstLog = false;
        }
    }

    setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.logLevel;
    }

    private formatMessage(level: string, component: string, message: string, data?: any): string {
        const timestamp = new Date().toISOString();
        const baseMessage = `${this.prefix} ${timestamp} [${level}] [${component}] ${message}`;

        if (data) {
            return `${baseMessage} ${JSON.stringify(data, null, 2)}`;
        }
        return baseMessage;
    }

    debug(component: string, message: string, data?: any): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.debug(this.formatMessage('DEBUG', component, message, data));
        }
    }

    info(component: string, message: string, data?: any): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(this.formatMessage('INFO', component, message, data));
        }
    }

    warn(component: string, message: string, data?: any): void {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage('WARN', component, message, data));
        }
    }

    error(component: string, message: string, error?: any): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            let errorData = error;
            if (error instanceof Error) {
                errorData = {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                };
            }
            console.error(this.formatMessage('ERROR', component, message, errorData));
        }
    }

    // WAuth-specific beautified logging methods
    authStart(operation: string, provider?: string, input?: any): void {
        this.showWAuthHeader();

        const providerText = provider ? ` via ${provider}` : '';
        console.groupCollapsed(
            `%c🔐 ${operation}${providerText}`,
            'color: #FF6B35; font-weight: bold; font-size: 12px;'
        );

        if (input && Object.keys(input).length > 0) {
            console.log('%cInput:', 'color: #4CAF50; font-weight: bold;', input);
        }
    }

    authSuccess(operation: string, result?: any, duration?: number): void {
        const durationText = duration ? ` (${duration}ms)` : '';
        console.log('%cResult:', 'color: #2196F3; font-weight: bold;', result);
        console.groupEnd();

        // Show a success summary
        console.log(
            `%c✅ ${operation} completed successfully${durationText}`,
            'color: #4CAF50; font-weight: bold; font-size: 11px;'
        );
    }

    authError(operation: string, error: any, duration?: number): void {
        const errorStr = error instanceof Error ? error.message : String(error);
        const durationText = duration ? ` (${duration}ms)` : '';

        console.log('%cError:', 'color: #F44336; font-weight: bold;', errorStr);

        if (error instanceof Error && error.stack) {
            console.log('%cStack Trace:', 'color: #FF9800; font-weight: bold;');
            console.log(error.stack);
        }
        console.groupEnd();

        // Show an error summary
        console.log(
            `%c❌ ${operation} failed${durationText}`,
            'color: #F44336; font-weight: bold; font-size: 11px;'
        );
    }

    // Wallet operations
    walletOperation(operation: string, details?: any): void {
        console.groupCollapsed(
            `%c💳 Wallet ${operation}`,
            'color: #9C27B0; font-weight: bold; font-size: 12px;'
        );
        if (details) {
            console.log('%cDetails:', 'color: #2196F3; font-weight: bold;', details);
        }
        console.groupEnd();
    }

    // Session management
    sessionUpdate(action: string, details?: any): void {
        console.groupCollapsed(
            `%c🔑 Session ${action}`,
            'color: #607D8B; font-weight: bold; font-size: 12px;'
        );
        if (details) {
            console.log('%cSession Info:', 'color: #2196F3; font-weight: bold;', details);
        }
        console.groupEnd();
    }

    // Password operations
    passwordOperation(operation: string, success: boolean = true, attempt?: number): void {
        const icon = success ? '🔓' : '🔒';
        const color = success ? '#4CAF50' : '#FF9800';
        const attemptText = attempt ? ` (attempt ${attempt})` : '';

        console.log(
            `%c${icon} Password ${operation}${attemptText}`,
            `color: ${color}; font-weight: bold; font-size: 11px;`
        );
    }

    // Backend operations
    backendRequest(method: string, endpoint: string, status?: number): void {
        const statusIcon = status && status < 400 ? '📡' : '⚠️';
        const statusColor = status && status < 400 ? '#2196F3' : '#FF9800';
        const statusText = status ? ` [${status}]` : '';

        console.log(
            `%c${statusIcon} ${method} ${endpoint}${statusText}`,
            `color: ${statusColor}; font-weight: bold; font-size: 11px;`
        );
    }

    // Construction and initialization
    initialization(message: string, data?: any): void {
        console.groupCollapsed(
            `%c⚡ WAuth ${message}`,
            'color: #FF6B35; font-weight: bold; font-size: 12px;'
        );
        if (data) {
            console.log('%cConfig:', 'color: #2196F3; font-weight: bold;', data);
        }
        console.groupEnd();
    }

    // Simple styled logging for common operations
    simple(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
        const styles = {
            info: { icon: 'ℹ️', color: '#2196F3' },
            warn: { icon: '⚠️', color: '#FF9800' },
            error: { icon: '❌', color: '#F44336' }
        };

        const { icon, color } = styles[level];

        if (data) {
            console.groupCollapsed(
                `%c${icon} ${message}`,
                `color: ${color}; font-weight: bold; font-size: 11px;`
            );
            console.log('%cData:', 'color: #666; font-weight: bold;', data);
            console.groupEnd();
        } else {
            console.log(
                `%c${icon} ${message}`,
                `color: ${color}; font-weight: bold; font-size: 11px;`
            );
        }
    }
}

// Export singleton instance
export const wauthLogger = WAuthLogger.getInstance();

// Helper function to measure execution time for WAuth operations
export function measureWAuthTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    return fn().then(result => ({
        result,
        duration: Date.now() - start
    }));
}

// Helper function to wrap WAuth operations with logging
export async function loggedWAuthOperation<T>(
    operation: string,
    input: any,
    fn: () => Promise<T>,
    provider?: string
): Promise<T> {
    const logger = WAuthLogger.getInstance();
    const startTime = Date.now();

    // Show operation start
    logger.authStart(operation, provider, input);

    try {
        const result = await fn();
        const duration = Date.now() - startTime;
        logger.authSuccess(operation, result, duration);
        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.authError(operation, error, duration);
        throw error;
    }
} 