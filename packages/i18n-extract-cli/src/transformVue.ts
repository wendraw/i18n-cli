import type {
  SFCScriptBlock,
  SFCStyleBlock,
  SFCTemplateBlock,
  SFCDescriptor,
} from '@vue/compiler-sfc'
import { parse } from '@vue/compiler-sfc'
import * as htmlparser2 from 'htmlparser2'
import traverse from '@babel/traverse'
import prettier from 'prettier'
import mustache from './mustache/mustache'
import ejs from 'ejs'
import type { Rule, TagOrder, transformOptions } from '../types'
import { includeChinese } from './utils/includeChinese'
import log from './utils/log'
import transformJs, { TemplateParams } from './transformJs'
import { initParse } from './parse'
import { escapeQuotes } from './utils/escapeQuotes'
import Collector from './collector'
import { IGNORE_REMARK } from './utils/constants'
import StateManager from './utils/stateManager'
import { removeLineBreaksInTag } from './utils/removeLineBreaksInTag'

const presetTypescript = require('@babel/preset-typescript')

type Handler = (source: string, rule: Rule) => string
const COMMENT_TYPE = '!'

function parseJsSyntax(source: string, rule: Rule, isJsInVue?: boolean): string {
  // html属性有可能是{xx:xx}这种对象形式，直接解析会报错，需要特殊处理。
  // 先处理成temp = {xx:xx} 让babel解析，解析完再还原成{xx:xx}
  let isObjectStruct = false
  if (source.startsWith('{') && source.endsWith('}')) {
    isObjectStruct = true
    source = `temp=${source}`
  }
  const { code } = transformJs(source, {
    rule: {
      ...rule,
      functionName: rule.functionNameInTemplate,
      caller: '',
      importDeclaration: '',
    },
    parse: initParse([[presetTypescript, { isTSX: false, allExtensions: true }]]),
    isJsInVue,
  })

  let stylizedCode = prettier.format(code, {
    singleQuote: true,
    semi: false,
    parser: 'babel',
  })

  // pretter格式化后有时会多出分号
  if (stylizedCode.startsWith(';')) {
    stylizedCode = stylizedCode.slice(1)
  }

  if (isObjectStruct) {
    stylizedCode = stylizedCode.replace('temp = ', '')
  }
  return stylizedCode.endsWith('\n') ? stylizedCode.slice(0, stylizedCode.length - 1) : stylizedCode
}

// 判断表达式是否已经转换成i18n
function hasTransformed(code: string, functionNameInTemplate: string): boolean {
  return new RegExp(`\\${functionNameInTemplate}\\(.*\\)`, 'g').test(code)
}

// TODO: 需要优化，传参方式太挫
function parseTextNode(
  text: string,
  rule: Rule,
  getReplaceValue: (translationKey: string) => string,
  customizeKey: (key: string) => string
) {
  const hasChinese = includeChinese(text)
  if (!hasChinese) {
    return text
  }
  let str = ''
  const tokens = mustache.parse(text)
  // 将文本 测试 {{ `中文${str}b` }} 合并中文变量 => `测试  ${`中文${str}b`}  合并中文变量`
  for (const token of tokens) {
    const type = token[0]
    const value = token[1]
    if (type === 'text') {
      str += value
    } else if (type === 'name') {
      str += `\${${value}}`
    } else if (type === COMMENT_TYPE) {
      // 形如{{!xxxx}}这种形式，在mustache里属于注释语法
      str += `\${!${value}}`
    }
  }
  const res = parseJsSyntax(`\`${str}\``, rule, true)
  return `{{${res}}}`
}

function handleTemplate(code: string, rule: Rule): string {
  let htmlString = ''
  const { functionNameInTemplate, customizeKey } = rule

  function getReplaceValue(translationKey: string): string {
    // 表达式结构 $t('xx')
    return `${functionNameInTemplate}('${translationKey}')`
  }

  function parseIgnoredTagAttribute(attributes: Record<string, string | undefined>): string {
    let attrs = ''
    for (const key in attributes) {
      const attrValue = attributes[key]
      if (attrValue === undefined) {
        attrs += ` ${key} `
      } else {
        attrs += ` ${key}="${attrValue}" `
      }
    }
    return attrs
  }

  function parseTagAttribute(attributes: Record<string, string | undefined>): string {
    let attrs = ''
    for (const key in attributes) {
      const attrValue = attributes[key]
      const isVueDirective = key.startsWith(':') || key.startsWith('@') || key.startsWith('v-')
      if (attrValue === undefined) {
        attrs += ` ${key} `
      } else if (includeChinese(attrValue) && isVueDirective) {
        const source = parseJsSyntax(attrValue, rule)
        // 处理属性类似于:xx="'xx'"，这种属性值不是js表达式的情况。attrValue === source即属性值不是js表达式
        // !hasTransformed()是为了排除，类似:xx="$t('xx')"这种已经转化过的情况。这种情况不需要二次处理
        if (attrValue === source && !hasTransformed(source, functionNameInTemplate ?? '')) {
          const translationKey = Collector.add(removeQuotes(attrValue), customizeKey)
          const expression = getReplaceValue(translationKey)
          attrs += ` ${key}="${expression}" `
        } else {
          attrs += ` ${key}="${source}" `
        }
      } else if (includeChinese(attrValue) && !isVueDirective) {
        const translationKey = Collector.add(attrValue, (key, path) => {
          // 属性里的$t('')转成$t(``)，并把双引号转成单引号
          key = key.replace(/'/g, '`').replace(/"/g, "'")
          return customizeKey(key, path)
        })
        const expression = getReplaceValue(translationKey)
        attrs += ` :${key}="${expression}" `
      } else if (attrValue === '') {
        // 这里key=''是因为之后还会被pretttier处理一遍，所以写死单引号没什么影响
        attrs += `${key}='' `
      } else {
        attrs += ` ${key}="${attrValue}" `
      }
    }
    return attrs
  }

  // 转义特殊字符
  function escapeSpecialChar(text: string): string {
    text = text.replace(/&nbsp;/g, ' ')
    text = text.replace(/&lt;/g, '<')
    text = text.replace(/&gt;/g, '>')
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/&amp;/g, '&')
    return text
  }

  let shouldIgnore = false // 是否忽略提取
  let textNodeCache = '' // 缓存当前文本节点内容
  let attrsCache: Record<string, string | undefined> = {} // 缓存当前标签的属性
  const ignoreTags: string[] = [] // 记录忽略提取的标签名
  const parser = new htmlparser2.Parser(
    {
      onopentag(tagName) {
        // 处理文本节点没有被标签包裹的情况
        // 如果这个标签没被忽略提取，那么就进行文本节点解析
        if (!shouldIgnore) {
          const text = parseTextNode(textNodeCache, rule, getReplaceValue, customizeKey)
          htmlString += text
          textNodeCache = ''
        }

        let attrs = ''
        const attributes = attrsCache
        if (shouldIgnore) {
          ignoreTags.push(tagName)
          attrs = parseIgnoredTagAttribute(attributes)
          // 重置属性缓存
          attrsCache = {}
          htmlString += `<${tagName} ${attrs}>`
          return
        }

        attrs = parseTagAttribute(attributes)
        // 重置属性缓存
        attrsCache = {}
        htmlString += `<${tagName} ${attrs}>`
      },

      onattribute(name, value, quote) {
        if (value) {
          attrsCache[name] = value
        } else {
          if (quote === undefined) {
            attrsCache[name] = undefined
          } else {
            attrsCache[name] = value
          }
        }
      },

      ontext(text) {
        text = escapeSpecialChar(text)

        if (shouldIgnore) {
          htmlString += text
          return
        }
        textNodeCache += text
      },

      onclosetag(tagName, isImplied) {
        // 处理文本被标签包裹的情况
        // 如果这个标签没被忽略提取，那么就进行文本节点解析
        if (!shouldIgnore) {
          const text = parseTextNode(textNodeCache, rule, getReplaceValue, customizeKey)
          htmlString += text
          textNodeCache = ''
        }

        // 判断是否可以取消忽略提取
        if (ignoreTags.length === 0) {
          shouldIgnore = false
        } else {
          if (ignoreTags[ignoreTags.length - 1] === tagName) {
            ignoreTags.pop()
            if (ignoreTags.length === 0) {
              shouldIgnore = false
            }
          }
        }

        // 如果是自闭合标签
        if (isImplied) {
          htmlString = htmlString.slice(0, htmlString.length - 2) + '/>'
          return
        }
        htmlString += `</${tagName}>`
      },

      oncomment(comment) {
        // 如果注释前有文本节点，就拼接
        const text = parseTextNode(textNodeCache, rule, getReplaceValue, customizeKey)
        htmlString += text
        textNodeCache = ''

        if (comment.includes(IGNORE_REMARK)) {
          shouldIgnore = true
        }
        htmlString += `<!--${comment}-->`
      },
    },
    {
      lowerCaseTags: false,
      recognizeSelfClosing: true,
      lowerCaseAttributeNames: false,
      decodeEntities: false,
    }
  )

  parser.write(code)
  parser.end()
  return htmlString
}

// 找出@Component位置
function findExportDefaultDeclaration(source: string, parser: (code: string) => any): number {
  let startIndex = -1
  const ast = parser(source)
  traverse(ast, {
    ExportDefaultDeclaration(path) {
      const { node } = path
      const declaration = path.get('declaration')
      if (declaration.isClassDeclaration()) {
        const decorators = declaration.node.decorators
        if (decorators && decorators.length > 0) {
          // 找出@Component装饰器进行分割
          const componentDecorator = decorators.find((decorator) => {
            return (
              (decorator.expression.type === 'Identifier' &&
                decorator.expression.name === 'Component') ||
              (decorator.expression.type === 'CallExpression' &&
                decorator.expression.callee.type === 'Identifier' &&
                decorator.expression.callee.name === 'Component')
            )
          })
          if (componentDecorator) {
            startIndex = node.start ?? 0
            path.skip()
          }
        }
      }
    },
  })
  return startIndex
}

function handleScript(source: string, rule: Rule): string {
  // TODO: 这里babel解析可以优化，不然vue文件的script会重复解析两次浪费性能
  const parser = initParse([[presetTypescript, { isTSX: false, allExtensions: true }]])
  const startIndex = findExportDefaultDeclaration(source, parser)
  const transformOptions = {
    rule: {
      ...rule,
      functionName: rule.functionNameInScript,
    },
    isJsInVue: true, // 标记处理vue里的js
    parse: initParse([[presetTypescript, { isTSX: false, allExtensions: true }]]),
  }

  if (startIndex !== -1) {
    // 含ts的vue处理
    //把vue的script拆分成 export default 部分和非export default部分分别解析
    const notDefaultPart = source.slice(0, startIndex)
    const defaultPart = source.slice(startIndex)
    const defaultCode = transformJs(defaultPart, transformOptions).code
    const notDefaultCode = transformJs(notDefaultPart, {
      ...transformOptions,
      rule: StateManager.getToolConfig().rules.js,
    }).code
    if (notDefaultCode) {
      return '\n' + notDefaultCode + '\n' + defaultCode + '\n'
    } else {
      return defaultCode + '\n'
    }
  } else {
    const code = transformJs(source, transformOptions).code
    return code
  }
}

function mergeCode(
  tagOrder: TagOrder,
  tagMap: {
    template: string
    script: string
    style: string
  }
): string {
  const sourceCode = tagOrder.reduce((code, tagName) => {
    return code + tagMap[tagName]
  }, '')
  return sourceCode
}

function removeQuotes(value: string): string {
  if (['"', "'"].includes(value.charAt(0)) && ['"', "'"].includes(value.charAt(value.length - 1))) {
    value = value.substring(1, value.length - 1)
  }

  return value
}

function getWrapperTemplate(sfcBlock: SFCTemplateBlock | SFCScriptBlock | SFCStyleBlock): string {
  const { type, lang, attrs } = sfcBlock
  let template = `<${type}`

  if (lang) {
    template += ` lang="${lang}"`
  }
  if ((sfcBlock as SFCScriptBlock).setup) {
    template += ` setup`
  }
  if ((sfcBlock as SFCStyleBlock).scoped) {
    template += ` scoped`
  }
  for (const attr in attrs) {
    if (!['lang', 'scoped', 'setup'].includes(attr)) {
      if (attrs[attr] === true) {
        template += attr
      } else {
        template += ` ${attr}="${attrs[attr]}"`
      }
    }
  }
  template += `><%- code %></${type}>`
  return template
}

function generateSource(
  sfcBlock: SFCTemplateBlock | SFCScriptBlock,
  handler: Handler,
  rule: Rule
): string {
  const wrapperTemplate = getWrapperTemplate(sfcBlock)
  const source = handler(sfcBlock.content, rule)
  return ejs.render(wrapperTemplate, {
    code: source,
  })
}

function removeSnippet(
  source: string,
  sfcBlock: SFCTemplateBlock | SFCScriptBlock | SFCStyleBlock | null
): string {
  return sfcBlock ? source.replace(sfcBlock.content, '') : source
}

// 提取文件头注释
// TODO: 这里投机取巧了一下，把标签内容清空再匹配注释。避免匹配错了。后期有好的方案再替换
function getFileComment(descriptor: SFCDescriptor): string {
  const { template, script, scriptSetup, styles } = descriptor
  let source = descriptor.source
  source = removeSnippet(source, template)
  source = removeSnippet(source, script)
  source = removeSnippet(source, scriptSetup)
  if (styles) {
    for (const style of styles) {
      source = removeSnippet(source, style)
    }
  }
  const result = source.match(/<!--[\s\S]*?-->/)
  return result ? result[0] : ''
}

function transformVue(
  code: string,
  options: transformOptions
): {
  code: string
} {
  const { rule, filePath } = options
  const { descriptor, errors } = parse(code)
  if (errors.length > 0) {
    const line = (errors[0] as any).loc.start.line
    log.error(`源文件${filePath}第${line}行附近解析出现错误：`, errors[0].toString())

    return {
      code,
    }
  }

  const { template, script, scriptSetup, styles } = descriptor
  let templateCode = ''
  let scriptCode = ''
  let stylesCode = ''

  const fileComment = getFileComment(descriptor)

  if (template) {
    templateCode = generateSource(template, handleTemplate, rule)
  }

  if (script) {
    scriptCode = generateSource(script, handleScript, rule)
  }

  if (scriptSetup) {
    scriptCode = generateSource(scriptSetup, handleScript, rule)
  }

  if (styles) {
    for (const style of styles) {
      const wrapperTemplate = getWrapperTemplate(style)
      const source = style.content
      stylesCode +=
        ejs.render(wrapperTemplate, {
          code: source,
        }) + '\n'
    }
  }

  const tagMap = {
    template: templateCode,
    script: scriptCode,
    style: stylesCode,
  }
  const tagOrder = StateManager.getToolConfig().rules.vue.tagOrder
  code = mergeCode(tagOrder, tagMap)
  if (fileComment) {
    code = fileComment + code
  }
  return {
    code,
  }
}

export default transformVue
