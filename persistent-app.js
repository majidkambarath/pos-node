// persistent-app.js - Persistent Application Wrapper
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PersistentPOSServer {
    constructor() {
        this.serverProcess = null;
        this.isRunning = false;
        this.restartCount = 0;
        this.maxRestarts = 5;
        this.pidFile = path.join(__dirname, 'pos-server.pid');
        this.logFile = path.join(__dirname, 'pos-server.log');
        
        // Setup signal handlers
        this.setupSignalHandlers();
        
        // Check if already running
        this.checkExistingProcess();
    }

    setupSignalHandlers() {
        // Prevent accidental closure
        process.on('SIGINT', () => {
            console.log('\n⚠️  Press Ctrl+C again within 5 seconds to force quit, or close window to exit gracefully');
            setTimeout(() => {
                console.log('   Continuing to run... Use window close button or Task Manager to exit');
            }, 5000);
        });

        process.on('SIGTERM', () => {
            this.log('Received SIGTERM, but continuing to run');
        });

        // Handle Windows close event
        if (process.platform === 'win32') {
            process.on('SIGBREAK', () => {
                this.gracefulShutdown();
            });
        }

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.log(`Uncaught Exception: ${error.message}`);
            this.restartServer();
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
        });
    }

    checkExistingProcess() {
        if (fs.existsSync(this.pidFile)) {
            const pid = fs.readFileSync(this.pidFile, 'utf8').trim();
            try {
                process.kill(pid, 0); // Check if process exists
                console.log(`⚠️  POS Server already running with PID: ${pid}`);
                console.log('   Use Task Manager to close the existing instance first');
                process.exit(1);
            } catch (e) {
                // Process doesn't exist, remove stale PID file
                fs.unlinkSync(this.pidFile);
            }
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(message);
        
        try {
            fs.appendFileSync(this.logFile, logMessage);
        } catch (e) {
            // Ignore logging errors
        }
    }

    startServer() {
        if (this.isRunning) {
            this.log('Server is already running');
            return;
        }

        try {
            // Write PID file
            fs.writeFileSync(this.pidFile, process.pid.toString());
            
            // Start the main application
            const appPath = path.join(__dirname, 'app.js');
            
            if (!fs.existsSync(appPath)) {
                this.log('ERROR: app.js not found');
                return;
            }

            // Run the server in the same process to avoid detection
            this.isRunning = true;
            this.log('🚀 Starting POS Backend Server...');
            
            // Import and run the main application
            const mainApp = require('./app.js');
            
            // Keep the process alive
            this.keepAlive();
            
        } catch (error) {
            this.log(`Failed to start server: ${error.message}`);
            this.restartServer();
        }
    }

    keepAlive() {
        // Send periodic heartbeat to prevent termination
        const heartbeatInterval = setInterval(() => {
            if (this.isRunning) {
                // Silent heartbeat - just keep the process active
                // Uncomment next line for debugging
                // this.log('Server heartbeat - running normally');
            } else {
                clearInterval(heartbeatInterval);
            }
        }, 60000); // Every minute

        // Monitor system resources
        setInterval(() => {
            const usage = process.memoryUsage();
            this.log(`Memory usage: ${Math.round(usage.rss / 1024 / 1024)}MB`);
        }, 300000); // Every 5 minutes
    }

    restartServer() {
        if (this.restartCount >= this.maxRestarts) {
            this.log('Maximum restart attempts reached. Server stopping.');
            this.gracefulShutdown();
            return;
        }

        this.restartCount++;
        this.log(`Restarting server (attempt ${this.restartCount}/${this.maxRestarts})`);
        
        setTimeout(() => {
            this.isRunning = false;
            setTimeout(() => {
                this.startServer();
            }, 2000);
        }, 1000);
    }

    gracefulShutdown() {
        this.log('Initiating graceful shutdown...');
        this.isRunning = false;
        
        // Clean up PID file
        try {
            if (fs.existsSync(this.pidFile)) {
                fs.unlinkSync(this.pidFile);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        
        this.log('POS Server shutdown complete');
        process.exit(0);
    }

    displayStatus() {
        console.log('\n' + '='.repeat(50));
        console.log('🏪 POS Backend Server - Status Dashboard');
        console.log('='.repeat(50));
        console.log(`Status: ${this.isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`);
        console.log(`Process ID: ${process.pid}`);
        console.log(`Restart Count: ${this.restartCount}/${this.maxRestarts}`);
        console.log(`Uptime: ${Math.floor(process.uptime() / 60)} minutes`);
        console.log('='.repeat(50));
        console.log('💡 To stop the server:');
        console.log('   • Close this window');
        console.log('   • Use Task Manager (End Task)');
        console.log('   • Ctrl+Alt+Del → Task Manager');
        console.log('='.repeat(50) + '\n');
    }
}

// Initialize and start the persistent server
const posServer = new PersistentPOSServer();

// Display initial status
posServer.displayStatus();

// Start the server
posServer.startServer();

// Update status every 30 seconds
setInterval(() => {
    posServer.displayStatus();
}, 30000);

// Export for testing
module.exports = PersistentPOSServer;