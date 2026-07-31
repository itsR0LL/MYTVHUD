import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/.test-build',
      // 现有 Overlay 是上游压缩构建产物，不作为本项目源代码执行 Lint
      'src/main/overlay/file/**'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      // GSI 与 LowDB 边界包含动态第三方数据，现有代码统一允许显式 any
      '@typescript-eslint/no-explicit-any': 'off',
      // 项目主要依赖 TypeScript 推断返回类型
      '@typescript-eslint/explicit-function-return-type': 'off',
      // TypeScript 与 vue-tsc 负责标识符检查，避免基础规则误报类型声明
      'no-undef': 'off',
      // 允许有意忽略的清理型 catch，并忽略 catch 参数与下划线参数
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts'
          }
        }
      ]
    }
  },
  {
    files: ['src/main/**/file/**/*.js'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  eslintConfigPrettier
)
