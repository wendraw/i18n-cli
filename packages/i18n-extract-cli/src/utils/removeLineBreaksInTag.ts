export function removeLineBreaksInTag(str: string): string {
  // 首先，替换字符串中间的换行符和空格为一个空格
  str = str.replace(/(\r\n|\r|\n)\s*/g, ' ')

  // 然后，去除字符串首尾的空白符
  str = str.replace(/^\s+|\s+$/g, '')

  return str
}
