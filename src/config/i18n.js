const i18n = require('i18n');
const path = require('path');

// Configure i18n
i18n.configure({
  locales: ['ru', 'en', 'kk'],
  directory: path.join(__dirname, '../locales'),
  defaultLocale: 'ru',
  objectNotation: true,
  updateFiles: false,
  syncFiles: false,
  autoReload: true,
  cookie: 'lang',
  header: 'accept-language',
  queryParameter: 'lang',
  register: global,
  api: {
    __: 't',
    __n: 'tn'
  }
});

// Middleware to set locale from request
const localeMiddleware = (req, res, next) => {
  // Get language from various sources
  const lang = req.query.lang || 
                req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 
                req.cookies?.lang ||
                'ru';
  
  // Set the locale
  const supportedLocales = ['ru', 'en', 'kk'];
  const locale = supportedLocales.includes(lang) ? lang : 'ru';
  
  i18n.setLocale(req, locale);
  res.locals.locale = locale;
  res.locals.__ = res.__ = (...args) => i18n.__(...args);
  
  next();
};

module.exports = {
  i18n,
  localeMiddleware
};