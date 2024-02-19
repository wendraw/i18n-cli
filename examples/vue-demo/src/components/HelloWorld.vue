
<template>
  <h1>{{ msg + '---组合' }}</h1>

  <div class="card">
    <button type="button" @click="count++">数量为 {{ count }}</button>
    <p :title="'标题'">
      测试项目
    </p>
    <p>测试 ts 内容 {{ str }}</p>
    <button type="button" @click="toggleLocale">点击切换语言</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import i18n from '../../locales/i18n'
import { text } from '../utils/test'

defineProps<{ msg: string }>()

const count = ref(0)

const str = text(count)

const toggleLocale = () => {
  const locale: string = localStorage.getItem('locale') || ''
  i18n.global.locale.value = locale === 'zh-CN' ? 'en-US' : 'zh-CN'
  localStorage.setItem('locale', i18n.global.locale.value)
  location.reload()
}
</script>
<style scoped>
.read-the-docs {
  color: #888;
}
</style>
