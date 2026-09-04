import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: ['de-DE', 'en', 'es', 'zh-CN', 'hi', 'id', 'tr-TR', 'zh-TW'],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    output: 'public/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'common',
    keySeparator: false,
    nsSeparator: false,
    pluralSeparator: '——',
    contextSeparator: '——',
    primaryLanguage: 'en',
    defaultValue: (key, _namespace, language) => (language === 'en' ? key : ''),
    functions: ['t', '*.t'],
    transComponents: ['Trans'],
    sort: true,
  },
  types: {
    input: ['public/locales/en/*.json'],
    output: 'src/i18next.d.ts',
  },
})
