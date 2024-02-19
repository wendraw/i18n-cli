/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
module.exports = {
  // 字段说明见：https://mogic.feishu.cn/wiki/DSXFw9NT9i6bm2kqgQHcASBUnWd?sheet=kPSOnh&range=MToyMjgz
  input: 'src',
  output: '',
  exclude: ['**/node_modules/**/*', '**/privacy/**', '**/agreement/**', '**/AICreate/**'],
  rules: {
    js: {
      caller: '',
      functionName: 'i18nt',
      customizeKey: function getCustomizeKey(key, path) {
        return key
      },
      importDeclaration: 'import { i18nt } from "@/locales/i18n"',
    },
    ts: {
      caller: '',
      functionName: 'i18nt',
      customizeKey: function getCustomizeKey(key, path) {
        return key
      },
      importDeclaration: 'import { i18nt } from "@/locales/i18n"',
    },
    cjs: {
      caller: '',
      functionName: 'i18nt',
      customizeKey: function getCustomizeKey(key, path) {
        return key
      },
      importDeclaration: 'import { i18nt } from "@/locales/i18n"',
    },
    mjs: {
      caller: '',
      functionName: 'i18nt',
      customizeKey: function getCustomizeKey(key, path) {
        return key
      },
      importDeclaration: 'import { i18nt } from "@/locales/i18n"',
    },
    jsx: {
      caller: '',
      functionName: 'i18nt',
      customizeKey: function getCustomizeKey(key, path) {
        return key
      },
      importDeclaration: 'import { i18nt } from "@/locales/i18n"',
      functionSnippets: '',
    },
    tsx: {
      caller: '',
      functionName: 'i18nt',
      customizeKey: function getCustomizeKey(key, path) {
        return key
      },
      importDeclaration: 'import { i18nt } from "@/locales/i18n"',
      functionSnippets: '',
    },
    vue: {
      caller: '',
      functionNameInTemplate: '$t',
      functionNameInScript: 'i18nt',
      customizeKey: function getCustomizeKey(key, path) {
        return key
      },
      importDeclaration: 'import { i18nt } from "@/locales/i18n"',
      tagOrder: ['template', 'script', 'style'],
    },
  },
  prettier: {
    semi: false,
    singleQuote: true,
    tabWidth: 2,
    printWidth: 120,
    useTabs: false,
    htmlWhitespaceSensitivity: 'ignore',
    endOfLine: 'auto',
  },
  incremental: true,
  skipExtract: false,
  localePath: './locales/zh-CN.json',
  localeFileType: 'json',
  excelPath: './locales/locales.xlsx',
  exportExcel: true,
  skipTranslate: true,
  locales: ['en-US'],
  globalRule: { ignoreMethods: [] },
  adjustKeyMap: function (allKeyValue, currentFileKeyMap, currentFilePath) {
    return allKeyValue
  },
}
