# 📝 Quiz页面结构适配指南

## 🎯 概述

当Microsoft Rewards的Quiz页面结构发生变化时，脚本可能会失效。本指南提供了系统性的适配思路和具体方法。

## 🔍 问题诊断

### 1. 识别Quiz页面变化的症状

**常见错误信息**：
```
[ERROR] GET-QUIZ-DATA] Script containing quiz data not found
[ERROR] QUIZ] Failed to extract quiz data
[WARN] QUIZ] Quiz data script not found - activity may not be a quiz type
```

**问题表现**：
- Quiz活动无法启动
- 答案选项无法点击
- 页面加载后卡住不动
- 数据解析失败

### 2. 使用调试工具分析

**运行调试脚本**：
```bash
npm run debug-quiz "https://rewards.microsoft.com/quiz/xxx"
```

**调试工具会分析**：
- 页面中的Quiz数据源
- 关键DOM元素的存在性
- 页面结构变化
- 生成具体的适配建议

## 🛠️ 适配方法

### 方法1: 更新数据获取逻辑

**当前实现** (`src/browser/BrowserFunc.ts`):
```typescript
// 现有的单一模式检测
const regex = /_w\.rewardsQuizRenderInfo\s*=\s*({.*?});/s
const match = regex.exec(scriptContent)
```

**增强实现**:
```typescript
async getQuizData(page: Page): Promise<QuizData> {
    // 1. 多模式Script检测
    const scriptPatterns = [
        { name: '_w.rewardsQuizRenderInfo', regex: /_w\.rewardsQuizRenderInfo\s*=\s*({.*?});/s },
        { name: 'window.rewardsQuizRenderInfo', regex: /window\.rewardsQuizRenderInfo\s*=\s*({.*?});/s },
        { name: 'Microsoft.Rewards.Quiz', regex: /Microsoft\.Rewards\.Quiz[^=]*=\s*({.*?});/s },
        { name: 'quiz_data', regex: /quiz_data\s*[=:]\s*({.*?});?/s }
    ]
    
    // 2. 使用page.evaluate()直接获取
    try {
        const quizData = await page.evaluate(() => {
            // 尝试多种JavaScript变量
            return window._w?.rewardsQuizRenderInfo || 
                   window.rewardsQuizRenderInfo ||
                   window.Microsoft?.Rewards?.Quiz ||
                   window.quiz_data ||
                   null
        })
        if (quizData) return quizData
    } catch (error) {
        console.log('Direct JS evaluation failed')
    }

    // 3. 监听网络请求获取数据
    const quizApiData = await this.interceptQuizAPI(page)
    if (quizApiData) return quizApiData
    
    throw new Error('All quiz data extraction methods failed')
}
```

### 方法2: 网络请求拦截

**新增API数据获取**:
```typescript
async interceptQuizAPI(page: Page): Promise<QuizData | null> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 10000)
        
        page.on('response', async (response) => {
            const url = response.url()
            
            // 检查可能的Quiz API端点
            if (url.includes('/quiz/') || 
                url.includes('/rewards/') ||
                url.includes('quiz') && url.includes('api')) {
                
                try {
                    const data = await response.json()
                    if (data && (data.maxQuestions || data.correctAnswer)) {
                        clearTimeout(timeout)
                        resolve(data)
                    }
                } catch (error) {
                    // JSON解析失败，继续监听
                }
            }
        })
    })
}
```

### 方法3: 灵活的DOM选择器

**增强选择器策略**:
```typescript
// 多重选择器fallback
async findQuizElement(page: Page, elementType: string): Promise<ElementHandle | null> {
    const selectorGroups = {
        startButton: [
            '#rqStartQuiz',
            'button[data-testid="quiz-start"]',
            'button[class*="quiz-start"]',
            'button:has-text("开始")',
            'button:has-text("Start")',
            '.quiz-start-btn'
        ],
        answerOption: [
            '#rqAnswerOption{index}',
            '[data-testid="quiz-answer-{index}"]',
            '.quiz-option-{index}',
            '[data-answer-index="{index}"]'
        ]
    }
    
    const selectors = selectorGroups[elementType] || []
    
    for (const selector of selectors) {
        try {
            const element = await page.waitForSelector(selector, { timeout: 2000 })
            if (element && await element.isVisible()) {
                return element
            }
        } catch (error) {
            continue // 尝试下一个选择器
        }
    }
    
    return null // 所有选择器都失败
}
```

### 方法4: 智能页面交互

**增强的Quiz处理逻辑**:
```typescript
async doQuiz(page: Page) {
    try {
        // 1. 智能检测Quiz类型
        const quizType = await this.detectQuizType(page)
        console.log(`检测到Quiz类型: ${quizType}`)
        
        // 2. 根据类型使用不同策略
        switch (quizType) {
            case 'traditional':
                await this.handleTraditionalQuiz(page)
                break
            case 'modern':
                await this.handleModernQuiz(page)
                break
            case 'api-based':
                await this.handleAPIBasedQuiz(page)
                break
            default:
                await this.handleUnknownQuiz(page)
        }
        
    } catch (error) {
        console.log(`Quiz处理失败，尝试通用方法: ${error}`)
        await this.handleGenericQuiz(page)
    }
}

async detectQuizType(page: Page): Promise<string> {
    // 检测页面特征来判断Quiz类型
    const hasTraditionalElements = await page.waitForSelector('#rqStartQuiz', { timeout: 2000 }).catch(() => null)
    const hasModernElements = await page.waitForSelector('[data-testid*="quiz"]', { timeout: 2000 }).catch(() => null)
    const hasAPIData = await page.evaluate(() => !!window.fetch)
    
    if (hasTraditionalElements) return 'traditional'
    if (hasModernElements) return 'modern'
    if (hasAPIData) return 'api-based'
    return 'unknown'
}
```

## 🔧 具体实施步骤

### 步骤1: 页面分析

1. **手动访问Quiz页面**:
   - 打开浏览器开发者工具
   - 访问失效的Quiz页面
   - 查看Network面板的请求
   - 检查Elements面板的DOM结构

2. **使用调试工具**:
   ```bash
   npm run debug-quiz "https://rewards.microsoft.com/quiz/..."
   ```

3. **记录关键信息**:
   - 新的数据源位置
   - 变化的DOM选择器
   - API请求端点
   - 页面加载时序

### 步骤2: 代码更新

1. **更新BrowserFunc.ts**:
   - 添加新的数据获取模式
   - 实现fallback机制
   - 增加错误处理

2. **更新Quiz.ts**:
   - 修改元素选择器
   - 添加类型检测
   - 实现多策略处理

3. **更新接口定义**:
   - 检查QuizData接口是否需要更新
   - 添加新的数据字段

### 步骤3: 测试验证

1. **单元测试**:
   ```bash
   # 测试新的数据获取方法
   npm run debug-quiz "quiz-url-1"
   npm run debug-quiz "quiz-url-2"
   ```

2. **集成测试**:
   ```bash
   # 运行完整脚本测试
   npm run dev
   ```

3. **边界测试**:
   - 测试不同类型的Quiz
   - 测试网络异常情况
   - 测试页面加载失败情况

## 📋 常见适配场景

### 场景1: 数据源变更

**问题**: 从`_w.rewardsQuizRenderInfo`改为`window.quizData`

**解决方案**:
```typescript
// 在scriptPatterns数组中添加新模式
{ name: 'window.quizData', regex: /window\.quizData\s*=\s*({.*?});/s }
```

### 场景2: DOM结构重构

**问题**: 答案按钮从`#rqAnswerOption0`改为`[data-answer="0"]`

**解决方案**:
```typescript
// 更新选择器策略
const answerSelector = await page.waitForSelector(
    `#rqAnswerOption${i}, [data-answer="${i}"], .quiz-answer-${i}`,
    { timeout: 10000 }
)
```

### 场景3: AJAX加载数据

**问题**: Quiz数据通过异步请求加载

**解决方案**:
```typescript
// 等待数据加载完成
await page.waitForFunction(() => 
    window.quizData && window.quizData.maxQuestions > 0,
    { timeout: 15000 }
)
```

### 场景4: 单页应用(SPA)结构

**问题**: 页面使用React/Vue等SPA框架

**解决方案**:
```typescript
// 等待组件渲染完成
await page.waitForSelector('[data-testid="quiz-container"]', { 
    state: 'visible',
    timeout: 15000 
})

// 使用更稳定的等待策略
await page.waitForFunction(() => {
    const container = document.querySelector('[data-testid="quiz-container"]')
    return container && container.children.length > 0
})
```

## 🚨 故障排除

### 常见错误及解决方案

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `Script containing quiz data not found` | 数据源选择器失效 | 更新scriptPatterns |
| `Element not found: #rqStartQuiz` | DOM选择器变更 | 添加新的选择器fallback |
| `Quiz data extraction failed` | 页面结构大幅变化 | 使用API拦截方法 |
| `Timeout waiting for quiz refresh` | 页面交互逻辑变更 | 更新等待策略 |

### 调试技巧

1. **启用详细日志**:
   ```bash
   DEBUG=1 npm run dev
   ```

2. **保存页面快照**:
   ```typescript
   await page.screenshot({ path: 'quiz-debug.png', fullPage: true })
   await fs.writeFile('quiz-debug.html', await page.content())
   ```

3. **监控网络请求**:
   ```typescript
   page.on('response', response => {
       console.log(`${response.status()} ${response.url()}`)
   })
   ```

## 🔄 持续维护

### 自动监控

考虑实现自动检测机制：
```typescript
async function detectQuizChanges(): Promise<boolean> {
    // 定期检查关键选择器是否仍然有效
    // 如果检测到变化，发送通知
}
```

### 版本兼容

维护多版本兼容性：
```typescript
const QUIZ_STRATEGIES = {
    'v1': { /* 传统方法 */ },
    'v2': { /* 新方法 */ },
    'v3': { /* 最新方法 */ }
}
```

## 📞 获取帮助

1. **查看错误日志**: 检查详细的错误信息
2. **使用调试工具**: `npm run debug-quiz <url>`
3. **保存调试信息**: 分析`quiz-debug-info.json`文件
4. **提交Issue**: 包含错误日志和调试信息

---

**记住**: Quiz页面适配是一个持续的过程，需要根据Microsoft的更新及时调整策略。保持代码的灵活性和可扩展性是关键。 