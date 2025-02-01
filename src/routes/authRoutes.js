const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Middleware для валидации регистрационных данных
const validateRegistration = (req, res, next) => {
    const { email, password, first_name, last_name, registration_type, company_data } = req.body;

    if (!email || !password || !first_name || !last_name || !registration_type) {
        return res.status(400).json({
            status: 'error',
            error: 'Missing required fields'
        });
    }

    if (!['company_owner', 'employee'].includes(registration_type)) {
        return res.status(400).json({
            status: 'error',
            error: 'Invalid registration type'
        });
    }

    if (registration_type === 'company_owner' && (!company_data?.name || !company_data?.bin_iin)) {
        return res.status(400).json({
            status: 'error',
            error: 'Company details required for company owner'
        });
    }

    if (registration_type === 'employee' && !company_data?.company_bin_iin) {
        return res.status(400).json({
            status: 'error',
            error: 'Company BIN/IIN required for employee registration'
        });
    }

    next();
};

// Основные маршруты авторизации
router.post('/register', validateRegistration, authController.register);
router.post('/login', authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', auth, authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', auth, authController.getMe);

module.exports = router;