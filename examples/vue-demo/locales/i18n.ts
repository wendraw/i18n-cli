import { createI18n, useI18n } from 'vue-i18n'
import zh from './zh-CN.json'
import en from './en-US.json'
const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'zh-CN',
  // 默认语言
  messages: {
    'zh-CN': zh,
    // 中文
    'en-US': en, // 英文
  },
})

export default i18n

const t = i18n.global.t

export { useI18n, t }
