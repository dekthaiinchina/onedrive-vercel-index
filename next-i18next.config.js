const path = require('path')

module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['de-DE', 'en', 'es', 'zh-CN', 'th', 'hi', 'id', 'tr-TR', 'zh-TW']
  },
  localePath: path.resolve('public/locales'),
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  keySeparator: false,
  namespaceSeparator: false,
  pluralSeparator: '——',
  contextSeparator: '——'
}
