// server.js
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const app = require('./src/index');
const pool = require('./src/config/database');

const PORT = process.env.PORT || 5000;

// Test database connection before starting server
pool.testConnection().then(isConnected => {
    if (!isConnected) {
        console.error('FATAL: Could not connect to database. Please check your configuration.');
        process.exit(1);
    }
    
    // Create the HTTP server
    const server = http.createServer(app);
    
    // Start server on the specified port
    server.listen(PORT, '0.0.0.0', () => {
        console.log('=================================');
        console.log(`Server started on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV}`);
        console.log(`Time: ${new Date().toISOString()}`);
        console.log('=================================');
    });
    
    // Setup WebSocket server
    const wss = new WebSocket.Server({
        server,
        path: '/ws',
    });
    
    const clients = new Set();
    wss.on('connection', (ws) => {
        clients.add(ws);
        console.log('New WebSocket client connected');
        
        ws.on('close', () => {
            clients.delete(ws);
            console.log('WebSocket client disconnected');
        });
        
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });
    
    // Function to broadcast updates to all connected WebSocket clients
    const broadcastUpdate = (data) => {
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    };
    
    // Process event handlers
    process.on('SIGTERM', () => {
        console.log('SIGTERM received. Shutting down gracefully...');
        server.close(() => {
            console.log('Process terminated');
            process.exit(0);
        });
    });
    
    module.exports = { server, broadcastUpdate };
});

// Global error handlers
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});