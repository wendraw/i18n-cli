import { t } from '../../locales/i18n'
import { Ref, computed } from 'vue'

export const text = (count: Ref<number>) => {
  return computed(() => t('计数是：{slot1}', { slot1: count.value }))
}
