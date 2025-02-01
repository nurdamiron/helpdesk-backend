// src/middleware/debugMiddleware.js
const debugMiddleware = (req, res, next) => {
    console.log('\n=== Debug Info ===');
    console.log('Request URL:', req.originalUrl);
    console.log('Request Method:', req.method);
    console.log('Request Headers:', req.headers);
    console.log('Request Params:', req.params);
    console.log('Request Query:', req.query);
    console.log('Request Body:', req.body);
    console.log('================\n');
    next();
};

module.exports = debugMiddleware;

// Использование в app.js
app.use('/api/auth', debugMiddleware, authRoutes);